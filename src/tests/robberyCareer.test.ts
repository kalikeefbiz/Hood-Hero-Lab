import { repairError } from "../systems/Quanny";
import { baseline, newExchanges } from "../ui/exchanges";
import { splitStack } from "../systems/Inventory";
import { advanceConflicts } from "../systems/Danger";
import { giveItem } from "../systems/InventoryExchanges";
import { describe, it, expect } from "vitest";
import { newGame } from "./legacyGame";
import { type GameState, player, cash } from "../core/GameState";
import { presenceOf } from "../board/presence";
import { boardPeople } from "../board/people";
import { LOCATIONS } from "../board/locations";
import { connect } from "../systems/Relationships";
import {
  ROBBERY_TARGETS,
  ROBBERY_BALANCE as B,
} from "../content/robberyCareer";
import {
  offerTarget,
  offerCareerLead,
  inviteRobbery,
  careerStartError,
  careerChance,
  takeLoot,
  tryDial,
  sellProperty,
  pawnQuote,
  dispositionError,
  tickRobberyCareer,
  answerExtortion,
  payCrewClaim,
  opportunityError,
} from "../systems/RobberyCareer";
import {
  purchasePrep,
  PREPARATION,
  startRobbery,
  robberyInput,
  leaveRobbery,
  pauseRobbery,
  robberyStartError,
} from "../systems/Robbery";
import { skillsOf, skillRank } from "../systems/Skills";
import {
  gain,
  receivePhysical,
  inventoryOf,
  syncCarried,
  characterCapacity,
} from "../systems/Inventory";
import { arrest } from "../systems/Incarceration";
import { acquire } from "../systems/StreetEconomy";
import { buyProperty, deposit, RESIDENCES } from "../systems/Residences";
import { serialize, deserialize } from "../persistence/SaveSystem";
import { interruptSession } from "../systems/SessionLifecycle";
import {
  ok,
  at,
  person,
  base,
  shop,
  ranks,
  crew,
  begin,
  input,
  won,
  finish,
} from "./robberyFixtures";
describe("GOAL013 City robberies", () => {
  it.each(ROBBERY_TARGETS.filter((t) => t.kind === "strong-arm"))(
    "$id is local, finite daily, no required puzzle and $25–75 cash",
    (t) => {
      let s = shop(base(8));
      at(s, t.location);
      s = begin(s, t.id);
      const a = s.activeRobbery!,
        raw = serialize(s),
        ap = s.ap;
      expect(startRobbery(s, a.jobId).state).toBe(s);
      s = deserialize(raw);
      expect(s.activeRobbery!.career).toEqual(a.career);
      s = finish(won(s));
      expect(s.robberies!.history[0].loot).toBeGreaterThanOrEqual(25);
      expect(s.robberies!.history[0].loot).toBeLessThanOrEqual(75);
      expect(s.ap).toBe(ap);
      expect(opportunityError(s, t.id)).toMatch(/cooldown/);
      expect(deserialize(serialize(s)).robberies).toEqual(s.robberies);
      expect(s.robberies!.items.gloves).toBe(0);
      expect(input(s, "press")).toBe(s);
    },
  );
  it("off-board APIs, stale taps, pause, hidden/interrupted session, trapping exclusion and partial loot", () => {
    let s = shop(base());
    expect(offerTarget(s, "street.rio")).toMatch(/actual/);
    at(s, "rio.courtyard");
    s = begin(s);
    const a = s.activeRobbery!;
    s = pauseRobbery(s, a.id, true);
    expect(input(s, "patient")).toBe(s);
    s = deserialize(serialize(s));
    s = pauseRobbery(s, a.id, false);
    s = input(won(s), "patient");
    const current = s.activeRobbery!;
    expect(robberyInput(s, a.id, 0, "rush")).toBe(s);
    s = input(s, "leave");
    expect(s.activeRobbery!.loot).toBe(0);
    expect(s.activeRobbery!.cursor).toBeGreaterThan(current.cursor);
    let other = shop(base());
    other.activeSession = { status: "active" } as GameState["activeSession"];
    at(other, "rio.courtyard");
    expect(offerTarget(other, "street.rio")).toMatch(/session/);
  });
  it("all twelve homes use four district locks; D+5 unlock, failure/reload/abandon cannot bypass, legacy remains readable", () => {
    expect(ROBBERY_TARGETS.filter((t) => t.kind === "home")).toHaveLength(12);
    let s = base();
    ranks(s);
    person(s, "dizzy");
    s = ok(offerCareerLead(s, "dizzy", "home.rio.1"));
    const j = s.robberies!.jobs.at(-1)!;
    s = shop(s, "home");
    at(s, j.location);
    expect(robberyStartError(s, j.id)).toMatch(/partner/);
    s = crew(s, j.id);
    at(s, j.location);
    s = startRobbery(s, j.id).state;
    expect(s.activeRobbery?.career?.participants[0].id).toBe("mega");
    s = leaveRobbery(s, s.activeRobbery!.id);
    s = deserialize(serialize(s));
    const day = s.day;
    for (let d = day; d < day + 5; d++) {
      s.day = d;
      expect(opportunityError(s, "home.rio.2")).toMatch(/cooldown/);
    }
    s.day = day + 5;
    expect(opportunityError(s, "home.rio.2")).toMatch(/lead/);
    expect(s.robberyCareer!.cooldowns["home:rio"].nextDay).toBe(day + 5);
    expect(s.robberyCareer!.cooldowns["home:south"]).toBeUndefined();
  });
  it("home reveal/choose/carry/leave has optional bounded dial, equipment matters and exact goods buyout", () => {
    let s = base(81);
    ranks(s);
    person(s, "dizzy");
    s = ok(offerCareerLead(s, "dizzy", "home.reservoir.2"));
    const j = s.robberies!.jobs.at(-1)!;
    s = shop(s, "home");
    s = crew(s, j.id);
    at(s, j.location);
    s = startRobbery(s, j.id).state;
    s = won(s);
    const chance = careerChance(s);
    s.activeRobbery!.career!.participants[0].attack = 0;
    expect(careerChance(s)).toBeLessThan(chance);
    s = input(s, "patient");
    const a = s.activeRobbery!,
      g = a.career!.goods[0];
    s = ok(takeLoot(s, a.id, a.cursor, g.id));
    expect(takeLoot(s, a.id, s.activeRobbery!.cursor, g.id)).toMatch(/already/);
    s = input(s, "search");
    const pc = inventoryOf(s).slots.find((x) => x.itemId === "pc");
    expect(pc).toBeTruthy();
    // Physical load rejects an overfull carrier before moving anything.
    receivePhysical(s, "player", gain("music", 3));
    const g2 = s.activeRobbery!.career!.goods[1];
    const take = takeLoot(s, a.id, s.activeRobbery!.cursor, g2.id);
    if (characterCapacity(s).remainingLoad < 5)
      expect(typeof take).toBe("string");
    s = input(s, "leave");
    expect(s.robberies!.history[0].outcome).toBe("success");
    expect(s.characters.player.equipment!.owned).toContain("law-19");
    const claim = s.robberyCareer!.claims[0];
    expect(claim.amount).toBe(Math.floor(g.value * B.pawnRatio * 0.25));
    person(s, "mega");
    const before = cash(player(s));
    s = ok(payCrewClaim(s, claim.id));
    expect(cash(player(s))).toBe(before - claim.amount);
    expect(typeof payCrewClaim(s, claim.id)).toBe("string");
    expect(deserialize(serialize(s)).robberyCareer).toEqual(s.robberyCareer);
  });
  it.each(["liquor.rio", "liquor.south"])(
    "%s unlocks at rank2, solo cash within bounds, guns survive",
    (id) => {
      let s = base(3);
      ranks(s);
      s = begin(shop(s, "liquor"), id);
      s = finish(won(s));
      expect(s.activeRobbery!.loot).toBeGreaterThanOrEqual(125);
      expect(s.activeRobbery!.loot).toBeLessThanOrEqual(225);
      expect(s.activeRobbery!.career!.participants).toHaveLength(0);
      expect(player(s).equipment!.equipped).toBe("law-19");
    },
  );
  it("rank3 commercial has real coordination and partner requirements; bank stays unavailable", () => {
    let s = base();
    ranks(s, 3);
    person(s, "dizzy");
    s = ok(offerCareerLead(s, "dizzy", "commercial.designer"));
    const j = s.robberies!.jobs.at(-1)!;
    s = shop(s, "store");
    at(s, j.location);
    expect(careerStartError(s, j.id)).toMatch(/partner/);
    s = crew(s, j.id);
    at(s, j.location);
    s = startRobbery(s, j.id).state;
    s = won(s);
    s = input(s, "patient");
    expect(s.activeRobbery!.career!.revealed).toBe(0);
    s = input(s, "coordinate");
    expect(s.activeRobbery!.career!.revealed).toBe(3);
    s = input(s, "press");
    expect(s.activeRobbery!.loot).toBeLessThanOrEqual(750);
    expect(s.activeRobbery!.loot).toBeGreaterThanOrEqual(400);
    s.robberies!.jobs.push({
      ...j,
      id: "bank-test",
      kind: "bank",
      status: "offered",
    });
    expect(robberyStartError(s, "bank-test")).toMatch(/Future/);
  });
  it("named victim stock/cash finite, real provenance/debt; original-owner sell-back creates active PERSONAL beef and cannot repeat", () => {
    let s = base(19);
    ranks(s);
    s = shop(s);
    person(s, "mega");
    s = begin(s, "criminal.mega", "mega");
    s = won(s);
    s = input(s, "patient");
    const a = s.activeRobbery!,
      chain = a.career!.goods.find((g) => g.itemId === "high-chain")!;
    const canonicalProperties = structuredClone(s.properties);
    const ownerCash = cash(s.characters.mega);
    s = ok(takeLoot(s, a.id, a.cursor, chain.id));
    s = input(s, "deescalate");
    expect(cash(s.characters.mega)).toBe(ownerCash - s.activeRobbery!.loot);
    expect(s.properties).toEqual(canonicalProperties);
    expect(chain.itemId).toBe("high-chain");
    person(s, "mega");
    const slot = inventoryOf(s).slots.find(
      (x) => x.provenance === `stolen:${chain.id}`,
    )!;
    const amount = Math.floor(chain.value * B.sellBackRatio);
    s.characters.mega.wallet.clean += 2000;
    const before = cash(player(s));
    s = ok(sellProperty(s, slot.id, "mega"));
    expect(cash(player(s))).toBe(before + amount);
    expect(
      s.danger.conflicts.find((c) => c.participants.includes("mega")),
    ).toMatchObject({ state: "worsening", intent: "seek", scope: "personal" });
    expect(sellProperty(s, slot.id, "mega")).toMatch(/No eligible/);
    expect(deserialize(serialize(s)).robberyCareer).toEqual(s.robberyCareer);
  });
  it("pawn uses one value ratio, physically removes property, same item cannot pawn/return twice", () => {
    let s = base();
    ranks(s);
    s = shop(s);
    person(s, "mega");
    s = begin(s, "criminal.mega", "mega");
    s = input(won(s), "patient");
    const a = s.activeRobbery!,
      g = a.career!.goods.find((g) => g.itemId === "high-chain")!;
    s = ok(takeLoot(s, a.id, a.cursor, g.id));
    s = input(s, "deescalate");
    const x = inventoryOf(s).slots.find(
      (x) => x.provenance === `stolen:${g.id}`,
    )!;
    expect(dispositionError(s, x.id)).toMatch(/Pawn/);
    at(s, "reservoir.pawn");
    const quote = pawnQuote(s, x.id)!;
    expect(quote.price / quote.value).toBeGreaterThanOrEqual(0.55);
    expect(quote.price / quote.value).toBeLessThanOrEqual(0.7);
    s = ok(sellProperty(s, x.id));
    expect(typeof sellProperty(s, x.id)).toBe("string");
    expect(typeof sellProperty(s, x.id, "mega")).toBe("string");
  });
  it("any arrest seizes only carried illegal goods once, unequips; supplier debts, safe and legal prep survive", () => {
    let s = base();
    person(s, "mega");
    acquire(s, "mega", "consignment");
    const debt = s.street.agreements[0].balance;
    receivePhysical(s, "player", gain("law-19"));
    player(s).equipment!.equipped = "law-19";
    receivePhysical(s, "player", gain("gloves"));
    receivePhysical(s, "player", gain("music"));
    const safe = RESIDENCES.find((r) => r.zone === "south")!;
    at(s, safe.location);
    s.ap = 2;
    s = ok(buyProperty(s, safe.id));
    const weapon = inventoryOf(s).slots.find((x) => x.itemId === "law-19")!;
    s = ok(deposit(s, safe.id, weapon.id, 1));
    receivePhysical(s, "player", gain("arp"));
    player(s).equipment!.equipped = null;
    arrest(s, "player", "patrol");
    const seized = s.robberyCareer!.seizures[0];
    expect(
      inventoryOf(s).slots.some(
        (x) => x.kind === "equipment" || x.itemId === "nightgoods",
      ),
    ).toBe(false);
    expect(inventoryOf(s).slots.some((x) => x.itemId === "gloves")).toBe(true);
    expect(s.residences![safe.id].safe.slots).toHaveLength(1);
    expect(s.street.agreements[0].balance).toBe(debt);
    arrest(s, "player", "duplicate");
    expect(s.robberyCareer!.seizures).toHaveLength(1);
    expect(seized.slots.length).toBeGreaterThan(0);
    expect(deserialize(serialize(s)).street.agreements[0].balance).toBe(debt);
  });
  it("rumor demands require local witness, time and actual profit; refusal is personal; overdue shares persist", () => {
    let s = base();
    const npc = boardPeople(s).find(
      (p) =>
        s.characters[p.id].affiliation && s.characters[p.id].home === "south",
    )!;
    const e = s.events[0];
    s.robberyCareer!.rumors.push({
      jobId: "known-job",
      eventId: e.id,
      witness: npc.id,
      zone: "south",
      profit: 200,
      day: s.day,
    });
    tickRobberyCareer(s);
    expect(s.robberyCareer!.extortions).toHaveLength(0);
    s.day++;
    tickRobberyCareer(s);
    const d = s.robberyCareer!.extortions[0];
    expect(d.amount).toBeGreaterThanOrEqual(20);
    expect(d.amount).toBeLessThanOrEqual(40);
    person(s, npc.id);
    s = ok(answerExtortion(s, d.id, false));
    expect(s.danger.conflicts.at(-1)?.scope).toBe("personal");
    expect(typeof answerExtortion(s, d.id, true)).toBe("string");
  });
  it.each([8, 9, 10, 11] as const)(
    "explicit additive v%s migration preserves cash, Chains and inventories",
    (version) => {
      const s = base();
      s.version = version;
      const raw = JSON.parse(serialize(s));
      delete raw.state.robberyCareer;
      raw.version = version;
      const n = deserialize(JSON.stringify(raw));
      expect(n.version).toBe(12);
      expect(n.robberyCareer!.claims).toEqual([]);
      expect(n.characters.player.wallet).toEqual(s.characters.player.wallet);
      expect(n.incidents).toEqual(s.incidents);
    },
  );
  it("interruption abandons selected loot rather than laundering it through background/day changes", () => {
    let s = base();
    s = begin(shop(s));
    s = input(won(s), "patient");
    interruptSession(s, "Day ended");
    expect(s.activeRobbery!.status).toBe("ended");
    expect(s.robberies!.history).toHaveLength(1);
    expect(s.robberies!.history[0].outcome).toBe("failed");
    expect(deserialize(serialize(s)).activeRobbery!.status).toBe("ended");
  });
});

