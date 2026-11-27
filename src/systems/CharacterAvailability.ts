import type { Character, GameState } from "../core/GameState";
import { hospitalStay } from "./Danger";

export type WorldCharacterStatus =
  | "active"
  | "temporarily-unavailable"
  | "laying-low"
  | "hospitalized"
  | "incarcerated"
  | "dead";

export function worldCharacterStatus(
  state: GameState,
  actor: Character,
): WorldCharacterStatus {
  if (actor.status === "dead") return "dead";
  if (actor.status === "arrested") return "incarcerated";
  if (actor.id === state.playerId && hospitalStay(state)) return "hospitalized";
  if (actor.status === "laying-low")
    return actor.hospitalizationEventId ? "hospitalized" : "laying-low";
  return actor.availableDay > state.day ? "temporarily-unavailable" : "active";
}

/** Temporarily busy people can still be nearby. Laying low is private, at Gemini's discretion. */
export function canRunPublicRoutine(status: WorldCharacterStatus) {
  return status === "active" || status === "temporarily-unavailable";
}
