import { expect, it } from "vitest";
import { at } from "./robberyFixtures";
import {
  executeLocationAction,
  executeNpcLocationIntent,
  queryLocation,
} from "../city/LocationInteractions";
import {
  executeStreetConversationAction,
  queryStreetConversation,
  type StreetPresenceObservation,
} from "../city/StreetInteractions";
import { STRATEGY_BALANCE } from "../content/strategy";
import { CYCLE_MS } from "../content/worldClock";
import { visibleEvents, record } from "../core/EventLog";
import { GAME_SAVE_VERSION, type GameState } from "../core/GameState";
import { newGame } from "../core/Simulation";
import {
  advanceActiveTime,
  advanceDay,
  advanceWorldTime,
  worldTime,
} from "../core/TimeSystem";
import { deserialize, serialize } from "../persistence/SaveSystem";
import {
  campaignSimulationSnapshot,
  withSimulationSnapshot,
} from "../persistence/SimulationSnapshot";
import { LivingBlockSim } from "../sim/engine";
import { createReservoirNpcProfiles } from "../sim/schedules";
import { restoreSimFromSave } from "../sim/persistence";
import { hospitalize } from "../systems/Danger";
import {
  applyForJob,
  acceptJob,
  currentEmployment,
} from "../systems/Employment";
import { queryGangWorld } from "../systems/gang";
import { arrest } from "../systems/Incarceration";
import { advanceNPCs } from "../systems/NPCDecisionAI";
import { connect } from "../systems/Relationships";
import {
  adjustFoothold,
  applyInfluence,
  resolveTerritories,
} from "../systems/Territory";

const fresh = () =>
  newGame("World integration", "reservoir", 2026, { openCity: true });
const splash = ["baby-reek", "tay-savage", "lil-deuce", "k3"];
const blocks = [
  "ty-ty",
  "mookie",
  "big-riq",
  "dooda",
  "j-money",
  "bam",
  "trell",
  "boogie",
  "nook",
];
const civilians = [
  "miss-denise",
  "unc-ray",
  "ms-tonya",
  "nell-price",
  "mr-harris",
  "reggie-auto",
  "keisha-reservoir",
  "miss-pat",
  "shay-reservoir",
];
const additions = [...splash, ...blocks, ...civilians];
const market = "reservoir.lil-jays";
const court = "reservoir.lot-court";
const observe = (
  state: GameState,
  ...nearbyCharacterIds: string[]
): StreetPresenceObservation => ({
  time: worldTime(state),
  zone: "reservoir",
  playerPresent: true,
  nearbyCharacterIds,
});

it("registers each approved identity exactly once and preserves existing records on load", () => {
  const state = fresh();
  const cast = new Map(
    queryGangWorld(state).characters.map((person) => [person.id, person]),
  );
  expect(additions).toHaveLength(22);
  expect(new Set(additions).size).toBe(22);
  expect(cast.size).toBe(Object.keys(state.characters).length);
  expect(
    Object.entries(state.characters).every(([id, actor]) => id === actor.id),
  ).toBe(true);
  expect(Object.keys(state.factions)).toHaveLength(5);
  expect(state.crew.members).toEqual(["flacco"]);
  for (const id of [...splash, "quanny"])
    expect(cast.get(id)).toMatchObject({
      affiliation: "blocks",
      internalSocialGroup: "splash-gang",
    });
  for (const id of blocks)
    expect(cast.get(id)).toMatchObject({
      affiliation: "blocks",
      internalSocialGroup: null,
      rank: null,
    });
  for (const id of civilians)
    expect(cast.get(id)).toMatchObject({
      affiliation: null,
      internalSocialGroup: null,
      employment: null,
    });
  for (const id of additions)
    expect(cast.get(id)).toMatchObject({
      provisionalGameplayDefaults: true,
      home: "reservoir",
    });
  expect(cast.get("contact-blocks")?.affiliation).toBe("blocks");
  expect(cast.get("mr-lewis")?.occupation).toBe("Market owner and operator");
  expect(cast.get("mr-harris")?.occupation).toBe("Warehouse manager");
  expect(
    cast.get("quanny")!.relationships["baby-reek"].affection,
  ).toBeGreaterThan(0);
  expect(cast.get("baby-reek")!.relationships.quanny.affection).toBeGreaterThan(
    0,
  );

  // Simulate a schema-13 campaign from before the roster was registered.
  const old = fresh();
  for (const id of additions) delete old.characters[id];
  for (const actor of Object.values(old.characters)) {
    actor.known = actor.known.filter((id) => !additions.includes(id));
    actor.connections = actor.connections.filter(
      (id) => !additions.includes(id),
    );
    for (const id of additions) delete actor.relationships[id];
  }
  old.characters["contact-blocks"].wallet.clean = 123;
  old.characters.mega.relationships.player.trust = 13;
  const loaded = deserialize(serialize(old));
  expect(loaded.characters["contact-blocks"].wallet.clean).toBe(123);
  expect(loaded.characters.mega.relationships.player.trust).toBe(13);
  expect(queryGangWorld(loaded, additions).characters).toHaveLength(22);
  expect(deserialize(serialize(loaded))).toEqual(loaded);
  const bad = structuredClone(loaded);
  bad.characters["baby-reek"].id = "quanny";
  expect(() => deserialize(serialize(bad))).toThrow(/world references/);
});

