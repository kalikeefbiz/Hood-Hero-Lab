import { discardItem } from "../systems/InventoryExchanges";
import { inventoryOf } from "../systems/Inventory";
import { describe, it, expect } from "vitest";
import { newGame } from "../core/Simulation";
import { player, cash, type GameState } from "../core/GameState";
import { performAction, validateAction } from "../core/ActionEngine";
import { presenceOf } from "../board/presence";
import { boardPeople } from "../board/people";
import { locationById } from "../board/locations";
import { newStreetLife } from "../systems/StreetLifeState";
import {
  openingDecision,
  giveFlaccoStock,
  settleAftermath,
  trioOutcome,
  introduceRio,
  payTribute,
  tributeError,
} from "../systems/StreetLife";
import {
  currentEncounter,
  syncEncounters,
  openStoryline,
  openEncounter,
  dismissEncounter,
} from "../systems/EncounterLifecycle";
import { respondEncounter } from "../systems/Encounters";
import {
  acquire,
  supplierError,
  repay,
  saleLot,
  marketAccess,
  suppliers,
} from "../systems/StreetEconomy";
import {
  startStreetSession,
  advanceStreetSession,
  validateStartStreetSession,
  endStreetSession,
} from "../systems/StreetSessions";
import {
  offerRobbery,
  purchasePrep,
  startRobbery,
  robberyInput,
  robberyStartError,
  PREPARATION,
  pauseRobbery,
  obtainContactEquipment,
} from "../systems/Robbery";
import { skillRank, skillsOf } from "../systems/Skills";
import { connect } from "../systems/Relationships";
import { serialize, deserialize } from "../persistence/SaveSystem";
import { resolveIncident } from "../systems/Incidents";
import { pabloError } from "../systems/StreetAccess";
import { record } from "../core/EventLog";
const clear = (s: GameState) => {
  for (const e of s.encounters) e.status = "acknowledged";
  for (const e of s.danger.scenes) e.status = "left";
};
function at(s: GameState, id: string) {
  const l = locationById(id)!;
  s.presence = { ...presenceOf(s), location: id, zone: l.zone };
}
function person(s: GameState, id: string) {
  at(s, boardPeople(s).find((p) => p.id === id)!.placeId);
}
function choose(s: GameState, id: string) {
  const r = respondEncounter(s, currentEncounter(s)!.id, id);
  expect(r.error).toBeNull();
  return r.state;
}
function trained(seed = 123) {
  let s = newGame("Test", "south", seed);
  s = choose(s, "decline");
  at(s, "south.food-mart");
  s = performAction(s, {
    actor: s.playerId,
    type: "apply",
    jobId: "retail-south",
  }).state;
  person(s, "mega");
  acquire(s, "mega", "cash");
  clear(s);
  s.ap = 2;
  at(s, "south.the-lot");
  s = startStreetSession(s, "south.the-lot").state;
  s = endStreetSession(s, s.activeSession!.id);
  s.activeSession = undefined;
  return s;
}
describe("GOAL 011 opening and durable access", () => {
  for (const decision of ["promise", "decline", "delay"] as const)
    it(`${decision}: meaningful decision, physical work and no criminal bypass`, () => {
      let s = newGame("Test", "south");
      expect(supplierError(s, "mega", "consignment")).toMatch(/Chains/);
      s = choose(s, decision);
      expect(s.streetLife!.decision).toBe(decision);
      expect(validateStartStreetSession(s, "south.the-lot")).toMatch(
        /application/,
      );
      const invalid = performAction(s, {
        actor: s.playerId,
        type: "apply",
        jobId: "retail-south",
      });
      expect(invalid.error).toBeNull();
      expect(s.streetLife!.workEvent).toBeUndefined();
      at(s, "south.food-mart");
      const before = cash(player(s));
      const r = performAction(s, {
        actor: s.playerId,
        type: "apply",
        jobId: "retail-south",
      });
      expect(r.error).toBeNull();
      s = r.state;
      expect(s.streetLife!.workEvent).toBeTruthy();
      expect(cash(player(s))).toBe(before);
      expect(s.employmentSearch.player.offeredJob).toBe("retail-south");
      expect(deserialize(serialize(s)).streetLife).toEqual(s.streetLife);
    });
  it("paid City gig unlocks; invalid repeated gig does not award money", () => {
    let s = newGame("Test", "south");
    s = choose(s, "delay");
    at(s, "nawf.street-market");
    let r = performAction(s, { actor: s.playerId, type: "gig" });
    expect(r.error).toBeNull();
    s = r.state;
    expect(cash(player(s))).toBe(163);
    expect(s.streetLife!.workEvent).toBeTruthy();
    expect(performAction(s, { actor: s.playerId, type: "gig" }).error).toMatch(
      /complete/,
    );
  });
  it("Day 3 promise gift queues behind custody and conversations, exactly six, no cost/debt", () => {
    let s = newGame("Test", "south");
    s = choose(s, "promise");
    s.day = 3;
    player(s).status = "arrested";
    syncEncounters(s);
    expect(s.encounters.some((e) => e.definitionId === "flacco-six")).toBe(
      false,
    );
    player(s).status = "active";
    syncEncounters(s);
    expect(currentEncounter(s)?.definitionId).toBe("flacco-six");
    s = choose(s, "receive");
    expect(s.street.lots[0]).toMatchObject({
      received: 6,
      remaining: 6,
      cost: 0,
      owed: 0,
      supplier: "flacco",
    });
    expect(s.street.agreements).toHaveLength(0);
    expect(s.streetLife!.workEvent).toBeUndefined();
    s = deserialize(serialize(s));
    giveFlaccoStock(s);
    syncEncounters(s);
    expect(s.street.lots).toHaveLength(1);
    expect(validateStartStreetSession(s, "south.the-lot")).toMatch(
      /application/,
    );
  });
  it("decline is permanently cash-only; six real units and one genuine AP lesson", () => {
    const s = trained();
    expect(s.streetLife!.initialDecision).toBe("decline");
    expect(s.streetLife!.lesson).toBe("complete");
    expect(s.street.lots[0]).toMatchObject({ received: 6, cost: 90, paid: 90 });
    expect(cash(player(s))).toBe(35);
    expect(s.ap).toBe(1);
    player(s).relationships.mega.trust = 100;
    s.characters.mega.relationships.player.trust = 100;
    s.ap = 2;
    person(s, "mega");
    expect(supplierError(s, "mega", "consignment")).toMatch(/CASH/);
    openingDecision(s, "promise");
    s.day = 3;
    giveFlaccoStock(s);
    expect(s.street.lots).toHaveLength(1);
  });
  it("delay can commit later; buying the no-commitment starter excludes a later gift", () => {
    let s = trained();
    s.streetLife!.initialDecision = undefined;
    s.streetLife!.decision = "delay";
    s.streetLife!.lesson = "waiting";
    s = openStoryline(s, "the-chains");
    s = choose(s, "promise");
    s.day = 3;
    giveFlaccoStock(s);
    expect(s.street.lots).toHaveLength(1);
  });
  it("Pablo restrictions apply to direct actions and suppliers, indirect settlement survives", () => {
    const s = trained();
    connect(s, "player", "pablo");
    s.ap = 2;
    expect(pabloError(s, "pablo")).toBeTruthy();
    expect(suppliers(s).some((n) => n.id === "pablo")).toBe(false);
    expect(
      validateAction(s, { type: "contact", actor: "player", target: "pablo" }),
    ).toMatch(/Big Dog/);
    s.incidents["the-chains"].informed = true;
    expect(
      validateAction(s, {
        type: "settlement",
        actor: "player",
        target: "pablo",
        incidentId: "the-chains",
      }),
    ).toBeNull();
    player(s).affiliation = "angels";
    expect(pabloError(s, "pablo")).toBeNull();
  });
});
describe("collective aftermath and Rio permission", () => {
  for (const outcome of ["hostile", "discount", "buster", "nonfactor"] as const)
    it(`one ${outcome} reaction for all three, once`, () => {
      const s = trained(),
        i = s.incidents["the-chains"];
      i.informed = true;
      if (outcome === "discount") {
        i.reducedDemand = 120;
        i.paidDemand = 120;
        resolveIncident(s, i, "buyback", "player");
      }
      if (outcome === "buster") {
        i.cleanFullPrice = true;
        i.paidDemand = 150;
        resolveIncident(s, i, "buyback", "player");
      }
      if (outcome === "hostile") resolveIncident(s, i, "recovered", "player");
      if (outcome === "nonfactor") resolveIncident(s, i, "settlement", "pablo");
      clear(s);
      person(s, "dizzy");
      settleAftermath(s);
      expect(s.streetLife!.aftermath).toBe(outcome);
      const count = s.events.length;
      person(s, "joker");
      settleAftermath(s);
      expect(s.events).toHaveLength(count);
      expect(
        s.danger.conflicts.filter((c) => c.participants.includes("player"))
          .length,
      ).toBe(outcome === "hostile" ? 3 : 0);
      expect(
        s.danger.conflicts.every((c) => c.scope === "personal" && !c.lethal),
      ).toBe(true);
      expect(deserialize(serialize(s)).streetLife!.aftermath).toBe(outcome);
    });
  it("failed negotiation plus full payment is not discounted or clean buster", () => {
    const s = trained(),
      i = s.incidents["the-chains"];
    i.resolution = "buyback";
    i.resolvedBy = "player";
    i.negotiated = true;
    i.paidDemand = 150;
    expect(trioOutcome(s)).toBe("nonfactor");
    i.reducedDemand = 120;
    expect(trioOutcome(s)).toBe("nonfactor");
  });
  it("introduction needs directional 35 trust; standing never bypasses explicit prepaid territory", () => {
    const s = trained();
    s.ap = 2;
    person(s, "dizzy");
    connect(s, "player", "dizzy");
    s.characters.dizzy.relationships.player.trust = 34;
    introduceRio(s, "dizzy");
    expect(s.streetLife!.rioContact).toBeUndefined();
    s.characters.dizzy.relationships.player.trust = 35;
    introduceRio(s, "dizzy");
    expect(s.streetLife!.rioContact).toBe("contact-angels");
    player(s).neighborhoodStanding.rio = 100;
    expect(marketAccess(s, "player", "rio")).toMatch(/prepaid/);
    person(s, "contact-angels");
    expect(tributeError(s)).toBeNull();
    const before = cash(player(s));
    payTribute(s);
    expect(cash(player(s))).toBe(before - 12);
    payTribute(s);
    expect(cash(player(s))).toBe(before - 12);
    expect(marketAccess(s, "player", "rio")).toBeNull();
    s.day += 3;
    expect(marketAccess(s, "player", "rio")).toMatch(/prepaid/);
  });
});
describe("multi-lot transactions and compatibility", () => {
  it("Mega repeats supplies despite own debt; other plugs assess their own trust and balances", () => {
    const s = trained();
    s.streetLife!.initialDecision = "promise";
    s.ap = 2;
    person(s, "mega");
    acquire(s, "mega", "consignment");
    const due = s.street.agreements[0].dueDay;
    s.day++;
    acquire(s, "mega", "consignment");
    expect(s.street.lots).toHaveLength(3);
    expect(s.street.agreements.map((a) => a.dueDay)).toEqual([due, due + 1]);
    s.ap = 2;
    connect(s, "player", "contact-angels");
    s.characters["contact-angels"].relationships.player.trust = 50;
    person(s, "contact-angels");
    expect(supplierError(s, "contact-angels", "consignment")).toContain("load");
    const reduced = discardItem(s, inventoryOf(s).slots[0].id, 4, presenceOf(s).location);
    expect(typeof reduced).not.toBe("string");
    Object.assign(s, reduced);
    expect(supplierError(s, "contact-angels", "consignment")).toBeNull();
    acquire(s, "contact-angels", "consignment");
    expect(s.street.agreements.at(-1)?.supplier).toBe("contact-angels");
    player(s).wallet.clean = 200;
    person(s, "mega");
    repay(s, s.street.agreements[1].id, 25);
    expect(s.street.agreements.map((a) => a.balance)).toEqual([102, 77, 102]);
    expect(deserialize(serialize(s)).street.agreements).toHaveLength(3);
  });
  it("selected lot stays pinned across newly acquired lots, sales debit only the selected supplier", () => {
    let s = trained();
    s.streetLife!.initialDecision = "promise";
    s.ap = 2;
    person(s, "mega");
    acquire(s, "mega", "consignment");
    const id = s.street.lots[1].id;
    s.ap = 2;
    clear(s);
    at(s, "south.the-lot");
    s = startStreetSession(s, "south.the-lot", id).state;
    expect(saleLot(s)?.id).toBe(id);
    s.activeSession!.beats[0] = { kind: "buyer", seed: 2, duration: 7200 };
    s = advanceStreetSession(s, s.activeSession!.id, 0);
    expect(s.street.transactions.at(-1)?.lotId).toBe(id);
    expect(s.street.lots[0].remaining).toBe(6);
    expect(deserialize(serialize(s)).activeSession!.lotId).toBe(id);
  });
  for (const version of [8, 9] as const)
    it(`v${version} preserves inventory/debts and explicitly grandfathers onboarding`, () => {
      let s = trained();
      s.version = version;
      delete s.streetLife;
      const raw = serialize(s);
      const n = deserialize(raw);
      expect(n.streetLife).toEqual(newStreetLife(true));
      expect(n.street.lots).toEqual(s.street.lots);
      expect(n.quanny).toEqual(s.quanny);
      expect(n.ap).toBe(s.ap);
    });
  it("rejects corrupt tutorial and robbery data without changing original", () => {
    const s = trained();
    s.streetLife!.giftLot = "missing";
    expect(() => deserialize(serialize(s))).toThrow(/street-life/);
  });
});
describe("real City robbery sessions", () => {
  function prepared(seed: number) {
    let s = trained(seed);
    player(s).wallet.clean = 500;
    s.ap = 2;
    resolveIncident(s, s.incidents["the-chains"], "buyback", "player");
    clear(s);
    person(s, "dizzy");
    settleAftermath(s);
    s.characters.dizzy.relationships.player.trust = 40;
    s = offerRobbery(s, "dizzy");
    expect(s.robberies!.jobs).toHaveLength(1);
    for (const item of ["gloves", "mask"] as const) {
      s.ap = 2;
      at(s, PREPARATION[item].location);
      s = purchasePrep(s, item, PREPARATION[item].location);
    }
    clear(s);
    s.ap = 2;
    return s;
  }
  it("requires actual opportunity, physical target and prep; charges exactly once and persists challenge", () => {
    let s = prepared(123),
      job = s.robberies!.jobs[0];
    expect(robberyStartError(s, job.id)).toMatch(/Stand/);
    at(s, job.location);
    const r = startRobbery(s, job.id);
    expect(r.error).toBeNull();
    s = r.state;
    expect(s.ap).toBe(1);
    expect(s.robberies!.items.gloves).toBe(0);
    expect(startRobbery(s, job.id).state).toBe(s);
    const a = s.activeRobbery!;
    s = robberyInput(s, a.id, 0, "patient");
    s = deserialize(serialize(s));
    expect(s.activeRobbery!.seed).toBe(a.seed);
    const same = robberyInput(s, a.id, 0, "rush");
    expect(same).toBe(s);
    s = robberyInput(s, a.id, 1, a.pattern.join(","));
    s = robberyInput(s, a.id, 2, "leave");
    const cashAfter = cash(player(s));
    expect(skillRank(player(s), "combat")).toBe(2);
    expect(s.robberies!.history).toHaveLength(1);
    s = deserialize(serialize(s));
    expect(robberyInput(s, a.id, 2, "push")).toBe(s);
    expect(cash(player(s))).toBe(cashAfter);
  });
  it("deterministic real success and failure award correct progression, no automatic kill", () => {
    let successes = 0,
      failures = 0;
    for (let seed = 1; seed < 35; seed++) {
      let s = prepared(seed);
      at(s, s.robberies!.jobs[0].location);
      s = startRobbery(s, s.robberies!.jobs[0].id).state;
      const a = s.activeRobbery!;
      s = robberyInput(s, a.id, 0, "patient");
      s = robberyInput(s, a.id, 1, a.pattern.join(","));
      const fork = structuredClone(s);
      s = robberyInput(s, a.id, 2, "push");
      expect(robberyInput(fork, a.id, 2, "push")).toEqual(s);
      const h = s.robberies!.history[0];
      if (h.outcome === "failed") {
        failures++;
        expect(h.loot).toBe(0);
        expect(skillsOf(player(s)).xp.combat).toBe(100);
      } else {
        successes++;
        expect(h.loot).toBeGreaterThan(0);
        expect(skillsOf(player(s)).xp.combat).toBe(500);
      }
      expect(player(s).status).not.toBe("dead");
      expect(deserialize(serialize(s)).robberies!.history).toEqual(
        s.robberies!.history,
      );
    }
    expect(successes).toBeGreaterThan(0);
    expect(failures).toBeGreaterThan(0);
  });
  it("Quanny remains a separate earned route and home gate becomes legitimately reachable", () => {
    let s = trained();
    player(s).wallet.clean = 500;
    s.quanny.business = "open";
    connect(s, "player", "quanny");
    s.characters.quanny.relationships.player.trust = 45;
    person(s, "quanny");
    s = offerRobbery(s, "quanny");
    expect(s.robberies!.jobs[0].source).toBe("quanny");
    const m = skillsOf(player(s));
    m.milestones.certified = 1;
    m.milestones.robberySuccess = 3;
    m.xp.robbery = 900;
    s.robberies!.jobs[0].status = "expired";
    s.day++;
    s = offerRobbery(s, "quanny");
    expect(s.robberies!.jobs.at(-1)!.kind).toBe("home");
    expect(skillRank(player(s), "robbery")).toBe(2);
    s.ap = 2;
    s = obtainContactEquipment(s, "quanny");
    expect(player(s).equipment!.owned).toContain("law-19");
  });
});

