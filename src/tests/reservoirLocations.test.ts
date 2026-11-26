import { describe, expect, it } from "vitest";
import {
  executeLocationAction,
  queryLocation,
  RESERVOIR_LOCATION_IDS,
  resolveReservoirLocation,
  validateLocationAction,
  type LocationCommand,
  type LocationContext,
} from "../city/LocationInteractions";
import { record } from "../core/EventLog";
import { addGrievance, expose } from "../systems/Danger";
import { dismissEncounter, syncEncounters } from "../systems/Encounters";
import { frontMerchandise } from "../systems/Consignment";
import { ITEMS } from "../content/economy";
import { player, type GameState } from "../core/GameState";
import { advanceDay } from "../core/TimeSystem";
import {
  deserialize,
  loadGame,
  saveGame,
  serialize,
} from "../persistence/SaveSystem";
import {
  currentEmployment,
  generateShifts,
  shiftToday,
} from "../systems/Employment";
import { carriedLotQuantity, inventoryOf } from "../systems/Inventory";
import { connect } from "../systems/Relationships";
import { robberyInput } from "../systems/Robbery";
import { offerCareerLead, pawnQuote, takeLoot } from "../systems/RobberyCareer";
import { acquire } from "../systems/StreetEconomy";
import { newGame as freshGame } from "../core/Simulation";
import { newGame } from "./legacyGame";
import {
  at,
  base,
  crew,
  ok,
  person,
  ranks,
  shop,
  won,
} from "./robberyFixtures";

const market = "reservoir.lil-jays";
const court = "reservoir.lot-court";
const homes = "reservoir.homes";
const pawn = "reservoir.pawn";
const laundry = "reservoir.laundry";
const warehouse = "reservoir.warehouse";
const street = "reservoir.boarded-house";
const tower = "reservoir.water-tower";

function context(
  locationId: string,
  extra?: Partial<LocationContext>,
): LocationContext {
  return { actorId: "player", locationId, ...extra };
}

function run(s: GameState, c: LocationContext, command: LocationCommand) {
  expect(validateLocationAction(s, c, command)).toBeNull();
  const result = executeLocationAction(s, c, command);
  expect(result.error).toBeNull();
  return result;
}

function blocked(
  s: GameState,
  c: LocationContext,
  command: LocationCommand,
  expected: RegExp,
) {
  expect(validateLocationAction(s, c, command)).toMatch(expected);
  const result = executeLocationAction(s, c, command);
  expect(result.error).toMatch(expected);
  expect(result.state).toBe(s);
  expect(result.changes.apSpent).toBe(0);
}

function campaign(location: string, seed = 42) {
  const s = newGame("Reservoir", "reservoir", seed);
  s.encounters.forEach((e) => (e.status = "closed"));
  at(s, location);
  return s;
}

