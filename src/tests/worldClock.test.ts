import { describe, expect, it, vi } from "vitest";
import {
  executeLocationAction,
  queryLocation,
} from "../city/LocationInteractions";
import { CYCLE_MS, WORLD_CLOCK } from "../content/worldClock";
import { executeTimedAction } from "../core/ActionTiming";
import { ACTIONS, performAction } from "../core/ActionEngine";
import { record } from "../core/EventLog";
import { player, type GameState } from "../core/GameState";
import { newGame } from "../core/Simulation";
import {
  advanceActiveTime,
  advanceWorldTime,
  worldTime,
} from "../core/TimeSystem";
import { deserialize, serialize } from "../persistence/SaveSystem";
import {
  activeSlotForMinute,
  createReservoirNpcProfiles,
} from "../sim/schedules";
import { acceptJob, applyForJob, shiftToday } from "../systems/Employment";
import { respondEncounter } from "../systems/Encounters";
import { acquire } from "../systems/StreetEconomy";
import {
  endStreetSession,
  startStreetSession,
} from "../systems/StreetSessions";
import { presenceOf } from "../board/presence";

const openCity = () => newGame("Test", "south", 2026, { openCity: true });

function shiftWithStock() {
  let s = openCity();
  applyForJob(s, s.playerId, "retail-south");
  acceptJob(s, s.playerId, "retail-south");
  acquire(s, "mega", "consignment");
  s = advanceActiveTime(s, CYCLE_MS);
  expect(shiftToday(s)).toBeDefined();
  expect(s.ap).toBe(3);
  return s;
}

const work = { actor: "player", type: "work" } as const;
const dayCommitment = { durationMinutes: 0, endsDay: true };