it("three actual successful operations unlock and play the home follow-on without fabricated ranks", () => {
  let s = trained(1);
  player(s).wallet.clean = 2000;
  clear(s);
  connect(s, "player", "dizzy");
  s.characters.dizzy.relationships.player.trust = 45;
  function shop(item: keyof typeof PREPARATION) {
    s.ap = 2;
    at(s, PREPARATION[item].location);
    s = purchasePrep(s, item, PREPARATION[item].location);
  }
  for (
    let n = 0;
    n < 12 && (skillsOf(player(s)).milestones.robberySuccess ?? 0) < 3;
    n++
  ) {
    s.day++;
    s.ap = 2;
    clear(s);
    person(s, "dizzy");
    s = offerRobbery(s, "dizzy");
    const job = s.robberies!.jobs.at(-1)!;
    expect(job.kind).toBe("strong-arm");
    shop("gloves");
    shop("mask");
    s.ap = 2;
    at(s, job.location);
    s = startRobbery(s, job.id).state;
    const a = s.activeRobbery!;
    s = robberyInput(s, a.id, 0, "patient");
    s = robberyInput(s, a.id, 1, a.pattern.join(","));
    s = robberyInput(s, a.id, 2, "leave");
    // Seeds used here produce no custody/injury; failures still consume the real resources.
    expect(player(s).status).toBe("active");
  }
  expect(skillsOf(player(s)).milestones.robberySuccess).toBe(3);
  expect(skillsOf(player(s)).xp.robbery).toBeGreaterThanOrEqual(900);
  s.day++;
  s.ap = 2;
  person(s, "dizzy");
  s = offerRobbery(s, "dizzy");
  const home = s.robberies!.jobs.at(-1)!;
  const priorOperations = s.robberies!.history.length;
  expect(home.kind).toBe("home");
  expect(skillRank(player(s), "robbery")).toBe(2);
  s = obtainContactEquipment(s, "dizzy");
  player(s).equipment!.equipped = "law-19";
  for (const item of ["gloves", "mask", "duffle", "pattern-token"] as const)
    shop(item);
  clear(s);
  s.ap = 2;
  at(s, home.location);
  expect(robberyStartError(s, home.id)).toBeNull();
  s = startRobbery(s, home.id).state;
  const a = s.activeRobbery!;
  s = robberyInput(s, a.id, 0, "patient");
  s = robberyInput(s, a.id, 1, a.pattern.join(","));
  s = robberyInput(s, a.id, 2, "leave");
  expect(s.robberies!.history).toHaveLength(priorOperations + 1);
  expect(s.robberies!.history.at(-1)!.jobId).toBe(home.id);
  expect(deserialize(serialize(s)).robberies).toEqual(s.robberies);
});

