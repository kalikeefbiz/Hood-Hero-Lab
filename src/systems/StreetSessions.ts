import { finishSessionPartner, interruptSession } from "./SessionLifecycle";
import { z } from "zod";
import { player, type GameState } from "../core/GameState";
import { random } from "../core/Random";
import { record } from "../core/EventLog";
import { locationById } from "../board/locations";
import { presenceOf, assessRisk } from "../board/presence";
import { hospitalStay, streetConversation, expose } from "./Danger";
import { quannyConversation } from "./QuannyState";
import { buyerError, saleLot, resolveStreetBuyer } from "./StreetEconomy";
import { addExposure } from "./CriminalExposure";
import { syncEncounters, currentEncounter } from "./EncounterLifecycle";
import { skillsOf } from "./Skills";
import { transactionArrestChance } from "./CriminalExposure";
import { arrest } from "./Incarceration";

export const SESSION_BALANCE = {
  minBeats: 4,
  maxBeats: 6,
  beatMs: 7200,
  variationMs: 900,
};
const uint = z.number().int().nonnegative();
export const streetSessionSchema = z
  .object({
    id: z.string().min(1),
    location: z.string(),
    zone: z.enum(["downtown", "rio", "south", "reservoir", "nawf"]),
    lotId: z.string(),
    partner: z.string().optional(),
    startDay: uint,
    paidAP: z.literal(true),
    cursor: uint.max(6),
    beats: z
      .array(
        z.object({
          kind: z.enum(["pass", "buyer", "witness", "rival", "patrol"]),
          seed: uint.max(4294967295),
          duration: uint.min(1000).max(15000),
        }),
      )
      .min(4)
      .max(6),
    settled: z.array(z.string()),
    status: z.enum(["active", "paused", "ended"]),
    reason: z.string(),
    totals: z.object({
      gross: uint,
      loss: uint,
      sold: uint,
      lost: uint,
      xp: uint,
      heat: z.number().finite().nonnegative(),
    }),
    lastText: z.string(),
  })
  .refine(
    (a) =>
      a.cursor <= a.beats.length &&
      a.settled.length === a.cursor &&
      new Set(a.settled).size === a.cursor &&
      a.settled.every((id, i) => id === `${a.id}:${i}`),
  );
export type StreetSession = z.infer<typeof streetSessionSchema>;
export const sessionRunning = (s: GameState) =>
  !!s.activeSession && s.activeSession.status !== "ended";
