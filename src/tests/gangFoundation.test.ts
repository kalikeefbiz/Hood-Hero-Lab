import { describe, expect, it } from "vitest";
import { executeNpcLocationIntent } from "../city/LocationInteractions";
import { CYCLE_MS } from "../content/worldClock";
import { performAction } from "../core/ActionEngine";
import { record } from "../core/EventLog";
import { player } from "../core/GameState";
import { newGame } from "../core/Simulation";
import {
  advanceActiveTime,
  recoverInHospital,
  serveSentence,
  worldTime,
} from "../core/TimeSystem";
import { deserialize, serialize } from "../persistence/SaveSystem";
import { finishCommitment } from "../systems/Commitments";
import { requestActivity, resolveAssignment } from "../systems/CrewAgency";
import { hospitalize } from "../systems/Danger";
import { evaluateEnd, finalizeEnding } from "../systems/EndConditions";
import {
  queryGangMenu,
  queryGangWorld,
  rankFor,
  underlordProgress,
} from "../systems/gang";
import { arrest } from "../systems/Incarceration";
import { gain, receivePhysical } from "../systems/Inventory";
import { advanceNPCs } from "../systems/NPCDecisionAI";
import { politicalAction } from "../systems/Politics";
import { connect } from "../systems/Relationships";
import { underlordReady } from "./strategicFixtures";

const fresh = () =>
  newGame("Gang foundation", "south", 2026, { openCity: true });

it("posts standing and sponsorship through the existing action, with AP, time and Set independence", () => {
  const original = fresh();
  const target = "justice";
  const faction = "backstreet";
  connect(original, original.playerId, target);
  player(original).organizationStanding[faction] = 27;
  original.characters[target].relationships.player.trust = 30;
  const crew = structuredClone(original.crew);

  const standing = performAction(original, {
    actor: original.playerId,
    type: "standing",
    target,
  });
  expect(standing.error).toBeNull();
  expect(player(standing.state).organizationStanding[faction]).toBe(35);
  expect(player(standing.state).affiliation).toBeNull();
  expect(standing.state.ap).toBe(2);
  expect(worldTime(standing.state).minuteOfDay).toBe(390);

  const join = { actor: original.playerId, type: "affiliate", target } as const;
  const joined = performAction(standing.state, join);
  expect(joined.error).toBeNull();
  expect(joined.state.crew).toEqual(crew);
  expect(joined.state.ap).toBe(1);
  expect(worldTime(joined.state).minuteOfDay).toBe(420);
  expect(queryGangMenu(joined.state)).toMatchObject({
    affiliation: faction,
    rank: "Recruit",
  });
  expect(joined.state.danger.recognition).toContainEqual(
    expect.objectContaining({
      observer: target,
      affiliation: faction,
      source: "sponsorship",
    }),
  );
  expect(performAction(joined.state, join)).toMatchObject({
    state: joined.state,
    error: "Already affiliated",
  });
  const otherFaction = "quanny";
  connect(joined.state, joined.state.playerId, otherFaction);
  expect(
    performAction(joined.state, { ...join, target: otherFaction }),
  ).toMatchObject({
    state: joined.state,
    error: "Already affiliated",
  });
});

it("posts political investment once and keeps wallet, faction resources and standing distinct", () => {
  const s = fresh(),
    p = player(s);
  p.affiliation = "backstreet";
  p.authority = 25;
  connect(s, p.id, "justice");
  s.characters.justice.relationships[p.id].trust = 60;
  const startingResources = s.factions.backstreet.resources;
  const result = politicalAction(s, "operation", "south", "justice");
  expect(result.error).toBeNull();
  expect(player(result.state).wallet.clean).toBe(p.wallet.clean - 100);
  expect(result.state.ap).toBe(s.ap - 1);
  expect(result.state.factions.backstreet.resources).toBe(
    startingResources + 40,
  );
  expect(result.state.strategic.contributions.backstreet).toBe(50);
  expect(player(result.state).organizationStanding.backstreet).toBe(3);
  expect(player(result.state).wallet.illicit).toBe(p.wallet.illicit);
  const reloaded = deserialize(serialize(result.state));
  expect(
    politicalAction(reloaded, "operation", "south", "justice"),
  ).toMatchObject({
    state: reloaded,
    error: expect.stringContaining("neighborhood again"),
  });
});