describe("daily AP and action duration", () => {
  it("starts fresh and open-city campaigns at dawn with 3 AP", () => {
    const fresh = newGame("Test", "south");
    for (const s of [fresh, openCity()]) {
      expect(s.ap).toBe(3);
      expect(worldTime(s)).toEqual({
        day: 1,
        minuteOfDay: 360,
        isDaytime: true,
      });
    }
    expect(fresh.incidents["the-chains"]).toBeDefined();
    expect(openCity().incidents["the-chains"]).toBeUndefined();
  });

  it("works a real paid 2 AP shift after a 1 AP trapping session", () => {
    let s = shiftWithStock();
    s.presence = { ...presenceOf(s), location: "south.the-lot", zone: "south" };
    const trapping = startStreetSession(s, "south.the-lot");
    expect(trapping.error).toBeNull();
    expect(trapping.state.ap).toBe(2);
    s = endStreetSession(trapping.state, trapping.state.activeSession!.id);
    const workResult = performAction(s, work);
    expect(workResult.error).toBeNull();
    expect(workResult.state.day).toBe(s.day);
    expect(workResult.state.ap).toBe(0);
    expect(player(workResult.state).wallet.clean).toBe(
      player(s).wallet.clean + s.employment[0].wage,
    );
    expect(worldTime(workResult.state).minuteOfDay).toBe(
      360 + ACTIONS.work.durationMinutes,
    );
  });

  it("leaves 1 AP after a shift and rejects a 2 AP shift after two minor activities", () => {
    const start = shiftWithStock();
    const worked = performAction(start, work);
    expect(worked.error).toBeNull();
    expect(worked.state.ap).toBe(1);
    expect(worked.state.day).toBe(start.day);

    const gig = performAction(start, { type: "gig", actor: start.playerId });
    const rest = performAction(gig.state, {
      type: "rest",
      actor: start.playerId,
    });
    expect(gig.error).toBeNull();
    expect(rest.error).toBeNull();
    expect(rest.state.ap).toBe(1);
    expect(performAction(rest.state, work)).toMatchObject({
      state: rest.state,
      error: "Not enough AP left today",
    });
  });

  it.each([2, 3])(
    "resolves a 2 AP day commitment from %i AP before rolling to dawn",
    (available) => {
      const s = advanceWorldTime({ ...openCity(), ap: available }, 720);
      // Fixture represents an eligible gameplay attempt with a resolved unsuccessful outcome.
      const resolve = vi.fn(() => {
        const next = structuredClone(s);
        next.ap -= 2;
        const event = record(next, "risk", "The attempt failed.", [
          next.playerId,
        ]);
        return { state: next, error: null, event };
      });
      const request = executeTimedAction(s, 2, dayCommitment, null, resolve);
      expect(request.confirmation?.unusedAP).toBe(available - 2);
      expect(request.state).toBe(s);
      expect(resolve).not.toHaveBeenCalled();
      const cancelled = executeTimedAction(s, 2, dayCommitment, null, resolve, {
        decision: "cancel",
      });
      expect(cancelled.state).toBe(s);
      expect(resolve).not.toHaveBeenCalled();
      const finished = executeTimedAction(s, 2, dayCommitment, null, resolve, {
        decision: "proceed",
      });
      expect(resolve).toHaveBeenCalledOnce();
      expect(finished.event).toMatchObject({
        day: 1,
        text: "The attempt failed.",
      });
      expect(worldTime(finished.state)).toEqual({
        day: 2,
        minuteOfDay: 360,
        isDaytime: true,
      });
      expect(finished.state.ap).toBe(3);
      expect(s.ap).toBe(available);
      expect(worldTime(s).minuteOfDay).toBe(1080);
    },
  );

  it("persists a confirmed opt-out and still checks eligibility and advances the day", () => {
    const s = openCity();
    const resolve = (state: GameState) => ({
      state: { ...structuredClone(state), ap: state.ap - 2 },
      error: null,
    });
    const first = executeTimedAction(
      s,
      2,
      dayCommitment,
      null,
      () => resolve(s),
      { decision: "proceed-and-suppress" },
    );
    const saved = deserialize(serialize(first.state));
    expect(saved.skipEndDayWarning).toBe(true);
    const next = executeTimedAction(saved, 2, dayCommitment, null, () =>
      resolve(saved),
    );
    expect(next.confirmation).toBeUndefined();
    expect(next.state.day).toBe(3);
    const insufficient = { ...saved, ap: 1 };
    const cannotRun = vi.fn(() => resolve(insufficient));
    const blocked = executeTimedAction(
      insufficient,
      2,
      dayCommitment,
      null,
      cannotRun,
      { decision: "proceed" },
    );
    expect(blocked.error).toMatch(/not enough AP/i);
    expect(blocked.state).toBe(insufficient);
    expect(cannotRun).not.toHaveBeenCalled();
  });
});

