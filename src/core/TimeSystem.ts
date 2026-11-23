import { tickRobberyCareer } from "../systems/RobberyCareer";
import { interruptSession } from "../systems/SessionLifecycle";
import { awardSkill } from "../systems/Skills";
import { advanceQuanny } from "../systems/Quanny";
import {
  advanceConflicts,
  dischargePatient,
  expose,
  hospitalStay,
} from "../systems/Danger";
import { presenceOf } from "../board/presence";
import { advanceBusinesses } from "../systems/Businesses";
import { resolveTerritories } from "../systems/Territory";
import { legitimateProgress, finalizeEnding } from "../systems/EndConditions";
import { advanceStreet } from "../systems/StreetEconomy";
import { releaseEligible } from "../systems/Incarceration";
import { processCrewActivities } from "../systems/CrewAgency";
import { cash, clamp, player, type GameState } from "./GameState";
import { record } from "./EventLog";
import { BALANCE } from "../content/balance";
import { CYCLE_MS, MINUTES_PER_DAY, WORLD_CLOCK } from "../content/worldClock";
import { earn, expense } from "../systems/Economy";
import { evaluatePromises } from "../systems/Commitments";
import { syncEncounters } from "../systems/EncounterLifecycle";
import { advanceNPCs } from "../systems/NPCDecisionAI";
import { advanceFactions } from "../systems/Factions";
import { advanceIncidents } from "../systems/Incidents";
import { advancePressure } from "../systems/Reputation";
import { progress } from "../systems/Progression";

import { settleAttendance, generateShifts } from "../systems/Employment";
import { settleWorkplaceScenes } from "../systems/Workplace";
const { dawnMinute, duskMinute, daylightMs, nighttimeMs } = WORLD_CLOCK;
const daylightMinutes = duskMinute - dawnMinute;
const nighttimeMinutes = MINUTES_PER_DAY - daylightMinutes;

function minutesFromDawn(elapsedMs: number) {
  return elapsedMs < daylightMs
    ? elapsedMs * daylightMinutes / daylightMs
    : daylightMinutes + (elapsedMs - daylightMs) * nighttimeMinutes / nighttimeMs;
}

function cycleOffset(minutes: number) {
  return minutes < daylightMinutes
    ? minutes * daylightMs / daylightMinutes
    : daylightMs + (minutes - daylightMinutes) * nighttimeMs / nighttimeMinutes;
}

/** The calendar day changes at dawn. Midnight only wraps the civil clock. */
export function worldTime(s: Pick<GameState, "day" | "cycleElapsedMs">) {
  return {
    day: s.day,
    minuteOfDay: (dawnMinute + minutesFromDawn(s.cycleElapsedMs)) % MINUTES_PER_DAY,
    isDaytime: s.cycleElapsedMs < daylightMs,
  };
}

export type WorldTime = ReturnType<typeof worldTime>;

function advanceTo(state: GameState, days: number, offset: number, inPlace: boolean) {
  if (!Number.isSafeInteger(state.day + days))
    throw new RangeError("World day is out of range.");
  // Clock-only updates can share world records. Daily transitions mutate them.
  let next = state;
  if (!inPlace) next = days ? structuredClone(state) : { ...state };
  for (let d = 0; d < days && !next.end; d++) advanceDay(next, { inPlace: true });
  if (!next.end) next.cycleElapsedMs = offset;
  return next;
}

