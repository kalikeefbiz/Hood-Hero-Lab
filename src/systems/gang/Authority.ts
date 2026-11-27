import { BALANCE } from "../../content/balance";
import { AUTHORITY_STAGES } from "../../content/strategy";
import {
  player,
  type Character,
  type GameState,
  type ZoneId,
} from "../../core/GameState";
import { record } from "../../core/EventLog";
import { availability } from "../CrewAgency";
import { hospitalStay } from "../Danger";
import { settlePlayerProgress } from "../Progression";
import { contactError } from "../Relationships";
import { stabilizedControl } from "../Territory";

export type GangRank = (typeof AUTHORITY_STAGES)[number]["name"];

function authorityStages(character: Character) {
  return AUTHORITY_STAGES.map((stage) => ({
    ...stage,
    name:
      character.affiliation === "blocks" && stage.name === "King Pin"
        ? ("Big Homie" as const)
        : stage.name,
  }));
}

export function authorityStage(state: GameState) {
  return authorityStages(player(state))
    .reverse()
    .find((stage) => player(state).authority >= stage.authority);
}

/** NPC leadership is authored independently of the player's authority ladder. */
export function rankFor(
  state: GameState,
  character: Character,
): GangRank | null {
  if (!character.affiliation) return null;
  if (character.id === "quanny" && character.affiliation === "blocks")
    return "Big Homie";
  if (character.id !== state.playerId) return null;
  return authorityStage(state)?.name ?? null;
}

export function authorityRequiredFor(state: GameState, authority: number) {
  return authorityStages(player(state)).find(
    (stage) => stage.authority >= authority,
  )?.name;
}

export function representative(s: GameState, zone: ZoneId) {
  const p = player(s);
  return p.connections
    .map((id) => s.characters[id])
    .find(
      (c) =>
        c.affiliation === p.affiliation &&
        !!p.affiliation &&
        (c.home === zone || p.authority >= 45) &&
        !contactError(s, p.id, c.id) &&
        (c.relationships[p.id]?.trust ?? 0) >= 35,
    )?.id;
}