describe("Reservoir location gameplay without rendering", () => {
  it("joins the seven mapped doors and the mapped homes to the exact eight registry IDs", () => {
    expect([...RESERVOIR_LOCATION_IDS].sort()).toEqual(
      [market, court, homes, pawn, laundry, warehouse, street, tower].sort(),
    );
    for (const id of RESERVOIR_LOCATION_IDS)
      expect(resolveReservoirLocation(id)).toMatchObject({
        id,
        zone: "reservoir",
      });
    expect(resolveReservoirLocation("reservoir.barber")).toBeNull();
    expect(resolveReservoirLocation("rio.bodega")).toBeNull();
    const properties = resolveReservoirLocation(homes)!.properties;
    expect(
      properties.filter((p) => p.targetId).map((p) => [p.id, p.targetId]),
    ).toEqual([
      ["res-home-02", "home.reservoir.1"],
      ["res-home-08", "home.reservoir.3"],
      ["res-home-12", "home.reservoir.2"],
    ]);
  });

  it("buys only the market's stock with real cash, inventory, AP and save/load", () => {
    const s = campaign(market);
    const c = context(market);
    expect(
      queryLocation(s, c)
        .actions.filter((a) => a.command.type === "buy")
        .map((a) => a.command.targetId),
    ).toEqual(["necessities", "smokes", "booze"]);
    blocked(s, c, { type: "buy", targetId: "clothing" }, /unavailable/);
    blocked(
      s,
      context(pawn),
      { type: "buy", targetId: "necessities" },
      /unavailable/,
    );
    const before = serialize(s);
    const paid = run(s, c, { type: "buy", targetId: "necessities" });
    expect(serialize(s)).toBe(before);
    expect(paid.changes).toMatchObject({
      apSpent: 1,
      daysElapsed: 0,
      wallet: { clean: -ITEMS.necessities.price, illicit: 0 },
    });
    expect(paid.changes.eventIds.length).toBeGreaterThan(0);
    expect(inventoryOf(paid.state).slots).toContainEqual(
      expect.objectContaining({ itemId: "necessities", quantity: 1 }),
    );
    const memory = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return memory.size;
      },
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      clear: () => memory.clear(),
      key: (index) => [...memory.keys()][index] ?? null,
      removeItem: (key) => {
        memory.delete(key);
      },
    };
    saveGame(storage, paid.state);
    expect(loadGame(storage)).toEqual(paid.state);
    const empty = structuredClone(paid.state);
    player(empty).wallet = { clean: 0, illicit: 0 };
    blocked(empty, c, { type: "buy", targetId: "smokes" }, /cash/i);
    empty.ap = 0;
    blocked(empty, c, { type: "buy", targetId: "smokes" }, /AP/);
  });

  it("runs both employers through the real job and shift commands without faction gains", () => {
    for (const [location, jobId, employer] of [
      [market, "retail-reservoir", "mr-lewis"],
      [warehouse, "warehouse", "resident-reservoir"],
    ]) {
      let s = campaign(location);
      const c = context(location);
      blocked(s, c, { type: "acceptJob", targetId: jobId }, /Apply here first/);
      s = run(s, c, { type: "apply", targetId: jobId }).state;
      expect(s.employmentSearch.player?.offeredJob).toBe(jobId);
      s = run(s, c, { type: "acceptJob", targetId: jobId }).state;
      expect(currentEmployment(s)).toMatchObject({ jobId, employer });
      blocked(s, c, { type: "work", targetId: jobId }, /shift/);
      // Advance through canonical attendance generation and normal world simulation.
      for (let attempts = 0; !shiftToday(s) && attempts < 7; attempts++)
        s = advanceDay(s);
      expect(shiftToday(s)).toBeTruthy();
      const visitor = s.danger.scenes.find(
        (scene) => scene.status === "open" && scene.location === location,
      );
      const sceneContext = context(location, {
        peopleHere: visitor ? [visitor.npc] : [],
      });
      const openScene = queryLocation(s, sceneContext).actions.find(
        (a) => a.command.responseId === "leave",
      );
      if (openScene) s = run(s, sceneContext, openScene.command).state;
      player(s).affiliation = "blocks";
      const territory = structuredClone(s.strategic.territories.reservoir);
      const wage = currentEmployment(s)!.wage;
      const worked = run(s, c, { type: "work", targetId: jobId });
      expect(worked.changes).toMatchObject({
        apSpent: 2,
        daysElapsed: 0,
        wallet: { clean: wage, illicit: 0 },
      });
      expect(currentEmployment(worked.state)?.attendance.at(-1)).toMatchObject({
        status: "worked",
      });
      const after = worked.state.strategic.territories.reservoir;
      expect(after.factions).toEqual(territory.factions);
      expect(after.controller).toBe("blocks");
      expect(after.lawfulEconomy).toBeGreaterThan(territory.lawfulEconomy);
      expect(deserialize(serialize(worked.state))).toEqual(worked.state);
      blocked(worked.state, c, { type: "work", targetId: jobId }, /AP/);
    }
  });

  it("preserves existing retail employer records and access through the former hiring contact", () => {
    let s = campaign(market);
    const c = context(market);
    s = run(s, c, { type: "apply", targetId: "retail-reservoir" }).state;
    s = run(s, c, { type: "acceptJob", targetId: "retail-reservoir" }).state;
    currentEmployment(s)!.employer = "resident-reservoir";
    expect(currentEmployment(deserialize(serialize(s)))?.employer).toBe(
      "resident-reservoir",
    );
    const visitor = newGame("Visitor", "south");
    at(visitor, market);
    connect(visitor, "player", "resident-reservoir");
    expect(
      validateLocationAction(visitor, c, {
        type: "apply",
        targetId: "retail-reservoir",
      }),
    ).toBeNull();
  });

  it("uses the laundry lease's eligibility, maintenance, operating ledger and sale", () => {
    let s = campaign(laundry);
    const c = context(laundry);
    const lease = { type: "business:buy", targetId: "laundry" } as const;
    blocked(s, c, lease, /legitimate/);
    player(s).legitimacy = 50;
    blocked(s, c, lease, /8500/);
    player(s).wallet.clean = 10000;
    const bought = run(s, c, lease);
    expect(bought.changes).toMatchObject({
      apSpent: 1,
      wallet: { clean: -8500 },
    });
    const maintained = run(bought.state, c, {
      type: "business:maintain",
      targetId: "laundry",
    });
    expect(maintained.changes).toMatchObject({
      apSpent: 1,
      wallet: { clean: -120 },
    });
    s = advanceDay(maintained.state);
    expect(
      s.ledger.some(
        (l) => l.reason === "Reservoir laundry lease: operating revenue",
      ),
    ).toBe(true);
    expect(s.strategic.businesses[0].history).toHaveLength(2);
    expect(s.assets[0].provenance).toBe("clean");
    s = deserialize(serialize(s));
    const value = s.assets[0].value;
    const sold = run(s, c, { type: "business:sell", targetId: "laundry" });
    expect(sold.changes.wallet?.clean).toBe(value);
    expect(sold.state.strategic.businesses[0].status).toBe("sold");
    expect(sold.state.assets[0].recurringIncome).toBe(0);
  });

  it("requires verified market NPCs for delivery, social actions and Quanny’s introduction", () => {
    const s = freshGame("Resident", "reservoir");
    at(s, market);
    expect(s.characters.quanny).toMatchObject({
      id: "quanny",
      affiliation: "blocks",
      description: expect.stringContaining("Splash Gang"),
    });
    expect(s.characters["mr-lewis"].affiliation).toBeNull();
    const unverified = context(market);
    const withLewis = context(market, { peopleHere: ["mr-lewis"] });
    const withQuanny = context(market, { peopleHere: ["quanny"] });
    const delivery = {
      type: "lewisDelivery",
      targetId: "mr-lewis",
    } as const;
    const introduction = { type: "meetQuanny", targetId: "quanny" } as const;
    for (const c of [unverified, context(market, { peopleHere: [] })]) {
      expect(queryLocation(s, c).actions).not.toContainEqual(
        expect.objectContaining({
          command: expect.objectContaining({
            targetId: expect.stringMatching(/^(quanny|mr-lewis)$/),
          }),
        }),
      );
      blocked(s, c, delivery, /unavailable/);
      blocked(s, c, introduction, /unavailable/);
    }
    blocked(s, withLewis, introduction, /unavailable/);
    blocked(s, withQuanny, delivery, /unavailable/);
    const busy = structuredClone(s);
    busy.characters.quanny.availableDay = busy.day + 1;
    blocked(busy, withQuanny, introduction, /isn’t available/);

    const delivered = run(s, withLewis, delivery);
    expect(delivered.changes).toMatchObject({
      apSpent: 1,
      wallet: { clean: 38 },
    });
    blocked(delivered.state, withLewis, delivery, /unavailable/);
    const met = run(delivered.state, withQuanny, introduction);
    expect(met.state.quanny).toMatchObject({ met: true, location: market });
    const business = { type: "quanny", targetId: "quanny" } as const;
    blocked(met.state, withLewis, business, /unavailable/);
    blocked(met.state, withQuanny, business, /Finish this conversation/);

    const answer = queryLocation(met.state, withQuanny).actions.find(
      (a) => a.command.responseId === "claim:unaffiliated",
    )!;
    blocked(met.state, unverified, answer.command, /unavailable/);
    const targetId = answer.command.targetId!;
    const deferred = dismissEncounter(met.state, targetId);
    expect(validateLocationAction(deferred, withQuanny, business)).toBeNull();
    const reopen = { type: "openEncounter", targetId } as const;
    blocked(deferred, withLewis, reopen, /unavailable/);
    const resumed = run(deferred, withQuanny, reopen).state;
    const replied = run(resumed, withQuanny, answer.command).state;
    expect(replied.quanny.claim).toBe("unaffiliated");
    expect(deserialize(serialize(replied)).quanny).toEqual(replied.quanny);
  });

  it("builds trust at the court only with a present contact and offers home-district rest", () => {
    let s = campaign(court);
    const contact = { type: "contact", targetId: "contact-blocks" } as const;
    blocked(s, context(court), contact, /unavailable/);
    const c = context(court, { peopleHere: ["contact-blocks"] });
    const factionScores = structuredClone(
      s.strategic.territories.reservoir.factions,
    );
    const trust =
      s.characters["contact-blocks"].relationships.player?.trust ?? 0;
    const spoken = run(s, c, contact);
    expect(spoken.changes.apSpent).toBe(1);
    expect(
      spoken.state.characters["contact-blocks"].relationships.player.trust,
    ).toBeGreaterThan(trust);
    expect(spoken.state.strategic.territories.reservoir.factions).toEqual(
      factionScores,
    );
    expect(player(spoken.state).affiliation).toBeNull();
    s = spoken.state;
    at(s, homes);
    player(s).stress = 45;
    blocked(
      s,
      context(homes, { propertyId: "res-home-01" }),
      { type: "rest" },
      /unavailable/,
    );
    const rested = run(s, context(homes), { type: "rest" });
    expect(rested.changes.apSpent).toBe(1);
    expect(player(rested.state).stress).toBe(31);
    expect(deserialize(serialize(rested.state))).toEqual(rested.state);
  });

  it("requires the court location and a verified participant to resolve a confrontation", () => {
    const s = campaign(court, 8);
    const factions = structuredClone(
      s.strategic.territories.reservoir.factions,
    );
    const event = record(s, "risk", "Old bad blood.", [
      "contact-blocks",
      "player",
    ]);
    addGrievance(s, "contact-blocks", "player", event.text, event.id, 35);
    s.danger.rng = 8;
    expose(s, court, "activity", "court-visit");
    syncEncounters(s);
    const withContact = context(court, { peopleHere: ["contact-blocks"] });
    const response = queryLocation(s, withContact).actions.find(
      (a) => a.command.responseId === "leave",
    )!;
    expect(response).toBeDefined();
    blocked(s, context(court), response.command, /unavailable/);
    blocked(
      s,
      context(tower, { peopleHere: ["contact-blocks"] }),
      response.command,
      /unavailable/,
    );
    const result = run(s, withContact, response.command);
    expect(result.state.danger.scenes.at(-1)).toMatchObject({
      location: court,
      status: "resolved",
    });
    expect(result.state.strategic.territories.reservoir.factions).toEqual(
      factions,
    );
    expect(deserialize(serialize(result.state))).toEqual(result.state);
  });

  it("reports territory at the tower and rejects invented capture commands", () => {
    const s = campaign(tower);
    const snapshot = serialize(s);
    const info = queryLocation(s, context(tower));
    expect(info.politics?.controller).toEqual({
      id: "blocks",
      name: "Blocc Boys",
    });
    expect(info.actions).toHaveLength(0);
    expect(info.politics?.territory.contested).toBe(false);
    blocked(
      s,
      context(tower),
      { type: "standing", targetId: "contact-blocks" },
      /unavailable/,
    );
    expect(serialize(s)).toBe(snapshot);
  });

  it("runs street sessions at the boarded house and cites real transactions, market and exposure", () => {
    const s = campaign(street, 42);
    const c = context(street);
    const start = { type: "startTrapping" } as const;
    blocked(s, c, start, /product|Pink Magic/);
    acquire(s, "mega", "cash");
    expect(
      carriedLotQuantity(s, "player", s.street.lots[0].id),
    ).toBeGreaterThan(0);
    s.ap = 2;
    player(s).affiliation = "blocks";
    player(s).neighborhoodStanding.reservoir = 15;
    const initialHeat = player(s).police;
    const held = run(s, c, start);
    expect(held.changes.apSpent).toBe(1);
    expect(held.state.activeSession).toMatchObject({
      location: street,
      zone: "reservoir",
    });
    let next = deserialize(serialize(held.state));
    let checkedReplay = false;
    while (next.activeSession?.status === "active") {
      const a = next.activeSession;
      const beat = {
        type: "advanceTrapping",
        targetId: a.id,
        cursor: a.cursor,
      } as const;
      next = run(next, c, beat).state;
      if (!checkedReplay) {
        blocked(next, c, beat, /unavailable/);
        checkedReplay = true;
      }
    }
    expect(next.street.transactions.length).toBeGreaterThan(0);
    expect(
      next.street.transactions.every((tx) => tx.market === "reservoir"),
    ).toBe(true);
    expect(player(next).police).toBeGreaterThan(initialHeat);
    expect(next.street.exposure.player.recent.at(-1)?.zone).toBe("reservoir");
    expect(next.strategic.territories.reservoir.controller).toBe("blocks");
    expect(deserialize(serialize(next))).toEqual(next);
  });

  it("credits faction economic presence only for actual Reservoir sales", () => {
    const s = campaign(tower, 7);
    acquire(s, "mega", "cash");
    frontMerchandise(s, "quanny");
    const c = context(street, { actorId: "quanny", peopleHere: ["quanny"] });
    const sale = { type: "crime" } as const;
    const initial = s.strategic.territories.reservoir.factions.blocks.economy;
    const sold = run({ ...s, rng: 7 }, c, sale);
    expect(sold.state.street.transactions.at(-1)).toMatchObject({
      market: "reservoir",
      actor: "quanny",
    });
    expect(sold.state.street.transactions.at(-1)!.sold).toBeGreaterThan(0);
    expect(
      sold.state.strategic.territories.reservoir.factions.blocks.economy,
    ).toBeGreaterThan(initial);
    const missed = run({ ...s, rng: 4 }, c, sale);
    expect(missed.state.street.transactions.at(-1)!.sold).toBe(0);
    expect(
      missed.state.strategic.territories.reservoir.factions.blocks.economy,
    ).toBe(initial);
    expect(missed.state.characters.quanny.police).toBeGreaterThan(
      s.characters.quanny.police,
    );
    expect(missed.state.strategic.territories.reservoir.controller).toBe(
      "blocks",
    );
  });

  it("cases only the mapped home, enforces its partner gate and pawns real stolen loot", () => {
    let s = base(42);
    ranks(s);
    person(s, "dizzy");
    s = ok(offerCareerLead(s, "dizzy", "home.reservoir.1"));
    const jobId = s.robberies!.jobs.at(-1)!.id;
    s = shop(s, "home");
    at(s, homes);
    const c = context(homes, { propertyId: "res-home-02" });
    const inspect = {
      type: "caseTarget",
      targetId: "home.reservoir.1",
    } as const;
    const start = { type: "startRobbery", targetId: jobId } as const;
    blocked(s, context(homes), inspect, /mapped house/);
    blocked(
      s,
      context(homes, { propertyId: "res-home-03" }),
      inspect,
      /unavailable/,
    );
    blocked(
      s,
      c,
      { type: "caseTarget", targetId: "home.reservoir.2" },
      /unavailable/,
    );
    blocked(s, c, start, /partner/);
    expect(run(s, c, inspect).changes.apSpent).toBe(0);
    s = crew(s, jobId);
    at(s, homes);
    const before = structuredClone(s.strategic.territories.reservoir.factions);
    const started = run(s, c, start);
    expect(started.changes.apSpent).toBe(1);
    s = won(started.state);
    const a = s.activeRobbery!;
    expect(a.career?.targetId).toBe("home.reservoir.1");
    const step = (state: GameState, answer: string) =>
      robberyInput(
        state,
        state.activeRobbery!.id,
        state.activeRobbery!.cursor,
        answer,
      );
    s = step(s, "patient");
    const goods = s.activeRobbery!.career!.goods.find(
      (g) => g.beat === 1 && !g.locked,
    )!;
    s = ok(takeLoot(s, a.id, s.activeRobbery!.cursor, goods.id));
    s = step(s, "leave");
    expect(s.robberies!.history.at(-1)?.outcome).toBe("success");
    expect(player(s).police).toBeGreaterThan(0);
    expect(s.strategic.territories.reservoir.factions).toEqual(before);
    const slot = inventoryOf(s).slots.find(
      (item) => item.provenance === `stolen:${goods.id}`,
    )!;
    const sale = { type: "pawn", targetId: slot.id } as const;
    blocked(s, context(pawn), sale, /at this location/);
    at(s, pawn);
    const quote = pawnQuote(s, slot.id)!;
    const res = run(s, context(pawn), sale);
    expect(res.changes).toMatchObject({
      apSpent: 0,
      wallet: { clean: 0, illicit: quote.price },
    });
    expect(res.state.inventory?.history.at(-1)).toMatchObject({
      action: "pawned",
      to: pawn,
    });
    expect(
      inventoryOf(res.state).slots.some((item) => item.id === slot.id),
    ).toBe(false);
    const reloaded = deserialize(serialize(res.state));
    expect(reloaded).toEqual(res.state);
    blocked(reloaded, context(pawn), sale, /unavailable/);
  });

  it("routes NPC shopping, work and social actions through the same actor-aware checks", () => {
    let s = campaign(tower);
    const actorId = "resident-reservoir";
    const buying = { type: "buy", targetId: "necessities" } as const;
    blocked(s, context(market, { actorId }), buying, /at this location/);
    const atMarket = context(market, {
      actorId,
      peopleHere: [actorId, "mr-lewis"],
    });
    const bought = run(s, atMarket, buying);
    expect(bought.changes).toMatchObject({
      apSpent: 0,
      actorActionDay: s.day,
      wallet: { clean: -ITEMS.necessities.price },
    });
    expect(inventoryOf(bought.state, actorId).slots).toContainEqual(
      expect.objectContaining({ itemId: "necessities" }),
    );
    expect(inventoryOf(bought.state).slots).toHaveLength(0);
    const job = { type: "apply", targetId: "retail-reservoir" } as const;
    blocked(bought.state, atMarket, job, /busy/);
    blocked(
      s,
      context(market, { actorId: "mr-lewis", peopleHere: ["mr-lewis"] }),
      job,
      /run this workplace/,
    );
    s = run(s, atMarket, job).state;
    // Advance just the actor's availability so the existing day-end NPC loop cannot take its action first.
    s.day++;
    s = run(s, atMarket, {
      type: "acceptJob",
      targetId: "retail-reservoir",
    }).state;
    expect(currentEmployment(s, actorId)?.employer).toBe("mr-lewis");
    s.day = 4;
    generateShifts(s);
    const wage = currentEmployment(s, actorId)!.wage;
    const worked = run(s, atMarket, {
      type: "work",
      targetId: "retail-reservoir",
    });
    expect(worked.changes).toMatchObject({
      apSpent: 0,
      wallet: { clean: wage },
    });
    s = worked.state;
    s.day++;
    connect(s, actorId, "contact-blocks");
    const atCourt = context(court, {
      actorId,
      peopleHere: [actorId, "contact-blocks", s.playerId],
    });
    blocked(
      s,
      atCourt,
      { type: "contact", targetId: s.playerId },
      /unavailable/,
    );
    const trust =
      s.characters["contact-blocks"].relationships[actorId]?.trust ?? 0;
    const talked = run(s, atCourt, {
      type: "contact",
      targetId: "contact-blocks",
    });
    expect(
      talked.state.characters["contact-blocks"].relationships[actorId].trust,
    ).toBeGreaterThan(trust);
    expect(talked.state.presence?.location).toBe(tower);
    expect(deserialize(serialize(talked.state))).toEqual(talked.state);
  });
});
