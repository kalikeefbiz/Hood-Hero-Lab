import { resolveStreetScene } from "../systems/Danger";
import { describe, it, expect } from "vitest";
import { newGame } from "./legacyGame";
import { newGame as fresh } from "../core/Simulation";
import { type GameState, player, cash } from "../core/GameState";
import {
  receivePhysical,
  gain,
  inventoryOf,
  capacityOf,
  canFit,
  usedLoad,
  splitStack,
  moveSlot,
  mergeStack,
  carriedLotQuantity,
  gainError,
  newInventoryState,
} from "../systems/Inventory";
import {
  giveItem,
  takeItem,
  discardItem,
  claimOverflow,
  equipItem,
  heistReadiness,
  inviteHeist,
  loseCarried,
  collectSetConsignment,
} from "../systems/InventoryExchanges";
import {
  RESIDENCES,
  buyProperty,
  deposit,
  withdraw,
  releaseProperty,
} from "../systems/Residences";
import { boardPeople } from "../board/people";
import { presenceOf } from "../board/presence";
import {
  acquire,
  supplierError,
  saleLot,
  transactionChance,
  repay,
  transact,
} from "../systems/StreetEconomy";
import { equipmentBonus } from "../systems/Equipment";
import {
  purchasePrep,
  purchasePrepError,
  robberyStartError,
} from "../systems/Robbery";
import { serialize, deserialize } from "../persistence/SaveSystem";
import { giveFlaccoStock } from "../systems/StreetLife";
import { skillsOf } from "../systems/Skills";
import { advanceDay } from "../core/TimeSystem";
import { respondEncounter } from "../systems/Encounters";
import { FLACCO_GIFT } from "../content/streetLifeEncounters";
import { validateAction, performAction } from "../core/ActionEngine";
import { oneBuyer } from "./sessionFixtures";
const ok = (s: GameState | string): GameState => {
  if (typeof s === "string") throw new Error(s);
  return s;
};
function base() {
  const s = newGame("Inventory", "south", 2026);
  s.encounters.forEach((e) => (e.status = "closed"));
  s.characters.player.wallet.clean = 10000;
  return s;
}
function at(s: GameState, location: string) {
  s.presence = {
    ...presenceOf(s),
    location,
    zone:
      RESIDENCES.find((r) => r.id === location)?.zone ??
      s.characters.player.home,
  };
}
function meet(s: GameState, id = "flacco") {
  at(s, boardPeople(s).find((n) => n.id === id)!.placeId);
}
function stock(s: GameState, qty = 6) {
  const l = {
    id: `lot-${s.nextId++}`,
    category: "nightgoods",
    owner: s.playerId,
    supplier: "mega",
    zone: "south" as const,
    received: qty,
    remaining: qty,
    lost: 0,
    cost: 0,
    expectedGross: qty * 25,
    collected: 0,
    owed: 0,
    paid: 0,
    losses: 0,
    crewPaid: 0,
    dueDay: s.day + 6,
    acquiredDay: s.day,
    arrangement: "cash" as const,
    status: "held" as const,
  };
  s.street.lots.push(l);
  expect(
    receivePhysical(s, s.playerId, gain("nightgoods", qty, l.id, l.id)),
  ).toBeNull();
  return l;
}
function rank(s: GameState, id: string) {
  skillsOf(s.characters[id]).xp.combat = 1500;
  skillsOf(s.characters[id]).milestones.certified = 1;
  skillsOf(s.characters[id]).milestones.violentSuccess = 12;
}
describe("GOAL 012 dual capacity and physical inventory", () => {
  it("enforces independent 12/20, 8/15, 24/40 boundaries and quantity load", () => {
    const s = base();
    const l = stock(s, 20);
    expect(inventoryOf(s).slots.map((x) => x.quantity)).toEqual([10, 10]);
    expect(capacityOf(inventoryOf(s))).toMatchObject({
      usedSlots: 2,
      usedLoad: 20,
      maxSlots: 12,
      maxLoad: 20,
    });
    expect(gainError(s, s.playerId, gain("mask"))).toBe(
      "Need 1 more load capacity.",
    );
    expect(carriedLotQuantity(s, s.playerId, l.id)).toBe(20);
    expect(receivePhysical(s, "flacco", gain("smokes", 15))).toBeNull();
    expect(capacityOf(inventoryOf(s, "flacco"), "member")).toMatchObject({
      maxSlots: 8,
      maxLoad: 15,
      usedLoad: 15,
    });
    expect(gainError(s, "flacco", gain("mask"))).toContain("load");
    const fullSlots = {
      slots: Array.from({ length: 12 }, (_, i) => ({
        ...gain("mask", 1, `p${i}`),
        id: `x${i}`,
      })),
    } as ReturnType<typeof inventoryOf>;
    expect(canFit(fullSlots, gain("mask"))).toBe("No free slots.");
    const safe = {
      slots: Array.from({ length: 4 }, (_, i) => ({
        ...gain("nightgoods", 10, "l", "l"),
        id: `x${i}`,
      })),
    } as ReturnType<typeof inventoryOf>;
    expect(capacityOf(safe, "safe")).toMatchObject({
      remainingSlots: 20,
      usedLoad: 40,
    });
    expect(canFit(safe, gain("mask"), "safe")).toContain("load");
    expect(canFit({ slots: [] }, gain("arp", 4))).toContain("4 more load");
  });
  it("splits, merges, swaps and preserves lot and provenance without mutating rejected operations", () => {
    let s = base();
    stock(s, 12);
    const first = inventoryOf(s).slots[0].id;
    s = ok(splitStack(s, s.playerId, first, 4, "split-1"));
    expect(splitStack(s, s.playerId, first, 4, "split-1")).toBe(s);
    expect(inventoryOf(s).slots.map((x) => x.quantity)).toEqual([6, 2, 4]);
    const second = inventoryOf(s).slots[1].id,
      third = inventoryOf(s).slots[2].id;
    s = ok(mergeStack(s, s.playerId, second, third));
    expect(inventoryOf(s).slots.map((x) => x.quantity)).toEqual([6, 6]);
    expect(mergeStack(s, s.playerId, first, third)).toBe(
      "Stack limit reached.",
    );
    stock(s, 1);
    expect(
      mergeStack(s, s.playerId, first, inventoryOf(s).slots.at(-1)!.id),
    ).toContain("lots");
    expect(usedLoad(inventoryOf(s))).toBe(13);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("validates purchases, supplier reups and prep before charging cash/AP/debt", () => {
    const s = base();
    stock(s, 20);
    const before = serialize(s);
    expect(
      validateAction(s, { actor: s.playerId, type: "buy", item: "smokes" }),
    ).toContain("load");
    expect(
      performAction(s, { actor: s.playerId, type: "buy", item: "smokes" })
        .state,
    ).toBe(s);
    const connected = serialize(s);
    expect(supplierError(s, "mega", "consignment")).toContain("load");
    acquire(s, "mega", "consignment");
    expect(serialize(s)).toBe(connected);
    at(s, "south.food-mart");
    expect(purchasePrepError(s, "gloves", "south.food-mart")).toContain("load");
    expect(purchasePrep(s, "gloves", "south.food-mart")).toBe(s);
  });
  it("checks City co-presence and receiver capacity before giving, then applies carried member equipment once", () => {
    let s = base();
    receivePhysical(s, s.playerId, gain("law-19"));
    rank(s, "flacco");
    at(s, "downtown.docks");
    expect(giveItem(s, "flacco", inventoryOf(s).slots[0].id, 1)).toContain(
      "Find",
    );
    meet(s);
    receivePhysical(s, "flacco", gain("smokes", 15));
    const before = serialize(s);
    expect(giveItem(s, "flacco", inventoryOf(s).slots[0].id, 1)).toContain(
      "3 more load",
    );
    expect(serialize(s)).toBe(before);
    s.characters.flacco.inventory = { slots: [] };
    s.characters.flacco.possessions = [];
    const chance = transactionChance(s, s.playerId, "south", "flacco");
    s = ok(giveItem(s, "flacco", inventoryOf(s).slots[0].id, 1, "weapon-1"));
    expect(giveItem(s, "flacco", "stale", 1, "weapon-1")).toBe(s);
    s = ok(equipItem(s, "flacco", "law-19"));
    expect(equipmentBonus(s.characters.flacco).attack).toBe(2);
    expect(usedLoad(inventoryOf(s, "flacco"))).toBe(3);
    expect(transactionChance(s, s.playerId, "south", "flacco")).toBeGreaterThan(
      chance,
    );
    expect(
      heistReadiness(s, "flacco", { equipped: "law-19", combatRank: 2 }),
    ).toBeNull();
    expect(typeof inviteHeist(s, "flacco", { equipped: "law-19" })).toBe(
      "object",
    );
    s = ok(takeItem(s, "flacco", inventoryOf(s, "flacco").slots[0].id, 1));
    expect(equipmentBonus(s.characters.flacco).attack).toBe(0);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("consigns Set stock without cash reserve; returns only unsold stock and preserves supplier debts", () => {
    let s = base();
    acquire(s, "mega", "consignment");
    meet(s);
    const supplier = s.street.agreements[0],
      original = supplier.balance;
    const cashBefore = cash(s.characters.flacco);
    s = ok(giveItem(s, "flacco", inventoryOf(s).slots[0].id, 4));
    expect(cash(s.characters.flacco)).toBe(cashBefore);
    expect(s.street.agreements[1].setConsignment).toBe(true);
    expect(s.street.agreements[0].balance).toBe(original);
    expect(s.street.lots[0].transferred).toBe(4);
    expect(deserialize(serialize(s))).toEqual(s);
    s = ok(takeItem(s, "flacco", inventoryOf(s, "flacco").slots[0].id, 2));
    expect(s.street.agreements[1].balance).toBe(30);
    expect(s.street.agreements[0].balance).toBe(original);
    expect(deserialize(serialize(s))).toEqual(s);
    expect(collectSetConsignment(s, s.street.agreements[1].id)).toContain(
      "Collect on day",
    );
    s.day = s.street.agreements[1].dueDay;
    meet(s);
    s = ok(collectSetConsignment(s, s.street.agreements[1].id));
    expect(s.street.agreements[1].balance).toBe(0);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("isolates safes, requires physical travel, unequips deposits, rejects loaded destinations and nonempty release", () => {
    let s = base();
    const a = RESIDENCES[0],
      b = RESIDENCES[1];
    at(s, a.id);
    s = ok(buyProperty(s, a.id));
    stock(s, 20);
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 10));
    expect(carriedLotQuantity(s, s.playerId, s.street.lots[0].id)).toBe(10);
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 10));
    expect(saleLot(s)).toBeUndefined();
    stock(s, 20);
    for (const x of [...inventoryOf(s).slots])
      s = ok(deposit(s, a.id, x.id, x.quantity));
    expect(capacityOf(s.residences![a.id].safe, "safe").usedLoad).toBe(40);
    receivePhysical(s, s.playerId, gain("mask"));
    expect(deposit(s, a.id, inventoryOf(s).slots[0].id, 1)).toContain("load");
    expect(releaseProperty(s, a.id)).toContain("Empty");
    at(s, b.id);
    s = ok(buyProperty(s, b.id));
    expect(s.residences![b.id].safe.slots).toHaveLength(0);
    expect(
      withdraw(s, a.id, s.residences![a.id].safe.slots[0].id, 1),
    ).toContain("Stand");
    at(s, a.id);
    s = ok(withdraw(s, a.id, s.residences![a.id].safe.slots[0].id, 10));
    expect(usedLoad(inventoryOf(s))).toBe(11);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("discards unpaid stock visibly, durably and without erasing debts; personal loss never touches safe", () => {
    let s = base();
    acquire(s, "mega", "consignment");
    const a = RESIDENCES[0];
    at(s, a.id);
    s = ok(buyProperty(s, a.id));
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 2));
    const balance = s.street.agreements[0].balance;
    const slot = inventoryOf(s).slots[0].id;
    s = ok(discardItem(s, slot, 2, presenceOf(s).location, "discard-1"));
    expect(discardItem(s, slot, 2, presenceOf(s).location, "discard-1")).toBe(
      s,
    );
    expect(s.street.lots[0].lost).toBe(2);
    expect(s.street.agreements[0].balance).toBe(balance);
    expect(s.inventory!.history.at(-1)!.action).toBe("discarded");
    loseCarried(s, s.playerId, slot, 2, "confiscated");
    expect(s.residences![a.id].safe.slots[0].quantity).toBe(2);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  for (const version of [8, 9, 10] as const)
    it(`migrates v${version} over slot/load limits exactly; overflow is inert and recoverable`, () => {
      const s = base();
      s.version = version;
      const l = stock(s, 20);
      l.remaining = l.received = 55;
      l.expectedGross = 1375;
      player(s).possessions = Array(15).fill("music");
      player(s).equipment = { owned: ["arp"], equipped: "arp" };
      delete s.inventory;
      delete s.residences;
      for (const c of Object.values(s.characters)) delete c.inventory;
      let n = deserialize(serialize(s));
      expect(n.version).toBe(12);
      expect(n.characters.player.equipment!.equipped).toBe("arp");
      expect(usedLoad(inventoryOf(n))).toBeLessThanOrEqual(20);
      const overflow = n.inventory!.overflow.player;
      expect(
        overflow
          .filter((x) => x.kind === "merchandise")
          .reduce((q, x) => q + x.quantity, 0) +
          carriedLotQuantity(n, n.playerId, l.id),
      ).toBe(55);
      expect(saleLot(n)).toBeUndefined();
      expect(deserialize(serialize(n))).toEqual(n);
      const a = RESIDENCES[0];
      at(n, a.id);
      n = ok(buyProperty(n, a.id));
      const goods = overflow.find((x) => x.kind === "merchandise")!;
      n = ok(claimOverflow(n, n.playerId, goods.id, 10, a.id));
      expect(n.residences![a.id].safe.slots[0].quantity).toBe(10);
      expect(deserialize(serialize(n))).toEqual(n);
    });
  it("leaves a full-capacity tutorial gift pending and grants it exactly once after space is freed", () => {
    let s = fresh("Tutorial", "south");
    s.day = 3;
    s.streetLife!.initialDecision = "promise";
    s.encounters.forEach((e) => (e.status = "closed"));
    stock(s, 20);
    const before = s.nextId;
    giveFlaccoStock(s);
    expect(s.streetLife!.giftLot).toBeUndefined();
    expect(s.nextId).toBe(before);
    expect(FLACCO_GIFT.trigger(s)).toEqual([]);
    s = ok(
      discardItem(s, inventoryOf(s).slots[0].id, 6, presenceOf(s).location),
    );
    giveFlaccoStock(s);
    const id = s.streetLife!.giftLot;
    expect(id).toBeTruthy();
    giveFlaccoStock(s);
    expect(s.street.lots.filter((l) => l.id === id)).toHaveLength(1);
    expect(usedLoad(inventoryOf(s))).toBe(20);
  });
});

describe("GOAL 012 integration and storage balance", () => {
  it("keeps stacked sales on person and reconciles sold Set consignment debt after a partial return", () => {
    let s = base();
    stock(s, 12);
    const a = RESIDENCES.find((r) => r.zone === "south")!;
    at(s, a.id);
    s = ok(buyProperty(s, a.id));
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 10));
    for (let i = 0; i < 8 && saleLot(s); i++) {
      s.ap = 2;
      s.day++;
      s = oneBuyer(s, "south");
      if (player(s).status !== "active") player(s).status = "active";
    }
    expect(s.street.lots[0].remaining).toBe(10);
    expect(s.residences![a.id].safe.slots[0].quantity).toBe(10);
    expect(saleLot(s)).toBeUndefined();
    expect(deserialize(serialize(s))).toEqual(s);
    at(s, a.id);
    s = ok(withdraw(s, a.id, s.residences![a.id].safe.slots[0].id, 6));
    meet(s);
    s = ok(giveItem(s, "flacco", inventoryOf(s).slots[0].id, 6));
    const child = s.street.lots[1];
    // Set actor's existing sale resolver consumes its physical stack, never the parent's safe stock.
    s.characters.flacco.neighborhoodStanding.south = 30;
    for (let seed = 1; seed < 100; seed++) {
      const probe = structuredClone(s);
      probe.rng = seed;
      transact(probe, "flacco", "south");
      if (
        probe.characters.flacco.status === "active" &&
        probe.street.lots[1].remaining < 6
      ) {
        s = probe;
        break;
      }
    }
    expect(s.street.lots[1].remaining).toBeLessThan(6);
    const remaining = s.street.lots[1].remaining;
    meet(s);
    if (remaining)
      s = ok(
        takeItem(s, "flacco", inventoryOf(s, "flacco").slots[0].id, remaining),
      );
    expect(s.street.agreements[0].balance).toBe((6 - remaining) * 15);
    expect(s.residences![a.id].safe.slots[0].quantity).toBe(4);
    expect(deserialize(serialize(s))).toEqual(s);
  });
});

describe("long-running capacity tradeoffs", () => {
  it("simulates 30/60/180 days with two independent property safes and bounded stock", () => {
    let s = base(),
      rejected = 0,
      discarded = 0,
      accepted = 0;
    const residences = RESIDENCES.slice(0, 2);
    for (const r of residences) {
      at(s, r.id);
      s = ok(buyProperty(s, r.id));
    }
    for (let day = 1; day <= 180; day++) {
      s.day = day;
      s.ap = 2;
      s.factions.backstreet.resources = Math.max(
        90,
        s.factions.backstreet.resources,
      ); // replenishing vendor scenario
      // Existing lawful gig resolver funds repeated supply; no free overflow or infinite stack.
      const gig = performAction(s, { actor: s.playerId, type: "gig" });
      if (!gig.error) s = gig.state;
      for (const scene of s.danger.scenes.filter((x) => x.status === "open"))
        resolveStreetScene(s, scene, "listen");
      s.encounters.forEach((e) => (e.status = "closed")); // isolate storage balance from narrative presentation
      at(s, residences[day % 2].id);
      const safe = s.residences![residences[day % 2].id].safe;
      for (const x of [...inventoryOf(s).slots]) {
        const result = deposit(s, residences[day % 2].id, x.id, x.quantity);
        if (typeof result !== "string") s = result;
      }
      const before = serialize(s),
        error = supplierError(s, "mega", "cash");
      if (error?.includes("capacity") || error?.includes("slots")) {
        acquire(s, "mega", "cash");
        expect(serialize(s)).toBe(before);
        rejected++;
      } else if (!error) {
        acquire(s, "mega", "cash");
        accepted++;
      }
      // Make an explicit choice when both safes and person are full; no free extra storage.
      if (day % 7 === 0 && inventoryOf(s).slots.length) {
        const x = inventoryOf(s).slots[0];
        s = ok(discardItem(s, x.id, x.quantity, presenceOf(s).location));
        discarded += x.quantity;
      }
      for (const r of residences)
        expect(
          capacityOf(s.residences![r.id].safe, "safe").usedLoad,
        ).toBeLessThanOrEqual(40);
      expect(usedLoad(inventoryOf(s))).toBeLessThanOrEqual(20);
      expect(s.inventory!.overflow).toEqual({});
      if ([30, 60, 180].includes(day)) {
        expect(accepted).toBeGreaterThan(10);
        expect(rejected).toBeGreaterThan(0);
        expect(discarded).toBeGreaterThan(0);
        expect(deserialize(serialize(s))).toEqual(s);
        console.log(
          `INVENTORY ${day} days: ${accepted} packs accepted, ${rejected} capacity refusals, ${discarded} units voluntarily discarded; safes ${Object.values(
            s.residences!,
          )
            .map((r) => usedLoad(r.safe))
            .join("/")}`,
        );
      }
    }
  });
});

describe("gain retries and robbery preparation", () => {
  it("keeps rejected story equipment retryable and prevents reclaiming the same reward after transfer", async () => {
    const { record } = await import("../core/EventLog");
    const { grantEquipment, grantEquipmentError } =
      await import("../systems/Equipment");
    let s = base();
    stock(s, 20);
    const e = record(s, "system", "Authored gear fixture", [s.playerId]);
    const before = serialize(s);
    expect(grantEquipmentError(s, s.playerId, "law-19", e.id)).toContain(
      "load",
    );
    expect(grantEquipment(s, s.playerId, "law-19", e.id)).toBe(false);
    expect(serialize(s)).toBe(before);
    s = ok(
      discardItem(s, inventoryOf(s).slots[0].id, 3, presenceOf(s).location),
    );
    expect(grantEquipment(s, s.playerId, "law-19", e.id)).toBe(true);
    meet(s);
    s = ok(
      giveItem(
        s,
        "flacco",
        inventoryOf(s).slots.find((x) => x.itemId === "law-19")!.id,
        1,
      ),
    );
    expect(grantEquipment(s, s.playerId, "law-19", e.id)).toBe(false);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("keeps stored prep unavailable for robbery and reconciles a discarded purchased prep item", () => {
    let s = base();
    at(s, "south.food-mart");
    s = purchasePrep(s, "gloves", "south.food-mart");
    const a = RESIDENCES.find((r) => r.zone === "south")!;
    at(s, a.id);
    s = ok(buyProperty(s, a.id));
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 1));
    s.robberies!.jobs.push({
      id: "prep-job",
      kind: "strong-arm",
      source: "flacco",
      location: "rio.courtyard",
      createdDay: s.day,
      expiresDay: s.day + 6,
      status: "offered",
    });
    s.ap = 2;
    at(s, "rio.courtyard");
    expect(robberyStartError(s, "prep-job")).toContain("Gloves");
    at(s, a.id);
    s = ok(withdraw(s, a.id, s.residences![a.id].safe.slots[0].id, 1));
    s = ok(
      discardItem(s, inventoryOf(s).slots[0].id, 1, presenceOf(s).location),
    );
    expect(s.robberies!.items.gloves).toBe(0);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("migrates excess distinct lots by slots even when load remains, and retrieves only fitting portions", () => {
    const s = base();
    for (let i = 0; i < 12; i++) stock(s, 1);
    const raw = JSON.parse(serialize(s));
    raw.version = raw.state.version = 10;
    for (let i = 0; i < 3; i++) {
      const l = { ...raw.state.street.lots[0], id: `old-extra-${i}` };
      raw.state.street.lots.push(l);
    }
    const n = deserialize(JSON.stringify(raw));
    expect(capacityOf(inventoryOf(n))).toMatchObject({
      usedSlots: 12,
      usedLoad: 12,
    });
    expect(n.inventory!.overflow.player).toHaveLength(3);
    const before = serialize(n);
    expect(
      claimOverflow(n, n.playerId, n.inventory!.overflow.player[0].id, 1),
    ).toBe("No free slots.");
    expect(serialize(n)).toBe(before);
  });
});

describe("slot boundaries and compatibility projections", () => {
  it("rejects a ninth member slot and a twenty-fifth safe slot with load remaining", () => {
    for (const [type, count] of [
      ["member", 8],
      ["safe", 24],
    ] as const) {
      const inv = {
        slots: Array.from({ length: count }, (_, i) => ({
          ...gain("smokes", 1, `distinct-${i}`),
          id: `boundary-${i}`,
        })),
      } as ReturnType<typeof inventoryOf>;
      expect(capacityOf(inv, type).remainingLoad).toBeGreaterThan(0);
      expect(canFit(inv, gain("smokes"), type)).toBe("No free slots.");
    }
  });
  it("round-trips possessions after splitting, merging and swapping", () => {
    let s = base();
    receivePhysical(s, s.playerId, gain("smokes", 4));
    receivePhysical(s, s.playerId, gain("music"));
    const first = inventoryOf(s).slots[0].id;
    s = ok(splitStack(s, s.playerId, first, 2));
    expect(deserialize(serialize(s))).toEqual(s);
    const last = inventoryOf(s).slots.at(-1)!.id;
    s = ok(mergeStack(s, s.playerId, last, first));
    expect(deserialize(serialize(s))).toEqual(s);
    s = ok(moveSlot(s, s.playerId, first, 1));
    expect(deserialize(serialize(s))).toEqual(s);
  });
});

describe("stored equipment and migrated prep", () => {
  it("deposits unequip gear and withdrawal requires explicitly equipping it again", () => {
    let s = base();
    rank(s, s.playerId);
    receivePhysical(s, s.playerId, gain("law-19"));
    s = ok(equipItem(s, s.playerId, "law-19"));
    const a = RESIDENCES[0];
    at(s, a.id);
    s = ok(buyProperty(s, a.id));
    s = ok(deposit(s, a.id, inventoryOf(s).slots[0].id, 1));
    expect(equipmentBonus(player(s)).attack).toBe(0);
    expect(player(s).equipment!.equipped).toBeNull();
    expect(usedLoad(inventoryOf(s))).toBe(0);
    s = ok(withdraw(s, a.id, s.residences![a.id].safe.slots[0].id, 1));
    expect(equipmentBonus(player(s)).attack).toBe(0);
    s = ok(equipItem(s, s.playerId, "law-19"));
    expect(equipmentBonus(player(s)).attack).toBe(2);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("migrates prep beyond load to inert overflow, preserving its purchase ledger and exact recovery", () => {
    let s = base();
    at(s, "south.food-mart");
    s = purchasePrep(s, "gloves", "south.food-mart");
    const lot = stock(s, 19);
    lot.remaining = lot.received = 20;
    lot.expectedGross = 500;
    player(s).possessions = []; // v10 stored prep only in robberies.items, not possessions
    s.version = 10;
    s = deserialize(serialize(s));
    expect(s.robberies!.items.gloves).toBe(1);
    expect(inventoryOf(s).slots.some((x) => x.itemId === "gloves")).toBe(false);
    const prep = s.inventory!.overflow.player.find(
      (x) => x.itemId === "gloves",
    )!;
    expect(prep.quantity).toBe(1);
    expect(claimOverflow(s, s.playerId, prep.id, 1)).toContain("load");
    s = ok(
      discardItem(s, inventoryOf(s).slots[0].id, 1, presenceOf(s).location),
    );
    s = ok(claimOverflow(s, s.playerId, prep.id, 1));
    expect(s.robberies!.items.gloves).toBe(1);
    expect(deserialize(serialize(s))).toEqual(s);
  });
});