it("stolen Pink Magic debits actual Set stock, creates no victim debt, keeps both original consignment liabilities", () => {
  let s = base(20);
  s.crew.members = ["flacco"];
  person(s, "mega");
  acquire(s, "mega", "consignment");
  const originalDebt = s.street.agreements[0].balance;
  person(s, "flacco");
  const stock = inventoryOf(s).slots.find((x) => x.itemId === "nightgoods")!;
  s = ok(giveItem(s, "flacco", stock.id, 3));
  const setDebt = s.street.agreements[1].balance;
  s = shop(s);
  person(s, "flacco");
  s = begin(s, "criminal.flacco", "flacco");
  s = input(won(s), "patient");
  const a = s.activeRobbery!,
    g = a.career!.goods.find((g) => g.itemId === "nightgoods")!,
    source = s.street.lots.find((l) => l.owner === "flacco")!;
  s = ok(takeLoot(s, a.id, a.cursor, g.id));
  s = input(s, "deescalate");
  expect(s.street.lots.find((l) => l.id === source.id)).toMatchObject({
    remaining: 0,
    lost: 3,
    owed: setDebt,
  });
  expect(s.robberyCareer!.sources.flacco.stock).toBe(0);
  const stolen = s.street.lots.find((l) => l.id === `stolen-lot:${g.id}`)!;
  expect(stolen).toMatchObject({
    owner: "player",
    supplier: "flacco",
    received: 3,
    remaining: 3,
    owed: 0,
    cost: 0,
  });
  expect(s.street.agreements.map((a) => a.balance)).toEqual([
    originalDebt,
    setDebt,
  ]);
  expect(deserialize(serialize(s)).street.lots).toEqual(s.street.lots);
});