describe("authoritative clock", () => {
  it.each([0, 1, 2, 3])(
    "runs for 5 minutes of daylight and 7 of night at %i AP",
    (ap) => {
      const s = { ...openCity(), ap };
      const beforeDusk = advanceActiveTime(s, WORLD_CLOCK.daylightMs - 1);
      expect(worldTime(beforeDusk).isDaytime).toBe(true);
      const dusk = advanceActiveTime(beforeDusk, 1);
      expect(worldTime(dusk)).toEqual({
        day: 1,
        minuteOfDay: 1080,
        isDaytime: false,
      });
      const beforeDawn = advanceActiveTime(dusk, WORLD_CLOCK.nighttimeMs - 1);
      expect(beforeDawn.ap).toBe(ap);
      expect(worldTime(beforeDawn).isDaytime).toBe(false);
      const dawn = advanceActiveTime(beforeDawn, 1);
      expect(worldTime(dawn)).toEqual({
        day: 2,
        minuteOfDay: 360,
        isDaytime: true,
      });
      expect(dawn.ap).toBe(3);
      expect(
        dawn.ledger.filter((row) => row.reason === "Daily living expenses"),
      ).toHaveLength(1);
      expect(s.day).toBe(1);
    },
  );

  it("uses the same civil-time snapshot for NPC schedules and mapped business hours", () => {
    let s = newGame("Test", "reservoir", 2026, { openCity: true });
    s.presence = { ...presenceOf(s), location: "reservoir.lil-jays" };
    const context = { actorId: s.playerId, locationId: "reservoir.lil-jays" };
    const command = { type: "buy", targetId: "smokes" } as const;
    const lewis = createReservoirNpcProfiles(s).find(
      (p) => p.id === "mr-lewis",
    )!;
    s = advanceWorldTime(s, 3 * 60);
    expect(
      activeSlotForMinute(lewis.schedule, worldTime(s).minuteOfDay)?.activity,
    ).toBe("work_shift");
    expect(
      queryLocation(s, context).actions.find((a) => a.command.type === "buy")
        ?.error,
    ).toBeNull();
    const night = advanceWorldTime(s, 13 * 60);
    expect(
      activeSlotForMinute(lewis.schedule, worldTime(night).minuteOfDay)
        ?.activity,
    ).toBe("home_rest");
    const closed = executeLocationAction(night, context, command);
    expect(closed.error).toMatch(/closed/);
    expect(closed.state).toBe(night);
  });

  it("applies configurable travel durations across dusk, midnight and dawn without AP cost", () => {
    const s = advanceWorldTime({ ...openCity(), ap: 1 }, 11 * 60);
    const ride = advanceWorldTime(s, 2 * 60);
    expect(worldTime(ride)).toEqual({
      day: 1,
      minuteOfDay: 19 * 60,
      isDaytime: false,
    });
    expect(ride.ap).toBe(1);
    expect(ride.presence).toEqual(s.presence);
    const late = advanceWorldTime(ride, 6 * 60);
    expect(worldTime(late)).toEqual({
      day: 1,
      minuteOfDay: 60,
      isDaytime: false,
    });
    const overnight = advanceWorldTime(late, 6 * 60);
    expect(worldTime(overnight)).toEqual({
      day: 2,
      minuteOfDay: 7 * 60,
      isDaytime: true,
    });
    expect(overnight.ap).toBe(3);
  });

  it("runs deadlines once across natural dawns, including after reload", () => {
    let s = newGame("Test", "south");
    const intro = s.encounters.find(
      (e) => e.definitionId === "mega-chains-request",
    )!;
    s = respondEncounter(s, intro.id, "promise").state;
    const chain = s.incidents["the-chains"];
    const due = chain.startedDay + chain.deadline;
    const before = advanceActiveTime(s, (due - 1) * CYCLE_MS - 1);
    expect(before.incidents[chain.id].status).toBe("active");
    const atDeadline = advanceActiveTime(deserialize(serialize(before)), 1);
    expect(atDeadline.day).toBe(due);
    expect(atDeadline.incidents[chain.id].resolution).toBe("sold");
    expect(
      atDeadline.commitments.find((c) => c.kind === "recover-property")?.status,
    ).toBe("broken");
    const reloaded = deserialize(serialize(atDeadline));
    expect(reloaded).toEqual(atDeadline);
    const after = advanceActiveTime(reloaded, CYCLE_MS);
    const resolution = atDeadline.incidents[chain.id].resolvedEventId;
    expect(
      after.events.filter((event) => event.id === resolution),
    ).toHaveLength(1);
  });

  it("round-trips clock and remaining AP and rejects legacy payloads", () => {
    const s = { ...advanceActiveTime(openCity(), CYCLE_MS + 32_123), ap: 1 };
    expect(s.day).toBe(2);
    expect(s.cycleElapsedMs).toBe(32_123);
    expect(deserialize(serialize(s))).toEqual(s);
    const raw = JSON.parse(serialize(s));
    for (const version of [8, 9, 10, 11, 12]) {
      raw.version = raw.state.version = version;
      expect(() => deserialize(JSON.stringify(raw))).toThrow(/version 13/);
    }
  });
});