it("Mega ignores generic distrust and repeated debt but refuses an actual enemy", () => {
  const s = trained();
  s.streetLife!.initialDecision = "promise";
  s.ap = 2;
  person(s, "mega");
  s.characters.mega.relationships.player.trust = -30;
  s.characters.mega.relationships.player.grievance = 45;
  expect(supplierError(s, "mega", "consignment")).toBeNull();
  const e = record(s, "risk", "An actual personal conflict with Mega", [
    "mega",
    "player",
  ]);
  s.danger.conflicts.push({
    id: "enemy-mega",
    participants: ["mega", "player"],
    cause: "Actual enemies",
    originEvent: e.id,
    seriousness: 60,
    lethal: false,
    state: "unresolved",
    scope: "personal",
    associates: [],
    intent: "talk",
    createdDay: s.day,
    updatedDay: s.day,
    history: [],
  });
  expect(supplierError(s, "mega", "consignment")).toMatch(/actual enemies/);
});

it("an offer accepted at its real workplace completes the introduction; a remote offer does not", () => {
  let s = newGame("Offer", "south");
  s = choose(s, "delay");
  s = performAction(s, {
    actor: "player",
    type: "apply",
    jobId: "retail-south",
  }).state;
  expect(s.streetLife!.workEvent).toBeUndefined();
  at(s, "south.food-mart");
  s = performAction(s, {
    actor: "player",
    type: "acceptJob",
    jobId: "retail-south",
  }).state;
  expect(s.streetLife!.workEvent).toBeTruthy();
  expect(cash(player(s))).toBe(125);
});