it("optional house dial is persisted, limited, and never required to take ordinary loot or finish", () => {
  let s: GameState | undefined;
  for (let seed = 1; seed < 120; seed++) {
    let candidate = base(seed);
    ranks(candidate);
    person(candidate, "dizzy");
    candidate = ok(offerCareerLead(candidate, "dizzy", "home.reservoir.3"));
    const j = candidate.robberies!.jobs.at(-1)!;
    candidate = shop(candidate, "home");
    candidate = crew(candidate, j.id);
    at(candidate, j.location);
    candidate = startRobbery(candidate, j.id).state;
    if (candidate.activeRobbery!.career!.goods.some((g) => g.locked)) {
      s = candidate;
      break;
    }
  }
  if (!s) throw new Error("Missing rare fixture");
  s = input(won(s), "patient");
  s = input(s, "search");
  s = input(s, "search");
  const a = s.activeRobbery!,
    c = a.career!,
    rare = c.goods.find((g) => g.locked)!;
  expect(takeLoot(s, a.id, a.cursor, rare.id)).toMatch(/locked/);
  const seed = c.dial.target;
  for (let i = 0; i < 3; i++) {
    s = ok(tryDial(s, a.id, s.activeRobbery!.cursor, (seed + 50) % 101));
    s = deserialize(serialize(s));
    expect(s.activeRobbery!.career!.dial.target).toBe(seed);
  }
  expect(tryDial(s, a.id, s.activeRobbery!.cursor, seed)).toMatch(
    /No optional/,
  );
  s = ok(takeLoot(s, a.id, s.activeRobbery!.cursor, c.goods[0].id));
  s = input(s, "leave");
  expect(s.robberies!.history[0].outcome).toBe("success");
  expect(
    inventoryOf(s).slots.some((x) => x.provenance === `stolen:${rare.id}`),
  ).toBe(false);
});

