import { newGame } from "./legacyGame";
import { type GameState, player } from "../core/GameState";
import { presenceOf } from "../board/presence";
import { boardPeople } from "../board/people";
import { LOCATIONS } from "../board/locations";
import { connect } from "../systems/Relationships";
import { ROBBERY_TARGETS } from "../content/robberyCareer";
import { offerTarget, inviteRobbery } from "../systems/RobberyCareer";
import {
  purchasePrep,
  PREPARATION,
  startRobbery,
  robberyInput,
} from "../systems/Robbery";
import { skillsOf } from "../systems/Skills";
import { gain, receivePhysical } from "../systems/Inventory";
export const ok = (r: GameState | string): GameState => {
  if (typeof r === "string") throw new Error(r);
  return r;
};
export function at(s: GameState, location: string) {
  const l = LOCATIONS.find((l) => l.id === location)!;
  s.presence = {
    ...presenceOf(s),
    location,
    zone: l.zone,
    trail: [...(s.presence?.trail ?? []), { location, day: s.day }].slice(-12),
  };
}
export function person(s: GameState, id: string) {
  at(s, boardPeople(s).find((p) => p.id === id)!.placeId);
}
export function base(seed = 42) {
  const s = newGame("Career", "south", seed);
  s.encounters.forEach((e) => (e.status = "closed"));
  s.characters.player.wallet.clean = 5000;
  connect(s, "player", "dizzy");
  s.characters.dizzy.relationships.player.trust = 85;
  connect(s, "player", "mega");
  s.characters.mega.relationships.player.trust = 90;
  return s;
}
export function shop(s: GameState, kind = "strong-arm") {
  for (const item of (kind === "home" || kind === "store"
    ? ["gloves", "mask", "duffle"]
    : ["gloves", "mask"]) as (keyof typeof PREPARATION)[]) {
    at(s, PREPARATION[item].location);
    s.ap = 2;
    s = purchasePrep(s, item, PREPARATION[item].location);
  }
  s.ap = 2;
  return s;
}
export function ranks(s: GameState, rank = 2) {
  const p = skillsOf(player(s));
  p.milestones = {
    certified: 1,
    violentSuccess: 9,
    robberySuccess: rank === 3 ? 9 : 3,
    robberyAccess2: 1,
    robberyAccess3: 1,
  };
  p.xp.combat = 4500;
  p.xp.robbery = rank === 3 ? 4000 : 900;
  receivePhysical(s, "player", gain("law-19"));
  player(s).equipment!.equipped = "law-19";
}
export function crew(s: GameState, jobId: string) {
  person(s, "mega");
  for (const item of ["gloves", "mask", "law-19"] as const)
    receivePhysical(s, "mega", gain(item));
  s.characters.mega.equipment!.equipped = "law-19";
  return ok(inviteRobbery(s, "mega", jobId));
}
export function begin(s: GameState, id = "street.rio", victim?: string) {
  if (!victim) at(s, ROBBERY_TARGETS.find((t) => t.id === id)!.location);
  s = ok(offerTarget(s, id, victim));
  const j = s.robberies!.jobs.at(-1)!;
  const result = startRobbery(s, j.id);
  if (result.error) throw new Error(result.error);
  return result.state;
}
export function input(s: GameState, answer: string) {
  const a = s.activeRobbery!;
  return robberyInput(s, a.id, a.cursor, answer);
}
export function won(s: GameState) {
  s.activeRobbery!.career!.roll = 0;
  s.activeRobbery!.career!.riskRoll = 0.99;
  return s;
}
export function finish(s: GameState) {
  s = input(s, "patient");
  return input(s, "deescalate");
}