it("Day 3 Flacco waits behind another conversation and can be deferred without a reward", () => {
  let s = newGame("Queue", "south");
  s = choose(s, "promise");
  s.day = 3;
  s = openStoryline(s, "the-chains");
  syncEncounters(s);
  expect(s.encounters.some((e) => e.definitionId === "flacco-six")).toBe(false);
  clear(s);
  syncEncounters(s);
  expect(currentEncounter(s)?.definitionId).toBe("flacco-six");
  // Reopening or inspecting has no inventory side effect; only receiving does.
  const raw = serialize(s);
  expect(s.street.lots).toHaveLength(0);
  s = deserialize(raw);
  s = choose(s, "receive");
  expect(s.street.lots).toHaveLength(1);
  expect(s.street.lots[0].received).toBe(6);
  const broken = JSON.parse(serialize(s));
  broken.state.streetLife.giftLot = "unknown";
  expect(() => deserialize(JSON.stringify(broken))).toThrow();
});

it("closing the first collective confrontation never avoids or resets the three personal conflicts", () => {
  let s = trained();
  resolveIncident(s, s.incidents["the-chains"], "recovered", "player");
  clear(s);
  person(s, "dizzy");
  syncEncounters(s);
  expect(s.streetLife!.aftermath).toBe("hostile");
  expect(
    s.danger.conflicts.filter((c) => c.participants.includes("player")),
  ).toHaveLength(3);
  const event = s.streetLife!.aftermathEvent;
  const e = s.encounters.find((e) => e.definitionId === "trio-aftermath")!;
  s = openEncounter(s, e.id);
  s = dismissEncounter(s, e.id);
  syncEncounters(s);
  expect(s.streetLife!.aftermathEvent).toBe(event);
  expect(
    s.danger.conflicts.filter((c) => c.participants.includes("player")),
  ).toHaveLength(3);
});