it("projects detached schedules, directed relationships, policing, territory and rivalry", () => {
  const state = fresh();
  applyForJob(state, "unc-ray", "retail-reservoir");
  acceptJob(state, "unc-ray", "retail-reservoir");
  state.characters["unc-ray"].police = 12;
  state.characters["unc-ray"].stress = 30;
  const view = queryGangWorld(state, ["unc-ray"]);
  const [ray] = view.characters;
  expect(ray).toMatchObject({
    stress: 30,
    police: 12,
    occupation: "Barber shop operator",
    canRunPublicRoutine: true,
    employment: {
      jobId: "retail-reservoir",
      employerId: "mr-lewis",
      shiftTodayId: null,
      canWorkToday: false,
    },
  });
  expect(ray.employment?.nextShiftDay).toBeGreaterThan(state.day);
  expect(view.territory.find(({ id }) => id === "reservoir")).toMatchObject({
    controller: "blocks",
    police: state.zones.reservoir.police,
  });
  expect(view.factions.find(({ id }) => id === "blocks")).toMatchObject({
    allies: ["blips"],
    rivals: ["angels"],
  });
  expect(view.warfare).toEqual({
    activeWars: null,
    startingRivalry: { factions: ["blocks", "angels"], activeWar: false },
  });
  ray.traits.lawful = -1;
  ray.relationships["mr-lewis"].trust = -99;
  ray.employment!.workdays.length = 0;
  view.factions[0].rivals.length = 0;
  view.territory[0].police = -1;
  expect(state.characters["unc-ray"].traits.lawful).not.toBe(-1);
  expect(state.characters["unc-ray"].relationships["mr-lewis"].trust).not.toBe(
    -99,
  );
  expect(currentEmployment(state, "unc-ray")!.workdays).not.toEqual([]);
  expect(
    queryGangWorld(state).factions.find(({ id }) => id === "angels")!.rivals,
  ).toEqual(["blocks"]);
  expect(queryGangWorld(state).territory[0].police).not.toBe(-1);
});

it("uses verified mapped presence for Quanny and Lewis while keeping authored actions at the market", () => {
  const state = fresh();
  at(state, court);
  connect(state, state.playerId, "quanny");
  connect(state, state.playerId, "mr-lewis");
  const context = {
    actorId: state.playerId,
    locationId: court,
    time: worldTime(state),
    peopleHere: ["quanny", "mr-lewis"],
  };
  const view = queryLocation(state, context);
  for (const id of context.peopleHere) {
    expect(
      view.actions.find(
        ({ command }) => command.type === "contact" && command.targetId === id,
      )?.error,
    ).toBeNull();
  }
  expect(
    view.actions.some(({ command }) =>
      ["meetQuanny", "quanny", "lewisDelivery"].includes(command.type),
    ),
  ).toBe(false);
  expect(
    queryLocation(state, { ...context, peopleHere: [] }).actions.some(
      ({ command }) => command.targetId === "quanny",
    ),
  ).toBe(false);
  const later = advanceWorldTime(state, 2);
  expect(
    executeLocationAction(later, context, {
      type: "contact",
      targetId: "mr-lewis",
    }),
  ).toMatchObject({
    state: later,
    error: expect.stringMatching(/out of date/),
  });
});

