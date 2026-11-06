import { player, type GameState } from "../core/GameState";
import { skillRank } from "./Skills";
export const TRIO = ["dizzy", "babycanon", "joker"];
export function pabloError(s: GameState, id: string) {
  return id === "pablo" &&
    player(s).affiliation !== "angels" &&
    skillRank(player(s), "trapper") < 4
    ? "Pablo only receives Angels members or Big Dog trappers. The Chains can still reach him through the dispute intermediary."
    : null;
}
export function workIntroError(s: GameState) {
  const t = s.streetLife;
  if (!t || t.legacy || t.workEvent) return null;
  return t.decision === "unasked"
    ? "Speak with Mega about the Chains first, then visit a City workplace or gig."
    : "First submit a valid application at a City workplace or complete a local gig. Applications offer scheduled shifts; gigs pay immediately.";
}
export function lessonError(s: GameState) {
  return (
    workIntroError(s) ??
    (s.streetLife && s.streetLife.lesson === "waiting"
      ? "Meet Mega at the Southside Lot with starter stock for your first trapping lesson."
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