it.each(["buyback", "sold"] as const)(
  "a %s resolution without a formal promise cannot strand the work tutorial",
  (outcome) => {
    let s = newGame("No word", "south");
    resolveIncident(
      s,
      s.incidents["the-chains"],
      outcome,
      outcome === "buyback" ? "player" : "dizzy",
    );
    expect(s.streetLife!.decision).toBe("delay");
    expect(s.streetLife!.initialDecision).toBeUndefined();
    clear(s);
    at(s, "nawf.street-market");
    s = performAction(s, { actor: "player", type: "gig" }).state;
    expect(s.streetLife!.workEvent).toBeTruthy();
    s.day = 3;
    giveFlaccoStock(s);
    expect(s.street.lots).toHaveLength(0);
  },
);

it("the no-commitment starter is CASH only as well as the explicit refusal starter", () => {
  let s = newGame("No commitment", "south");
  s = choose(s, "delay");
  at(s, "south.food-mart");
  s = performAction(s, {
    actor: "player",
    type: "apply",
    jobId: "retail-south",
  }).state;
  person(s, "mega");
  expect(supplierError(s, "mega", "consignment")).toMatch(/CASH/);
  expect(supplierError(s, "mega", "cash")).toBeNull();
  acquire(s, "mega", "cash");
  expect(s.street.lots[0]).toMatchObject({ received: 6, cost: 90, owed: 0 });
  expect(cash(player(s))).toBe(35);
  expect(s.street.agreements).toHaveLength(0);
});