export function promotionRequirements(s: GameState) {
  const p = player(s),
    stage = authorityStages(p).find((x) => x.authority > p.authority),
    f = p.affiliation ? s.factions[p.affiliation] : null;
  const missing: string[] = [];
  if (!f || !stage)
    return {
      stage,
      missing: [
        f ? "You’re as high as you can go" : "You need to join an organization",
      ],
    };
  if (p.organizationStanding[f.id] < stage.standing)
    missing.push(`${stage.standing} organizational standing`);
  if (s.strategic.contributions[f.id] < stage.contribution)
    missing.push(
      `${stage.contribution} contribution points with the organization`,
    );
  if (
    s.strategic.membershipDay === null ||
    s.day - s.strategic.membershipDay < stage.days
  )
    missing.push(`${stage.days} days of membership`);
  if (s.day - s.strategic.lastPromotionDay < 7)
    missing.push("A week since your last step up");
  const contacts = p.connections
    .map((id) => s.characters[id])
    .filter(
      (c) =>
        c.affiliation === f.id &&
        c.status === "active" &&
        !contactError(s, p.id, c.id),
    );
  const leader = f.leaders.filter(
    (id) => s.characters[id]?.status === "active",
  );
  const sponsors = leader.length
    ? contacts.filter((c) => leader.includes(c.id))
    : contacts;
  if (
    !sponsors.some(
      (c) =>
        (c.relationships[p.id]?.trust ?? 0) >= stage.trust &&
        (c.relationships[p.id]?.grievance ?? 0) < 30,
    )
  )
    missing.push(
      `The trust of ${leader.length ? "the people running things" : "whoever vouched for you"}`,
    );
  if (f.instability > 65)
    missing.push("Less infighting inside the organization");
  if (
    p.notoriety > 70 ||
    s.commitments.some(
      (c) =>
        c.actor === p.id &&
        ["broken", "failed"].includes(c.status) &&
        s.day - c.dueDay < 14,
    )
  )
    missing.push("A reliable record lately, and less heat on your name");
  if (
    stage.authority >= 45 &&
    (!s.commitments.some(
      (c) => c.actor === p.id && ["fulfilled", "completed"].includes(c.status),
    ) ||
      p.influence < 15)
  )
    missing.push("A promise you’ve kept, and more influence of your own");
  return { stage, missing };
}
export function promote(state: GameState) {
  const r = promotionRequirements(state);
  if (
    state.end ||
    player(state).status !== "active" ||
    state.ap < 1 ||
    r.missing.length ||
    !r.stage
  )
    return {
      state,
      error: r.missing.join("; ") || "You need 1 AP and to be free",
    };
  const s = structuredClone(state);
  s.ap--;
  const p = player(s);
  const promoted = r.stage.name !== rankFor(s, p);
  p.authority = r.stage.authority;
  s.strategic.lastPromotionDay = s.day;
  record(
    s,
    "city",
    `${p.name} ${promoted ? `stepped up to ${r.stage.name}` : "gained more authority"}. You can now: ${r.stage.permission.charAt(0).toLowerCase() + r.stage.permission.slice(1)}.`,
    [s.playerId],
    [s.playerId],
    {
      importance: "major",
      title: "Moving up",
      factionId: p.affiliation!,
      world: { kind: "faction-development", subjectId: p.id },
    },
  );
  settlePlayerProgress(s);
  return { state: s, error: null };
}
export function successorError(s: GameState, id: string): string | null {
  const p = player(s),
    c = s.characters[id];
  if (!p.affiliation || p.authority < BALANCE.underlordAuthority)
    return "You need enough authority to name a successor";
  if (!c || !s.crew.members.includes(id) || c.id === p.id)
    return "They need to be in your Set";
  if (c.affiliation !== p.affiliation)
    return "They need to be in your organization";
  if (c.status !== "active" || c.availableDay > s.day || availability(s, c))
    return "They need to be around and free";
  const r = c.relationships[p.id];
  if (!r || r.trust < 60 || r.grievance >= 30 || c.traits.loyalty < 60)
    return "They need to be fully loyal to you, with no bad blood";
  if (contactError(s, p.id, id))
    return "They need to know you well and be willing";
  return null;
}
export function appointSuccessor(state: GameState, id: string) {
  const error = successorError(state, id);
  if (error || state.end || state.ap < 1 || player(state).status !== "active")
    return { state, error: error ?? "You need 1 AP and to be free" };
  const s = structuredClone(state);
  s.ap--;
  s.crew.successor = id;
  record(
    s,
    "crew",
    `${s.characters[id].name} agreed to take your place in ${s.factions[player(s).affiliation!].name} when the time comes.`,
    [s.playerId, id],
    [s.playerId, id],
    {
      importance: "major",
      title: "Successor appointed",
      factionId: player(s).affiliation!,
      world: { kind: "faction-development", subjectId: id },
    },
  );
  settlePlayerProgress(s);
  return { state: s, error: null };
}

export function underlordProgress(state: GameState) {
  const p = player(state);
  const available =
    p.status !== "arrested" && p.status !== "dead" && !hospitalStay(state);
  const authorityEligible = p.authority >= BALANCE.underlordAuthority;
  const zones = p.affiliation ? stabilizedControl(state, p.affiliation) : 0;
  const successorId = state.crew.successor;
  const successorEligible =
    successorId !== null && !successorError(state, successorId);
  return {
    available,
    zones,
    requiredZones: BALANCE.underlordZones,
    authorityEligible,
    successorId,
    successorEligible,
    eligible:
      !!p.affiliation &&
      available &&
      zones >= BALANCE.underlordZones &&
      authorityEligible &&
      successorEligible,
  };
}

export function clearSuccessor(state: GameState, memberId: string) {
  if (state.crew.successor === memberId) state.crew.successor = null;
}