describe("lawful Set activity", () => {
  it.each(["work", "partner-gig"] as const)(
    "keeps %s compensation and relationships without faction credit",
    (activity) => {
      const s = fresh();
      const p = player(s),
        member = s.characters.flacco;
      p.affiliation = member.affiliation = "backstreet";
      member.relationships.player.trust = 95;
      member.skills.work = 70;
      const contribution = s.strategic.contributions.backstreet;
      const foothold = structuredClone(
        s.strategic.territories.south.factions.backstreet,
      );
      const standings = structuredClone(p.organizationStanding);
      const resources = s.factions.backstreet.resources;
      const cash = member.wallet.clean;

      requestActivity(s, member.id, activity, 18);
      const assignment = s.assignments[0];
      if (activity === "work") {
        s.day = assignment.dueDay;
        resolveAssignment(s, assignment);
      }
      expect(assignment.success).toBe(true);
      expect(s.ap).toBe(2);
      expect(member.wallet.clean).toBeGreaterThan(cash);
      expect(member.relationships.player.trust).toBeGreaterThan(95);
      expect(s.strategic.territories.south.factions.backstreet).toEqual(
        foothold,
      );
      expect(p.organizationStanding).toEqual(standings);
      expect(s.strategic.contributions.backstreet).toBe(contribution);
      expect(s.factions.backstreet.resources).toBe(resources);
      const settled = serialize(s);
      resolveAssignment(s, assignment);
      expect(serialize(s)).toBe(settled);
    },
  );

  it("cannot credit a lawful commitment through the generic fulfillment resolver", () => {
    const s = fresh(),
      p = player(s),
      member = s.characters.flacco;
    p.affiliation = member.affiliation = "backstreet";
    member.relationships.player.trust = 95;
    requestActivity(s, member.id, "work", 18);
    const commitment = s.commitments[0];
    const territory = structuredClone(s.strategic.territories.south);
    finishCommitment(s, commitment, "fulfilled", [], {
      title: "Work done",
      text: "Finished the job.",
      memory: "Kept their word.",
      weight: 2,
    });
    expect(commitment.status).toBe("fulfilled");
    expect(s.strategic.contributions.backstreet).toBe(0);
    expect(s.strategic.territories.south).toEqual(territory);
  });
});

describe("Underlord availability at dawn", () => {
  it.each(["custody", "hospital"] as const)(
    "completes once after %s if the conditions still hold",
    (kind) => {
      const s = underlordReady();
      s.crew.successor = "joker";
      expect(evaluateEnd(s)).toBe("underlord");
      if (kind === "custody") arrest(s, s.playerId, "test sentence");
      else hospitalize(s, "assault", record(s, "risk", "Test incident").id);
      expect(underlordProgress(s)).toMatchObject({
        available: false,
        eligible: false,
        successorEligible: true,
      });
      expect(evaluateEnd(s)).toBeNull();
      finalizeEnding(s);
      expect(s.strategic.ending).toBeNull();
      const saved = deserialize(serialize(s));
      const released =
        kind === "custody" ? serveSentence(saved) : recoverInHospital(saved);
      expect(player(released).status).toBe("active");
      expect(released.end).toBe("underlord");
      expect(released.ap).toBe(0);
      const ending = released.strategic.ending!;
      expect(ending.day).toBe(released.day);
      expect(
        released.events.filter((event) => event.id === ending.eventId),
      ).toHaveLength(1);
      expect(advanceActiveTime(released, CYCLE_MS)).toBe(released);
    },
  );

  it("rechecks the successor on release instead of preserving earlier victory eligibility", () => {
    const s = underlordReady();
    s.crew.successor = "joker";
    hospitalize(s, "assault", record(s, "risk", "Test incident").id);
    s.characters.joker.availableDay = s.day + 10;
    const discharged = recoverInHospital(s);
    expect(underlordProgress(discharged)).toMatchObject({
      available: true,
      successorEligible: false,
    });
    expect(discharged.end).toBeNull();
  });
});

