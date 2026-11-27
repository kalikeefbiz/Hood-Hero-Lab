import { settlePlayerProgress } from "./Progression";
import {
  openingDecision,
  giveFlaccoStock,
  settleAftermath,
} from "./StreetLife";
import { resolveQuanny } from "./Quanny";
import { hospitalStay, resolveStreetScene } from "./Danger";
import { acquire, repay } from "./StreetEconomy";
import {
  acceptCrewOffer,
  attendCrewActivity,
  requestActivity,
} from "./CrewAgency";
import type { EncounterInstance, GameState } from "../core/GameState";
import { encounterDefinition, syncEncounters } from "./EncounterLifecycle";
export {
  encounterDefinition,
  syncEncounters,
  currentEncounter,
  openEncounter,
  dismissEncounter,
} from "./EncounterLifecycle";
import { resolveWorkplace } from "./Workplace";
import { performAction, validateAction } from "../core/ActionEngine";
import { acknowledgeEvent, record } from "../core/EventLog";
import { promiseHelp } from "./Commitments";
import type { EncounterResponse } from "../core/Encounter";
import type { DayEndDecision, TimedActionResult } from "../core/ActionTiming";
export function responseError(
  s: GameState,
  e: EncounterInstance,
  r: EncounterResponse,
): string | null {
  if (s.end) return "Your story has ended";
  if (hospitalStay(s))
    return "You’re still in the hospital.";
  if (!encounterDefinition(e).eligible(s, e))
    return "That moment has passed";
  if (e.status !== "active") return "Start the conversation first";
  if (r.effect.type === "action") return validateAction(s, r.effect.action);
  return r.requirement?.(s, e) ?? null;
}
export function respondEncounter(
  state: GameState,
  id: string,
  responseId: string,
  decision?: DayEndDecision,
): TimedActionResult {
  if (decision === "cancel") return { state, error: null };
  const original = state.encounters.find((e) => e.id === id);
  const response =
    original &&
    encounterDefinition(original)
      .responses(state, original)
      .find((r) => r.id === responseId);
  if (!original || !response)
    return { state, error: "You can’t say that now" };
  const error = responseError(state, original, response);
  if (error) return { state, error };
  const startEvent = state.events.length;
  const recordResponse = (next: GameState) => {
    next.encounters.find((e) => e.id === id)!.selectedResponses.push({
      id: responseId,
      day: next.day,
      eventIds: next.events.slice(startEvent).map((e) => e.id),
    });
    syncEncounters(next);
  };
  let s = structuredClone(state);
  const effect = response.effect;
  if (effect.type === "life") {
    if (effect.choice === "gift") giveFlaccoStock(s);
    else settleAftermath(s);
    const e = s.encounters.find((e) => e.id === id)!;
    e.status = "acknowledged";
    e.followUpPending = false;
  } else if (effect.type === "quanny") {
    const e = s.encounters.find((x) => x.id === id)!;
    resolveQuanny(s, e, effect.choice);
    e.selectedResponses.push({
      id: responseId,
      day: s.day,
      eventIds: s.events.slice(startEvent).map((e) => e.id),
    });
    syncEncounters(s);
    return { state: s, error: null };
  } else if (effect.type === "danger") {
    const e = s.encounters.find((x) => x.id === id)!;
    const scene = s.danger.scenes.find((x) => x.id === e.dangerSceneId)!;
    resolveStreetScene(s, scene, effect.choice);
    e.status = "acknowledged";
    e.selectedResponses.push({
      id: responseId,
      day: s.day,
      eventIds: s.events.slice(startEvent).map((x) => x.id),
    });
    syncEncounters(s);
    return { state: s, error: null };
  } else if (effect.type === "street") {
    const e = s.encounters.find((e) => e.id === id)!;
    if (effect.choice === "acquire")
      acquire(s, effect.supplier!, effect.arrangement!);
    if (effect.choice === "repay")
      repay(s, effect.agreementId!, effect.amount!);
    e.selectedResponses.push({
      id: responseId,
      day: s.day,
      eventIds: s.events.slice(startEvent).map((e) => e.id),
    });
    if (effect.choice !== "terms") {
      e.status = "acknowledged";
      e.followUpPending = false;
    }
    syncEncounters(s);
    return { state: s, error: null };
  } else if (effect.type === "crew") {
    const e = s.encounters.find((e) => e.id === id)!;
    if (effect.choice === "details") {
      e.selectedResponses.push({ id: responseId, day: s.day, eventIds: [] });
      return { state: s, error: null };
    }
    if (effect.choice === "request")
      requestActivity(
        s,
        e.participants[0],
        effect.activity!,
        effect.compensation,
      );
    if (effect.choice === "attend") attendCrewActivity(s, effect.assignmentId!);
    if (effect.choice === "request" || effect.choice === "attend") settlePlayerProgress(s);
    if (effect.choice === "accept") acceptCrewOffer(s, e.crewOfferId!);
    if (effect.choice === "decline") {
      const o = s.crewOffers.find((o) => o.id === e.crewOfferId)!;
      o.status = "declined";
      record(
        s,
        "crew",
        `${s.characters[o.member].name}: “All good. I’ll get on with my own plans.” No hard feelings.`,
        [o.member, s.playerId],
        undefined,
        { importance: "routine" },
      );
    }
    e.status = "acknowledged";
    e.followUpPending = false;
    e.selectedResponses.push({
      id: responseId,
      day: s.day,
      eventIds: s.events.slice(startEvent).map((e) => e.id),
    });
    syncEncounters(s);
    return { state: s, error: null };
  } else if (effect.type === "workplace") {
    resolveWorkplace(
      s,
      s.encounters.find((e) => e.id === id)!,
      effect.choice,
    );
    syncEncounters(s);
    return { state: s, error: null };
  } else if (effect.type === "action") {
    const result = performAction(s, effect.action, {
      inPlace: true,
      decision,
      afterEffects: recordResponse,
    });
    return result.error || result.confirmation ? { ...result, state } : result;
  } else {
    const e = s.encounters.find((e) => e.id === id)!;
    const incident = e.incidentId ? s.incidents[e.incidentId] : undefined;
    if (incident && effect.type !== "acknowledge") incident.informed = true;
    if (
      ["promise", "decline", "delay"].includes(effect.type) &&
      e.incidentId === "the-chains"
    )
      openingDecision(s, effect.type as "promise" | "decline" | "delay");
    if (effect.type === "promise" && incident) promiseHelp(s, incident, e.id);
    if (effect.type === "decline")
      record(
        s,
        "social",
        "You told Cuzzo you’re staying out of it.",
        [s.playerId, "mega"],
        undefined,
        { incidentId: e.incidentId },
      );
    if (effect.type === "delay") {
      e.status = "pending";
      e.deferred = true;
      record(
        s,
        "social",
        "You asked Cuzzo for time to think it over.",
        [s.playerId, "mega"],
        undefined,
        { incidentId: e.incidentId },
      );
    }
    if (effect.type === "promise" || effect.type === "decline") {
      e.status = "acknowledged";
      e.followUpPending = false;
    }
    if (effect.type === "acknowledge") {
      if (e.sourceEventId) s = acknowledgeEvent(s, e.sourceEventId);
      else e.status = "acknowledged";
    }
  }
  recordResponse(s);
  return { state: s, error: null };
}