function interruption(s: GameState) {
  if (s.end || player(s).status !== "active" || hospitalStay(s))
    return "Session interrupted by confinement or injury.";
  if (streetConversation(s) || quannyConversation(s) || currentEncounter(s))
    return "Session interrupted by an encounter.";
  const a = s.activeSession;
  if (a && (a.startDay !== s.day || presenceOf(s).location !== a.location))
    return "You left the session.";
  return null;
}
export function validateStartStreetSession(s: GameState, location: string) {
  const l = locationById(location),
    p = player(s);
  if (!l || l.status !== "live" || !l.links.street)
    return "This is not an active street-work spot.";
  if (presenceOf(s).location !== location || presenceOf(s).zone !== l.zone)
    return "Go here on the City board first. You must physically stand at this spot.";
  if (sessionRunning(s)) return "Finish or leave your current session first.";
  // Ignore an old ended session when checking the new location/day.
  const error = interruption({ ...s, activeSession: undefined });
  if (error) return error;
  if (s.ap < 1) return "Requires 1 AP.";
  if (
    l.faction &&
    p.affiliation &&
    s.factions[l.faction].enemies.includes(p.affiliation)
  )
    return "Rival territory blocks street work here.";
  return buyerError(s, s.playerId, l.zone);
}
export function startStreetSession(state: GameState, location: string) {
  const error = validateStartStreetSession(state, location);
  if (error) return { state, error };
  const s = structuredClone(state),
    l = locationById(location)!;
  const count =
    SESSION_BALANCE.minBeats +
    Math.floor(
      random(s) * (SESSION_BALANCE.maxBeats - SESSION_BALANCE.minBeats + 1),
    );
  const beats: StreetSession["beats"] = [];
  for (let i = 0; i < count; i++) {
    const roll = random(s),
      risk = assessRisk(s, location);
    const kind =
      roll > 0.995 && player(s).police > 25
        ? "patrol"
        : roll < 0.23
          ? "pass"
          : roll < 0.9
            ? "buyer"
            : roll < 0.98 || risk.score < 25
              ? "witness"
              : "rival";
    beats.push({
      kind,
      seed: Math.floor(random(s) * 4294967296),
      duration:
        SESSION_BALANCE.beatMs +
        Math.floor((random(s) - 0.5) * SESSION_BALANCE.variationMs),
    });
  }
  s.ap--;
  const partner = s.assignments.find(
    (a) =>
      a.activity === "partner-crime" &&
      a.status === "active" &&
      a.participants.includes(s.playerId) &&
      s.characters[a.member]?.status === "active",
  )?.member;
  s.activeSession = {
    id: `session-${s.nextId++}`,
    location,
    zone: l.zone,
    lotId: saleLot(s)!.id,
    startDay: s.day,
    paidAP: true,
    partner,
    beats,
    cursor: 0,
    settled: [],
    status: "active",
    reason: "",
    totals: { gross: 0, loss: 0, sold: 0, lost: 0, xp: 0, heat: 0 },
    lastText: "Working the block. A visitor is approaching.",
  };
  record(s, "city", `Started trapping at ${l.name} · 1 AP paid.`, [s.playerId]);
  return { state: s, error: null };
}
export function advanceStreetSession(
  state: GameState,
  id: string,
  cursor: number,
) {
  const a = state.activeSession;
  if (
    !a ||
    a.id !== id ||
    a.cursor !== cursor ||
    a.status !== "active" ||
    cursor >= a.beats.length
  )
    return state;
  const s = structuredClone(state),
    session = s.activeSession!;
  const stop = interruption(s);
  if (stop) {
    interruptSession(s, stop);
    return s;
  }
  if (saleLot(s)?.id !== session.lotId) {
    session.status = "ended";
    session.reason = "Session stock is no longer available.";
    finishSessionPartner(s);
    return s;
  }
  const beat = session.beats[cursor],
    key = `${id}:${cursor}`,
    rng = s.rng;
  const xp = skillsOf(player(s)).xp.trapper,
    heat = player(s).police;
  // Isolated persisted RNG: reload and unrelated simulation cannot reroll a visitor.
  s.rng = beat.seed;
  if (beat.kind === "buyer") {
    const result = resolveStreetBuyer(s, id, cursor),
      t = result && s.street.transactions.at(-1);
    if (t) {
      session.totals.gross += t.gross;
      session.totals.loss += t.loss + t.crewPaid;
      session.totals.sold += t.sold;
      session.totals.lost += t.lost;
      session.lastText = t.sold
        ? `Buyer purchased ${t.sold} Pink Magic · $${t.gross}.`
        : `Buyer walked away · ${t.lost ? `${t.lost} stock lost` : t.loss ? `$${t.loss} lost` : "no purchase; exposure increased"}.`;
    } else session.lastText = "No offer: stock or local demand is exhausted.";
  } else if (beat.kind === "witness") {
    addExposure(s, s.playerId, session.zone, 4, true);
    session.lastText =
      "Word’s getting around that you’re working this block. Local exposure increased.";
    record(s, "risk", session.lastText, [s.playerId]);
  } else if (beat.kind === "patrol") {
    session.lastText =
      "A police patrol arrives. Current exposure determines intervention.";
    record(s, "risk", session.lastText, [s.playerId]);
    if (random(s) < transactionArrestChance(s, s.playerId, session.zone))
      arrest(s, s.playerId, "police patrol during street work", 1);
  } else if (beat.kind === "rival") {
    expose(s, session.location, "activity", key);
    session.lastText =
      "Someone is watching the block. Your local history determines their response.";
  } else session.lastText = "A passer-by walks on. No offer, no XP.";
  s.rng = rng;
  session.totals.xp += skillsOf(player(s)).xp.trapper - xp;
  session.totals.heat += Math.max(0, player(s).police - heat);
  session.settled.push(key);
  session.cursor++;
  syncEncounters(s);
  const reason = interruption(s);
  if (reason || session.cursor === session.beats.length || !saleLot(s)) {
    session.status = "ended";
    session.reason = reason ?? "Session complete.";
    finishSessionPartner(s);
    record(
      s,
      "city",
      `${session.reason} ${session.totals.sold} sold, ${session.totals.lost} lost, $${session.totals.gross - session.totals.loss} net cash, +${(session.totals.xp / 100).toFixed(2)} Trapper XP.`,
      [s.playerId],
    );
  }
  return s;
}
export function endStreetSession(
  state: GameState,
  id: string,
  reason = "Left early. Spent AP is not refunded.",
) {
  if (state.activeSession?.id !== id || !sessionRunning(state)) return state;
  const s = structuredClone(state);
  s.activeSession!.status = "ended";
  s.activeSession!.reason = reason;
  finishSessionPartner(s);
  return s;
}
export function pauseStreetSession(
  state: GameState,
  id: string,
  paused: boolean,
) {
  if (state.activeSession?.id !== id || !sessionRunning(state)) return state;
  const s = structuredClone(state),
    a = s.activeSession!;
  a.status = paused ? "paused" : "active";
  if (!paused && interruption(s)) {
    interruptSession(s, interruption(s)!);
  }
  return s;
}
export function validateSessionReferences(s: GameState) {
  const a = s.activeSession;
  if (!a) return;
  const l = locationById(a.location);
  if (
    !l?.links.street ||
    l.zone !== a.zone ||
    a.startDay > s.day ||
    !s.street.lots.some(
      (lot) => lot.id === a.lotId && lot.owner === s.playerId,
    ) ||
    (a.partner && !s.characters[a.partner])
  )
    throw new Error("Invalid street session references.");
  const tx = s.street.transactions.filter((t) => t.sessionId === a.id);
  if (
    tx.some(
      (t) =>
        t.lotId !== a.lotId ||
        t.market !== a.zone ||
        t.actor !== s.playerId ||
        t.sessionCursor === undefined ||
        t.sessionCursor >= a.cursor ||
        a.beats[t.sessionCursor]?.kind !== "buyer",
    ) ||
    new Set(tx.map((t) => t.sessionCursor)).size !== tx.length ||
    tx.reduce((n, t) => n + t.sold, 0) !== a.totals.sold ||
    tx.reduce((n, t) => n + t.lost, 0) !== a.totals.lost ||
    tx.reduce((n, t) => n + t.gross, 0) !== a.totals.gross ||
    tx.reduce((n, t) => n + t.loss + t.crewPaid, 0) !== a.totals.loss
  )
    throw new Error("Invalid session settlement totals.");
  if (
    a.status !== "ended" &&
    (a.startDay !== s.day || presenceOf(s).location !== a.location)
  )
    throw new Error("Invalid active street session presence.");
}