it("opens a free street conversation and settles only a validated social action", () => {
  const state = fresh();
  const targetId = "mr-lewis";
  const command = { type: "contact", targetId } as const;
  connect(state, state.playerId, targetId);
  const observation = observe(state, targetId);
  const before = structuredClone(state);
  const view = queryStreetConversation(state, observation, targetId);
  expect(view).toMatchObject({ present: true, error: null });
  expect(
    view.actions.find((action) => action.command.type === "contact"),
  ).toMatchObject({ error: null, cost: { ap: 1 } });
  expect(state).toEqual(before);

  const result = executeStreetConversationAction(state, observation, command);
  expect(result.error).toBeNull();
  expect(result.state.ap).toBe(state.ap - 1);
  expect(worldTime(result.state).minuteOfDay).toBe(
    observation.time.minuteOfDay + 15,
  );
  expect(result.state.presence).toBeUndefined();
  expect(result.state.danger.exposure).toEqual(state.danger.exposure);
  expect(result.eventIds).toContain(result.event?.id);
  expect(
    result.state.events.filter(({ category }) => category === "social"),
  ).toEqual([result.event]);
  expect(result.eventIds).toEqual(result.state.events.map(({ id }) => id));
  expect(
    result.state.characters[targetId].relationships.player.trust,
  ).toBeGreaterThan(before.characters[targetId].relationships.player.trust);
  expect(state).toEqual(before);
  expect(
    executeStreetConversationAction(result.state, observation, command),
  ).toMatchObject({
    state: result.state,
    error: expect.stringMatching(/out of date/),
  });
  state.ap = 0;
  expect(
    queryStreetConversation(state, observation, targetId).actions.find(
      (action) => action.command.type === "contact",
    )?.error,
  ).toMatch(/not enough AP/i);
});

it("rejects invalid location or identities, lack of proximity, unwillingness and active encounters", () => {
  const state = fresh();
  const target = "quanny";
  const observation = observe(state, target);
  expect(queryStreetConversation(state, observation, target)).toMatchObject({
    present: true,
    error: expect.stringMatching(/learn who/),
  });
  connect(state, state.playerId, target);
  const command = { type: "contact", targetId: target } as const;
  for (const bad of [
    { ...observation, locationId: "made-up-shop" },
    { ...observation, zone: "nawf", locationId: market } as const,
    { ...observation, playerPresent: false },
    { ...observation, nearbyCharacterIds: [] },
    { ...observation, time: { ...observation.time, day: state.day - 1 } },
  ])
    expect(executeStreetConversationAction(state, bad, command).state).toBe(
      state,
    );
  expect(
    queryStreetConversation(state, observation, "constructor").error,
  ).toMatch(/canonical/);
  expect(
    queryStreetConversation(state, observation, state.playerId).error,
  ).toMatch(/canonical/);
  state.characters.quanny.relationships.player.grievance = 80;
  expect(queryStreetConversation(state, observation, target)).toMatchObject({
    present: true,
    error: expect.stringMatching(/don’t want/),
  });
  state.characters.quanny.relationships.player.grievance = 0;
  state.characters.quanny.availableDay += 1;
  expect(queryStreetConversation(state, observation, target)).toMatchObject({
    present: true,
    error: expect.stringMatching(/busy/),
  });
  at(state, market);
  state.characters.quanny.availableDay = state.day;
  const met = executeLocationAction(
    state,
    {
      actorId: state.playerId,
      locationId: market,
      time: worldTime(state),
      peopleHere: [target],
    },
    { type: "meetQuanny", targetId: target },
  );
  expect(met.error).toBeNull();
  expect(
    queryStreetConversation(met.state, observe(met.state, target), target)
      .error,
  ).toMatch(/active encounter/i);
});

