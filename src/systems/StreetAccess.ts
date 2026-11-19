import { player, type GameState } from "../core/GameState";
import { skillRank } from "./Skills";
export const TRIO = ["dizzy", "babycanon", "joker"];
export function pabloError(s: GameState, id: string) {
  return id === "pablo" &&
    player(s).affiliation !== "angels" &&
    skillRank(player(s), "trapper") < 4
    ? "Pablo only sits down with Angels or trappers who’ve made Big Dog. You can still get word to him about the chains through someone he trusts."
    : null;
}
export function workIntroError(s: GameState) {
  const t = s.streetLife;
  if (!t || t.legacy || t.workEvent) return null;
  return t.decision === "unasked"
    ? "Talk to Cuzzo about his chains first, then find some honest work."
    : "Find some honest work first: apply for a job or take a local gig.";
}
export function lessonError(s: GameState) {
  return (
    workIntroError(s) ??
    (s.streetLife && s.streetLife.lesson === "waiting"
      ? "Meet Cuzzo at the Southside Lot with your pack for your first lesson."
      : null)
  );
}
export function personalBeef(s: GameState, id: string) {
  return s.danger.conflicts.some(
    (c) =>
      c.state !== "settled" &&
      c.participants.includes(s.playerId) &&
      c.participants.includes(id),
  );
}