/** Pass foreground, unpaused wall-clock time. AP and movement do not gate this. */
export function advanceActiveTime(
  state: GameState,
  elapsedMs: number,
  { inPlace = false } = {},
) {
  if (state.end || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  const total = state.cycleElapsedMs + elapsedMs;
  return advanceTo(state, Math.floor(total / CYCLE_MS), total % CYCLE_MS, inPlace);
}

/** Advance an in-world duration, e.g. route.hours * 60 for a train ride. */
export function advanceWorldTime(
  state: GameState,
  minutes: number,
  { inPlace = false } = {},
) {
  if (state.end || !Number.isFinite(minutes) || minutes <= 0) return state;
  const total = minutesFromDawn(state.cycleElapsedMs) + minutes;
  return advanceTo(
    state,
    Math.floor(total / MINUTES_PER_DAY),
    cycleOffset(total % MINUTES_PER_DAY),
    inPlace,
  );
}

/** By default the caller's state is preserved. Use inPlace only with exclusively owned state. */
export function advanceDay(state: GameState, { inPlace = false } = {}): GameState {
  if (state.end) return state;
  const s = inPlace ? state : structuredClone(state);
  interruptSession(s, "The day ended. Anyone still waiting moved on.");
  settleWorkplaceScenes(s);
  settleAttendance(s);
  s.day++;
  s.cycleElapsedMs = 0;
  tickRobberyCareer(s);
  advanceConflicts(s);
  advanceQuanny(s);
  for (const i of s.danger.injuries)
    if (i.severity === "minor" && !i.discharged && s.day >= i.releaseDay) { i.discharged = true; awardSkill(s, s.playerId, "survival", 50, `recovery:${i.id}`); }
  for (const c of Object.values(s.characters))
    if (
      c.id !== s.playerId &&
      c.status === "laying-low" &&
      c.availableDay <= s.day
    )
      c.status = "active";
  releaseEligible(s);
  advanceStreet(s);
  generateShifts(s);
  processCrewActivities(s);
  advanceNPCs(s);
  advanceFactions(s);
  resolveTerritories(s);
  advanceBusinesses(s);
  advanceIncidents(s);
  evaluatePromises(s);
  advancePressure(s);
  expose(s, presenceOf(s).location, "linger");
  if (s.end) {
    s.ap = 0;
    syncEncounters(s);
    return s;
  }
  const p = player(s),
    income =
      p.recurringLawfulIncome +
      s.assets
        .filter(
          (a) =>
            a.owner === p.id &&
            a.provenance === "clean" &&
            !s.strategic.businesses.some((b) => b.id === a.id),
        )
        .reduce((n, a) => n + a.recurringIncome, 0);
  if (income) earn(s, p, income, "clean", "Recurring lawful income");
  const paid = Math.min(BALANCE.livingCost, cash(p));
  expense(s, p, paid, "Daily living expenses");
  if (paid < BALANCE.livingCost) {
    s.street.arrears += BALANCE.livingCost - paid;
    p.stress = clamp(p.stress + 7);
    record(
      s,
      "money",
      `You could only cover $${paid} of today’s $${BALANCE.livingCost} living costs. Money worries are weighing on you.`,
      [p.id],
    );
  } else
    record(
      s,
      "money",
      `You paid $${paid} for today’s living costs.`,
      [p.id],
      [p.id],
      { importance: "routine" },
    );
  progress(s);
  s.strategic.lawfulStreak =
    legitimateProgress(s).income >= BALANCE.recurringIncomeVictory &&
    !legitimateProgress(s).recentCrime &&
    p.wallet.illicit === 0
      ? s.strategic.lawfulStreak + 1
      : 0;
  finalizeEnding(s);
  dischargePatient(s);
  s.ap =
    hospitalStay(s) || s.end
      ? 0
      : BALANCE.dailyAP -
        (s.danger.injuries.some((i) => !i.discharged && i.severity === "minor")
          ? 1
          : 0);
  record(
    s,
    "system",
    `Day ${s.day}. ${hospitalStay(s) ? "You’re still recovering in the hospital." : s.end ? "This life has ended." : `${s.ap} AP to spend.`}`,
    [p.id],
    [p.id],
    { importance: "routine" },
  );
  syncEncounters(s);
  return s;
}

export function serveSentence(state: GameState): GameState {
  const r = state.street.custody.find(
    (r) =>
      r.character === state.playerId &&
      r.status === "held" &&
      r.releaseDay !== null,
  );
  if (!r || state.end) return state;
  let s = state;
  const releaseDay = r.releaseDay!;
  while (s.day < releaseDay && !s.end) s = advanceDay(s);
  return s;
}

/** All normal day systems run during treatment; no frozen NPC/faction timeline. */
export function recoverInHospital(state: GameState): GameState {
  const stay = hospitalStay(state);
  if (!stay || state.end) return state;
  let s = state;
  while (s.day < stay.releaseDay && !s.end) s = advanceDay(s);
  return s;
}