it("Set-member arrest removes their equipped gun and carried stock only, one seizure per custody event", () => {
  let s = base();
  s.crew.members = ["flacco"];
  person(s, "mega");
  acquire(s, "mega", "consignment");
  person(s, "flacco");
  s = ok(
    giveItem(
      s,
      "flacco",
      inventoryOf(s).slots.find((x) => x.itemId === "nightgoods")!.id,
      2,
    ),
  );
  const c = s.characters.flacco;
  skillsOf(c).milestones.certified = 1;
  receivePhysical(s, c.id, gain("law-19"));
  c.equipment!.equipped = "law-19";
  receivePhysical(s, c.id, gain("clothing"));
  const owed = s.street.agreements[1].balance;
  const seen = baseline(s);
  arrest(s, c.id, "participation patrol");
  arrest(s, c.id, "duplicate");
  expect(inventoryOf(s, c.id).slots.map((x) => x.itemId)).toEqual(["clothing"]);
  expect(c.equipment!.equipped).toBeNull();
  const projected = newExchanges(s, seen);
  expect(
    projected.exchanges.filter((e) =>
      e.give?.label.startsWith("Confiscated from"),
    ),
  ).toHaveLength(2);
  expect(newExchanges(s, projected.seen).exchanges).toEqual([]);
  expect(s.street.agreements[1].balance).toBe(owed);
  expect(
    s.robberyCareer!.seizures.filter((x) => x.actor === c.id),
  ).toHaveLength(1);
  expect(
    deserialize(serialize(s)).characters.flacco.equipment!.equipped,
  ).toBeNull();
});

