import type { GameEvent, GameState } from "./GameState";
import { advanceDay, advanceWorldTime } from "./TimeSystem";

export interface ActionTiming {
  durationMinutes: number;
  endsDay: boolean;
}

export const INSTANT_ACTION: ActionTiming = {
  durationMinutes: 0,
  endsDay: false,
};

export type DayEndDecision = "cancel" | "proceed" | "proceed-and-suppress";

export interface DayEndWarning {
  title: string;
  message: string;
  unusedAP: number;
  preferenceLabel: string;
}

/** Inspect only after the action's specific eligibility checks have passed. */
export function dayEndWarning(
  state: GameState,
  apCost: number,
  timing: ActionTiming,
): DayEndWarning | null {
  if (
    state.end ||
    !timing.endsDay ||
    state.ap < apCost ||
    state.skipEndDayWarning
  )
    return null;
  const unusedAP = state.ap - apCost;
  return {
    title: "This action will end your day.",
    message:
      `This action costs ${apCost} AP and will consume the rest of your day.` +
      (unusedAP ? ` You’ll lose your remaining ${unusedAP} AP.` : ""),
    unusedAP,
    preferenceLabel: "Never show this warning again",
  };
}

/** Apply time after gameplay effects have resolved. A day commitment goes directly to next dawn. */
export function finishActionTiming(
  state: GameState,
  timing: ActionTiming,
  inPlace = false,
) {
  return timing.endsDay
    ? advanceDay(state, { inPlace })
    : advanceWorldTime(state, timing.durationMinutes, { inPlace });
}

export interface TimedActionResult {
  state: GameState;
  error: string | null;
  event?: GameEvent;
  confirmation?: DayEndWarning;
}

/**
 * The resolver owns AP expenditure and the gameplay outcome, including a resolved failure.
 * Call with current state and fresh eligibility on Proceed. Cancelling never calls the resolver.
 */
export function executeTimedAction(
  state: GameState,
  apCost: number,
  timing: ActionTiming,
  error: string | null,
  resolve: () => TimedActionResult,
  {
    decision,
    inPlace = false,
  }: { decision?: DayEndDecision; inPlace?: boolean } = {},
): TimedActionResult {
  if (decision === "cancel") return { state, error: null };
  if (error || state.end || state.ap < apCost)
    return {
      state,
      error:
        error ??
        (state.end ? "This story has ended." : "Not enough AP left today"),
    };
  const confirmation = dayEndWarning(state, apCost, timing);
  if (confirmation && !decision) return { state, error: null, confirmation };
  const result = resolve();
  if (result.error || (result.state === state && !inPlace)) return result;
  if (timing.endsDay && decision === "proceed-and-suppress")
    result.state.skipEndDayWarning = true;
  return { ...result, state: finishActionTiming(result.state, timing, true) };
}