it("runs resource decisions and territory recognition once per elapsed V3 dawn across reload", () => {
  const s = fresh();
  const once = advanceActiveTime(s, CYCLE_MS);
  const twice = advanceActiveTime(deserialize(serialize(once)), CYCLE_MS);
  const together = advanceActiveTime(s, 2 * CYCLE_MS);
  expect(twice).toEqual(together);
  for (const strategy of Object.values(twice.strategic.strategies)) {
    const days = strategy.history.map((entry) => entry.day);
    expect(new Set(days).size).toBe(days.length);
  }
  expect(twice.strategic.territories.reservoir.lastResolvedDay).toBe(3);
  expect(
    once.ledger.filter((entry) => entry.reason === "Daily living expenses"),
  ).toHaveLength(1);
  expect(
    twice.ledger.filter((entry) => entry.reason === "Daily living expenses"),
  ).toHaveLength(2);
});

it("projects canon rank, Set inventory, and disclosed faction information without sharing state", () => {
  const s = fresh(),
    p = player(s);
  receivePhysical(s, "flacco", gain("smokes"));
  const secret = record(
    s,
    "city",
    "A private Mudgang meeting",
    ["quanny"],
    ["quanny"],
    { factionId: "muds" },
  );
  const menu = queryGangMenu(s);
  expect(menu.affiliation).toBeNull();
  expect(menu.rank).toBeNull();
  expect(
    menu.factions.find((faction) => faction.id === "muds"),
  ).toBeUndefined();
  expect(
    menu.developments.find((event) => event.id === secret.id),
  ).toBeUndefined();
  expect(menu.set.members).toMatchObject([
    { id: "flacco", inventory: [{ itemId: "smokes", quantity: 1 }] },
  ]);
  menu.set.members[0].inventory[0].quantity = 42;
  expect(queryGangMenu(s).set.members[0].inventory[0].quantity).toBe(1);

  p.affiliation = "backstreet";
  expect(
    [10, 25, 45, 70].map((authority) => {
      p.authority = authority;
      return rankFor(s, p);
    }),
  ).toEqual(["Recruit", "Soldier", "Big Homie", "King Pin"]);
  p.affiliation = "blocks";
  p.authority = 70;
  expect(rankFor(s, p)).toBe("Big Homie");
  expect(rankFor(s, s.characters.quanny)).toBe("Big Homie");
  expect(s.factions.blocks.leaders).toEqual([]);
  const sim = queryGangWorld(s, ["quanny", "flacco"]);
  expect(sim.time).toEqual(worldTime(s));
  expect(sim.characters.map((actor) => actor.id)).toEqual(["flacco", "quanny"]);
  expect(sim.characters[1]).toMatchObject({
    rank: "Big Homie",
    affiliation: "blocks",
    status: "active",
  });
  expect(sim.events.some((event) => event.id === secret.id)).toBe(true);
  expect(queryGangWorld(s, ["quanny"], secret.id).events).toEqual([]);
  delete sim.characters[0].relationships.player;
  expect(s.characters.flacco.relationships.player).toBeDefined();
});

it("accepts NPC intents only with current co-presence and shares the daily action budget", () => {
  const s = fresh();
  const actorId = "resident-reservoir";
  const intent = {
    actorId,
    day: s.day,
    command: { type: "buy", targetId: "smokes" },
  } as const;
  const observation = {
    locationId: "reservoir.lil-jays",
    time: worldTime(s),
    peopleHere: [actorId],
  };
  const absent = executeNpcLocationIntent(s, intent, {
    ...observation,
    peopleHere: [],
  });
  expect(absent.state).toBe(s);
  expect(absent.error).toMatch(/must be at this location/i);
  const later = advanceActiveTime(s, 1000);
  expect(executeNpcLocationIntent(later, intent, observation).state).toBe(
    later,
  );

  const accepted = executeNpcLocationIntent(s, intent, observation);
  expect(accepted.error).toBeNull();
  expect(accepted.eventIds).toHaveLength(1);
  expect(accepted.state.characters[actorId].wallet.clean).toBeLessThan(
    s.characters[actorId].wallet.clean,
  );
  expect(accepted.state.ap).toBe(s.ap);
  expect(worldTime(accepted.state)).toEqual(worldTime(s));
  const duplicate = executeNpcLocationIntent(
    accepted.state,
    intent,
    observation,
  );
  expect(duplicate.state).toBe(accepted.state);
  expect(duplicate.error).toMatch(/busy/);
  const actor = structuredClone(accepted.state.characters[actorId]);
  advanceNPCs(accepted.state);
  expect(accepted.state.characters[actorId]).toEqual(actor);
});