it("a paid sell-back requires authored reconciliation; autonomous cooling cannot erase the beef", () => {
  let s = base();
  ranks(s);
  s = shop(s);
  person(s, "mega");
  s = begin(s, "criminal.mega", "mega");
  s = input(won(s), "patient");
  const a = s.activeRobbery!,
    g = a.career!.goods.find((g) => g.itemId === "high-chain")!;
  s = ok(takeLoot(s, a.id, a.cursor, g.id));
  s = input(s, "deescalate");
  person(s, "mega");
  s.characters.mega.wallet.clean = 5000;
  s = ok(
    sellProperty(
      s,
      inventoryOf(s).slots.find((x) => x.itemId === "high-chain")!.id,
      "mega",
    ),
  );
  const beef = s.danger.conflicts.find((c) => c.participants.includes("mega"))!;
  for (let day = 0; day < 100; day++) {
    s.day++;
    advanceConflicts(s);
  }
  expect(beef.state).not.toBe("settled");
  expect(beef.requiresReconciliation).toBe(true);
});

it("v11 active legacy home session preserves its pattern, spent prep, cash and cursor, while adopting the shared district lock", () => {
  let s = base();
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.reservoir.1"));
  const j = s.robberies!.jobs.at(-1)!;
  delete j.targetId;
  j.location = "reservoir.boarded-house";
  s = shop(s, "home");
  at(s, PREPARATION["pattern-token"].location);
  s = purchasePrep(s, "pattern-token", PREPARATION["pattern-token"].location);
  s.ap = 2;
  at(s, j.location);
  s = startRobbery(s, j.id).state;
  s = input(s, "patient");
  s.version = 11;
  delete s.robberyCareer;
  const inventory = structuredClone(s.characters.player.inventory),
    wallet = structuredClone(player(s).wallet),
    pattern = structuredClone(s.activeRobbery!.pattern);
  const loaded = deserialize(serialize(s));
  expect(loaded.activeRobbery!.cursor).toBe(1);
  expect(loaded.activeRobbery!.pattern).toEqual(pattern);
  expect(loaded.characters.player.inventory).toEqual(inventory);
  expect(player(loaded).wallet).toEqual(wallet);
  expect(loaded.robberyCareer!.cooldowns["home:reservoir"].nextDay).toBe(
    loaded.day + 5,
  );
  expect(loaded.robberyCareer!.property).toEqual({});
});