it("gives each canonical worker one paid shift at dawn and ignores repeated observed visits", () => {
  const state = fresh();
  const actorId = "unc-ray";
  applyForJob(state, actorId, "retail-reservoir");
  acceptJob(state, actorId, "retail-reservoir");
  currentEmployment(state, actorId)!.workdays = [0, 1, 2, 3, 4, 5, 6];
  const wallet = state.characters[actorId].wallet.clean;
  const next = advanceActiveTime(state, 2 * CYCLE_MS);
  const e = currentEmployment(next, actorId)!;
  expect(e.attendance.map(({ day, status }) => ({ day, status }))).toEqual([
    { day: 2, status: "worked" },
    { day: 3, status: "worked" },
  ]);
  expect(next.characters[actorId].wallet.clean).toBe(wallet + 2 * e.wage);
  expect(queryGangWorld(next, [actorId]).characters[0]).toMatchObject({
    canTakeDailyAction: false,
    employment: { shiftTodayId: null, canWorkToday: false },
  });
  const intent = {
    actorId,
    command: { type: "work", targetId: e.jobId },
    day: next.day,
  } as const;
  const presence = {
    locationId: market,
    peopleHere: [actorId],
    time: worldTime(next),
  };
  for (let visit = 0; visit < 2; visit++)
    expect(executeNpcLocationIntent(next, intent, presence)).toMatchObject({
      state: next,
      eventIds: [],
    });
  expect(
    executeLocationAction(next, { ...presence, actorId }, intent.command).state,
  ).toBe(next);
  advanceNPCs(next);
  expect(e.attendance).toHaveLength(2);
  expect(next.characters[actorId].wallet.clean).toBe(wallet + 2 * e.wage);
});

it("distinguishes public routine eligibility, private unavailability, custody, treatment and death", () => {
  const state = fresh();
  state.characters["baby-reek"].availableDay += 4;
  state.characters.k3.status = "laying-low";
  state.characters.k3.availableDay += 4;
  state.characters.bam.status = "dead";
  const harm = record(state, "risk", "An injury.", ["trell"], ["trell"], {
    world: {
      kind: "injury",
      subjectId: "trell",
      transition: "hospital-admission",
    },
  });
  state.characters.trell.status = "laying-low";
  state.characters.trell.hospitalizationEventId = harm.id;
  state.characters.trell.availableDay += 1;
  arrest(state, "nook", "Tested custody");
  const playerIncident = record(state, "risk", "An assault.", ["player"]);
  hospitalize(state, "assault", playerIncident.id);
  const reloaded = deserialize(serialize(state));
  const statuses = (s: GameState) =>
    Object.fromEntries(
      queryGangWorld(s).characters.map((c) => [
        c.id,
        [c.status, c.canRunPublicRoutine],
      ]),
    );
  expect(statuses(reloaded)).toMatchObject({
    quanny: ["active", true],
    "baby-reek": ["temporarily-unavailable", true],
    k3: ["laying-low", false],
    trell: ["hospitalized", false],
    nook: ["incarcerated", false],
    player: ["hospitalized", false],
    bam: ["dead", false],
  });
  const next = advanceDay(reloaded);
  expect(statuses(next).trell).toEqual(["active", true]);
  expect(queryGangWorld(next, ["trell"], harm.id).worldEvents).toContainEqual(
    expect.objectContaining({
      world: {
        kind: "release",
        subjectId: "trell",
        transition: "hospital-discharge",
        sourceEventId: harm.id,
      },
    }),
  );
});

it("provides trusted event identities and causes while keeping private metadata out of player notices", () => {
  const state = fresh();
  const incident = record(
    state,
    "risk",
    "A witness reported a robbery.",
    ["nook"],
    ["nook"],
    {
      world: { kind: "crime", locationId: market, zone: "reservoir" },
    },
  );
  arrest(state, "nook", "witness report", 1, incident.id);
  const arrestEvent = state.events.at(-1)!;
  const influence = applyInfluence(state, {
    actor: "blocks",
    faction: "blocks",
    zone: "reservoir",
    magnitude: 1,
    kind: "support",
    cause: "Neighborhood support.",
  });
  const rival = state.strategic.territories.reservoir;
  for (const key of ["presence", "influence", "economy", "support"] as const)
    adjustFoothold(state, "reservoir", "blocks", key, -100);
  for (
    let day = 0;
    day < STRATEGY_BALANCE.lossDays && rival.controller === "blocks";
    day++
  ) {
    state.day++;
    resolveTerritories(state);
  }
  const view = queryGangWorld(state, [], incident.id);
  expect(view.worldEvents).toContainEqual(
    expect.objectContaining({
      id: arrestEvent.id,
      actors: ["nook"],
      world: {
        kind: "arrest",
        subjectId: "nook",
        transition: "custody-start",
        sourceEventId: incident.id,
        locationId: market,
        zone: "reservoir",
      },
    }),
  );
  expect(view.worldEvents).toContainEqual(
    expect.objectContaining({
      world: expect.objectContaining({
        kind: "territory-change",
        zone: "reservoir",
        previousController: "blocks",
      }),
    }),
  );
  expect(visibleEvents(state).some(({ id }) => id === arrestEvent.id)).toBe(
    false,
  );
  expect(
    visibleEvents(state).find(({ id }) => id === influence.id),
  ).not.toHaveProperty("world");
  view.worldEvents.find(({ id }) => id === arrestEvent.id)!.world!.locationId =
    "made-up";
  expect(
    state.events.find(({ id }) => id === arrestEvent.id)!.world!.locationId,
  ).toBe(market);
  expect(deserialize(serialize(state)).events).toEqual(state.events);
});

