/** Read-only portrait selection for Flacco from the conversation so far. */
import type { EncounterInstance, GameState } from "../core/GameState";
import type { Expression } from "./characterArt";

export function flaccoExpression(
  s: GameState,
  e: EncounterInstance,
  fallback: Expression,
): Expression {
  const last = e.selectedResponses.at(-1);
  const evidence = new Set(last?.eventIds ?? []);
  if (e.definitionId === "flacco-six")
    return last ? "confident" : e.deferred ? "neutral" : "proposing";
  if (e.definitionId === "life-flacco-follow") return "confident";
  if (e.definitionId === "life-flacco-set") return "skeptical";
  if (e.definitionId.startsWith("crew-")) {
    const assignment = s.assignments.find(
      (a) => a.member === "flacco" && a.eventIds.some((id) => evidence.has(id)),
    );
    if (assignment?.status === "refused" || assignment?.success === false)
      return "concerned";
    if (last?.id === "accept" || assignment?.success) return "confident";
    if (last?.id === "decline") return "skeptical";
    return e.definitionId === "crew-offer" ? "proposing" : "strategizing";
  }
  if (e.definitionId === "living-danger") {
    const scene = s.danger.scenes.find((x) => x.id === e.dangerSceneId);
    if (scene?.motive === "war" || scene?.motive === "history") return "skeptical";
    return last ? fallback : "neutral";
  }
  if (e.deferred) return "concerned";
  return fallback === "confident" && !last ? "neutral" : fallback;
}