it("an actually equipped stronger partner changes the job chance without conjuring equipment or consuming their firearm", () => {
  let s = base();
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.south.2"));
  const job = s.robberies!.jobs.at(-1)!;
  s = shop(s, "home");
  s = crew(s, job.id);
  at(s, job.location);
  const weak = startRobbery(s, job.id).state;
  const stronger = structuredClone(s);
  expect(receivePhysical(stronger, "mega", gain("law-19-switch"))).toBeNull();
  stronger.characters.mega.equipment!.equipped = "law-19-switch";
  const strong = startRobbery(stronger, job.id);
  expect(strong.error).toBeNull();
  expect(careerChance(strong.state)).toBeGreaterThan(careerChance(weak));
  expect(strong.state.activeRobbery!.career!.participants[0].attack).toBe(5);
  expect(
    inventoryOf(strong.state, "mega").slots.some(
      (x) => x.itemId === "law-19-switch",
    ),
  ).toBe(true);
  expect(
    inventoryOf(strong.state, "mega").slots.some(
      (x) => x.itemId === "gloves" || x.itemId === "mask",
    ),
  ).toBe(false);
});

it("splitting quantity loot cannot multiply its stored total value, pawn proceeds or owner sell-back quote", () => {
  let s: GameState | undefined;
  for (let seed = 1; seed < 100; seed++) {
    let n = base(seed);
    ranks(n);
    n = begin(shop(n), "liquor.rio");
    if (n.activeRobbery!.career!.goods.some((g) => g.quantity === 2)) {
      s = n;
      break;
    }
  }
  if (!s) throw new Error("No quantity fixture");
  s = input(won(s), "patient");
  const a = s.activeRobbery!,
    g = a.career!.goods[0];
  s = ok(takeLoot(s, a.id, a.cursor, g.id));
  s = input(s, "deescalate");
  const slot = inventoryOf(s).slots.find(
    (x) => x.provenance === `stolen:${g.id}`,
  )!;
  at(s, "reservoir.pawn");
  const whole = pawnQuote(s, slot.id)!.price;
  s = ok(splitStack(s, "player", slot.id, 1));
  const parts = inventoryOf(s).slots.filter(
    (x) => x.provenance === slot.provenance,
  );
  expect(parts).toHaveLength(2);
  expect(
    parts.reduce((n, x) => n + pawnQuote(s!, x.id)!.price, 0),
  ).toBeLessThanOrEqual(whole);
  const before = cash(player(s));
  for (const x of parts) s = ok(sellProperty(s, x.id));
  expect(cash(player(s)) - before).toBeLessThanOrEqual(whole);
  expect(deserialize(serialize(s)).robberyCareer).toEqual(s.robberyCareer);
});