it("round-trips a native simulation snapshot and safely drops invalid or stale snapshots", () => {
  const state = fresh();
  const now = worldTime(state);
  const native = new LivingBlockSim({
    engineDay: now.day,
    startMinuteOfDay: now.minuteOfDay,
    seed: 42,
    engineState: state,
  });
  const snapshot = native.serialize();
  const captured = withSimulationSnapshot(state, snapshot);
  expect(captured.sim).toEqual(snapshot);
  expect(captured.sim).not.toBe(snapshot);
  const loaded = deserialize(serialize(captured));
  expect(loaded.version).toBe(GAME_SAVE_VERSION);
  expect(loaded.sim).toEqual(snapshot);
  expect(
    restoreSimFromSave(loaded, { engineState: loaded }).sim.serialize(),
  ).toEqual(snapshot);
  expect(deserialize(serialize(state)).sim).toBeUndefined();
  const cyclic = { ...snapshot, extra: {} };
  Object.assign(cyclic.extra, { cyclic });
  expect(withSimulationSnapshot(state, cyclic).sim).toBeUndefined();
  expect(deserialize(serialize({ ...state, sim: cyclic }))).toEqual(state);

  const raw = JSON.parse(serialize(captured));
  for (const invalid of [
    { ...snapshot, schemaVersion: 0 },
    { ...snapshot, disturbances: undefined },
    { ...snapshot, npcs: [null] },
    { ...snapshot, npcs: [snapshot.npcs[0], snapshot.npcs[0]] },
    { ...snapshot, npcs: [{ ...snapshot.npcs[0], isCanonical: false }] },
    {
      ...snapshot,
      npcs: [{ ...snapshot.npcs[0], id: "fake", isCanonical: true }],
    },
    { ...snapshot, clock: { ...snapshot.clock, engineDay: now.day + 1 } },
  ]) {
    raw.state.sim = invalid;
    expect(deserialize(JSON.stringify(raw))).toEqual(state);
  }
  for (const status of ["dead", "arrested", "laying-low"] as const) {
    const changed = structuredClone(captured);
    changed.characters.quanny.status = status;
    expect(campaignSimulationSnapshot(changed)).toBeUndefined();
    const restored = deserialize(serialize(changed));
    expect(restored.characters.quanny.status).toBe(status);
    expect(restored.sim).toBeUndefined();
    const eligibility = new Set(
      queryGangWorld(restored)
        .characters.filter((c) => c.canRunPublicRoutine)
        .map((c) => c.id),
    );
    expect(eligibility.has("quanny")).toBe(false);
    const profiles = createReservoirNpcProfiles(restored).filter(
      ({ id, isCanonical }) => !isCanonical || eligibility.has(id),
    );
    const fallback = restoreSimFromSave(restored, {
      engineDay: now.day,
      startMinuteOfDay: now.minuteOfDay,
      seed: restored.rng,
      profiles,
    });
    expect(fallback.restoredFromSnapshot).toBe(false);
    expect(fallback.sim.serialize().npcs.map(({ id }) => id)).not.toContain(
      "quanny",
    );
    expect(
      restoreSimFromSave(restored, {
        engineDay: now.day,
        startMinuteOfDay: now.minuteOfDay,
        seed: restored.rng,
        profiles,
      }).sim.serialize(),
    ).toEqual(fallback.sim.serialize());
  }
});