it("full payment after recruiting dispute support is not a clean buster outcome", () => {
  let s = trained();
  s.ap = 2;
  player(s).wallet.clean = 200;
  s.incidents["the-chains"].informed = true;
  const support = performAction(s, {
    actor: "player",
    type: "favor",
    target: "mega",
    incidentId: "the-chains",
  });
  expect(support.error).toBeNull();
  s = support.state;
  const paid = performAction(s, {
    actor: "player",
    type: "buyback",
    incidentId: "the-chains",
  });
  expect(paid.error).toBeNull();
  s = paid.state;
  expect(s.incidents["the-chains"].cleanFullPrice).toBe(false);
  expect(trioOutcome(s)).toBe("nonfactor");
});


describe('GOAL 012 tutorial stock recovery',()=>{
  it('allows a real paid replacement after discarding all starter stock, without repeating the gift',()=>{
    let s=newGame('Recovery','south');s=choose(s,'promise');at(s,'south.food-mart');s=performAction(s,{actor:s.playerId,type:'apply',jobId:'retail-south'}).state;
    s.day=3;s.ap=2;clear(s);giveFlaccoStock(s);clear(s);const gift=s.streetLife!.giftLot!;
    const discarded=discardItem(s,inventoryOf(s).slots[0].id,6,presenceOf(s).location);expect(typeof discarded).not.toBe('string');s=discarded as GameState;
    person(s,'mega');expect(supplierError(s,'mega','cash')).toBeNull();const before=cash(player(s));acquire(s,'mega','cash');expect(cash(player(s))).toBe(before-90);expect(s.streetLife!.starterLot).not.toBe(gift);
    giveFlaccoStock(s);expect(s.street.lots.filter(l=>l.supplier==='flacco')).toHaveLength(1);clear(s);at(s,'south.the-lot');expect(validateStartStreetSession(s,'south.the-lot')).toBeNull();expect(deserialize(serialize(s))).toEqual(s);
  });
});