it("an unstarted v11 home lead preserves its legacy ID/location but adopts real crew rules on migration", () => {
  let s = base();
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.reservoir.1"));
  const j = s.robberies!.jobs.at(-1)!;
  delete j.targetId;
  j.location = "reservoir.boarded-house";
  s = shop(s, "home");
  at(s, j.location);
  s.version = 11;
  delete s.robberyCareer;
  const loaded = deserialize(serialize(s));
  expect(loaded.robberies!.jobs[0]).toMatchObject({
    id: j.id,
    location: "reservoir.boarded-house",
    targetId: "home.reservoir.1",
  });
  expect(robberyStartError(loaded, j.id)).toMatch(/partner/);
});

it("immediate crew cash split debits the new illicit take exactly, preserving unrelated clean savings", () => {
  let s = base();
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.south.1"));
  const j = s.robberies!.jobs.at(-1)!;
  s = crew(shop(s, "home"), j.id);
  at(s, j.location);
  s = startRobbery(s, j.id).state;
  s = input(won(s), "patient");
  const clean = player(s).wallet.clean,
    memberCash = cash(s.characters.mega);
  s = input(s, "leave");
  const gross = s.activeRobbery!.loot,
    cut = Math.floor(gross * 0.25);
  expect(player(s).wallet.clean).toBe(clean);
  expect(player(s).wallet.illicit).toBe(gross - cut);
  expect(cash(s.characters.mega)).toBe(memberCash + cut);
  expect(s.ledger.at(-1)).toMatchObject({
    amount: -cut,
    provenance: "illicit",
    reason: "Robbery crew cash share",
  });
  expect(deserialize(serialize(s)).characters.player.wallet).toEqual(
    player(s).wallet,
  );
});

it("targeting Quanny uses his authored business-block baseline; old earned evidence cannot instantly reopen it", () => {
  let s = base();
  ranks(s);
  s = shop(s);
  connect(s, "player", "quanny");
  s.characters.quanny.relationships.player.trust = 55;
  person(s, "quanny");
  s.quanny.met = true;
  s.quanny.meetingDay = s.day;
  s.quanny.location = s.presence!.location;
  s.quanny.business = "open";
  player(s).organizationStanding.blocks = 65;
  s = begin(s, "criminal.quanny", "quanny");
  expect(s.quanny.business).toBe("blocked");
  expect(s.quanny.blockedDay).toBe(s.day);
  expect(s.quanny.repairBaseline).toBeGreaterThan(0);
  expect(repairError(s)).toMatch(/meaningful/);
  s = leaveRobbery(s, s.activeRobbery!.id);
  s.day++;
  expect(repairError(s)).toMatch(/meaningful/);
  expect(deserialize(serialize(s)).quanny.repairBaseline).toBe(
    s.quanny.repairBaseline,
  );
});

it("occasional Set initiative shares an optional local lead only with a real trusted member physically present; no XP, AP, cash or obligation", () => {
  const s = base();
  ranks(s);
  s.crew.members = ["mega"];
  s.day = 10;
  person(s, "mega");
  const beforeXP = skillsOf(player(s)).xp.robbery,
    beforeCash = cash(player(s)),
    beforeAP = s.ap;
  tickRobberyCareer(s);
  const job = s.robberies!.jobs[0];
  expect(job).toMatchObject({
    kind: "home",
    source: "mega",
    status: "offered",
  });
  expect(job.targetId).toMatch(/^home.south./);
  expect(skillsOf(player(s)).xp.robbery).toBe(beforeXP);
  expect(cash(player(s))).toBe(beforeCash);
  expect(s.ap).toBe(beforeAP);
  expect(s.robberyCareer!.invitations).toEqual([]);
  tickRobberyCareer(s);
  expect(s.robberies!.jobs).toHaveLength(1);
  expect(deserialize(serialize(s)).robberies).toEqual(s.robberies);
  const remote = base();
  ranks(remote);
  remote.crew.members = ["mega"];
  remote.day = 10;
  at(remote, "downtown.designer-drop");
  tickRobberyCareer(remote);
  expect(remote.robberies?.jobs ?? []).toEqual([]);
});
