import { clamp, player, type GameState, type ZoneId } from "../core/GameState";
import { record } from "../core/EventLog";
import { expense } from "./Economy";
import { contactError, change } from "./Relationships";
import { availability } from "./CrewAgency";
import { applyInfluence } from "./Territory";
import { AUTHORITY_STAGES, STRATEGY_BALANCE as B } from "../content/strategy";
export const POLITICAL_ACTIONS = {
  community: {
    label: "Build Community Support",
    cost: 25,
    authority: 0,
    kind: "community",
    magnitude: 8,
  },
  support: {
    label: "Support Local Interests",
    cost: 40,
    authority: 10,
    kind: "support",
    magnitude: 8,
  },
  operation: {
    label: "Back a Neighborhood Operation",
    cost: 100,
    authority: 25,
    kind: "economic",
    magnitude: 14,
  },
  challenge: {
    label: "Challenge Rival Influence",
    cost: 80,
    authority: 45,
    kind: "challenge",
    magnitude: 14,
  },
  cooperate: {
    label: "Negotiate Cooperation",
    cost: 30,
    authority: 25,
    kind: "defense",
    magnitude: 8,
  },
  priority: {
    label: "Propose Territorial Priority",
    cost: 60,
    authority: 45,
    kind: "support",
    magnitude: 5,
  },
} as const;
export type PoliticalAction = keyof typeof POLITICAL_ACTIONS;
export function authorityStage(s: GameState) {
  return [...AUTHORITY_STAGES]
    .reverse()
    .find((x) => player(s).authority >= x.authority);
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
export function politicalError(
  s: GameState,
  type: PoliticalAction,
  zone: ZoneId,
  target?: string,
): string | null {
  const p = player(s),
    a = POLITICAL_ACTIONS[type];
  if (s.end || p.status !== "active")
    return "You can’t do that right now";
  if (s.ap < 1) return "You need 1 AP";
  if (
    s.strategic.lastActionDay &&
    s.day - s.strategic.lastActionDay < B.actionCooldown
  )
    return `You can put money into a neighborhood again on day ${s.strategic.lastActionDay + B.actionCooldown}`;
  if (p.wallet.clean + p.wallet.illicit < a.cost) return `You need $${a.cost}`;
  if (type === "community")
    return p.neighborhoodStanding[zone] >= 5 || p.home === zone
      ? null
      : "You need some standing in this neighborhood first";
  if (!p.affiliation)
    return "You need to be part of an organization first";
  if (p.authority < a.authority)
    return `You need more say in your organization for this (${AUTHORITY_STAGES.find((x) => x.authority >= a.authority)?.name ?? "a higher"} rank)`;
  const c = target ? s.characters[target] : undefined;
  if (!c || c.affiliation !== p.affiliation)
    return "Work through someone from your organization";
  const error = contactError(s, p.id, c.id);
  if (error) return error;
  if (c.home !== zone && p.authority < 45)
    return "Right now you can only act in this person’s own neighborhood";
  if ((c.relationships[p.id]?.trust ?? 0) < 35)
    return "They don’t trust you enough to act for you yet";
  if (
    type === "challenge" &&
    !s.factions[p.affiliation].enemies.some(
      (id) => s.strategic.territories[zone].factions[id].presence >= 20,
    )
  )
    return "No rival has a real foothold here";
  if (
    type === "priority" &&
    s.strategic.strategies[p.affiliation].priorityUntil >= s.day
  )
    return "Your organization is already focused somewhere";
  return null;
}
export function politicalAction(
  state: GameState,
  type: PoliticalAction,
  zone: ZoneId,
  target?: string,
) {
  const error = politicalError(state, type, zone, target);
  if (error) return { state, error };
  const s = structuredClone(state),
    p = player(s),
    a = POLITICAL_ACTIONS[type];
  expense(s, p, a.cost, a.label);
  s.ap--;
  s.strategic.lastActionDay = s.day;
  const faction = type === "community" ? null : p.affiliation;
  applyInfluence(s, {
    actor: p.id,
    participants: target ? [target] : [],
    faction,
    zone,
    kind: a.kind,
    magnitude: a.magnitude,
    cause: `${p.name} spent $${a.cost} to ${a.label.toLowerCase()} in ${s.zones[zone].name}.`,
  });
  p.neighborhoodStanding[zone] = clamp(p.neighborhoodStanding[zone] + 4);
  if (type === "community") {
    p.legitimacy = clamp(p.legitimacy + 2);
    s.zones[zone].support = clamp(s.zones[zone].support + 1);
  }
  if (faction) {
    // Durable influence needs local cooperation as well as money or pressure.
    applyInfluence(s, {
      actor: p.id,
      participants: target ? [target] : [],
      faction,
      zone,
      kind: "community",
      magnitude: type === "cooperate" ? 8 : 4,
      cause: `${p.name}’s work through local contacts brought ${s.factions[faction].name} closer to the neighborhood.`,
    });
    s.factions[faction].resources = clamp(
      s.factions[faction].resources + a.cost * 0.4,
      0,
      B.resourceCap,
    );
    s.strategic.contributions[faction] += a.cost * 0.5;
    p.organizationStanding[faction] = clamp(
      p.organizationStanding[faction] + 3,
    );
    if (target) change(s.characters[target], p.id, { trust: 2, respect: 2 });
    if (type === "challenge") {
      const rival = s.factions[faction].enemies.find(
        (id) => s.strategic.territories[zone].factions[id].presence >= 20,
      )!;
      applyInfluence(s, {
        actor: p.id,
        faction: rival,
        zone,
        kind: "disruption",
        magnitude: 7,
        cause: `Pushing back in the neighborhood hurt ${s.factions[rival].name}’s business.`,
      });
      p.rivalThreat = clamp(p.rivalThreat + 5);
      s.factions[faction].instability = clamp(
        s.factions[faction].instability + 2,
      );
    }
    if (type === "cooperate") {
      s.factions[faction].instability = clamp(
        s.factions[faction].instability - 4,
      );
      s.strategic.territories[zone].factions[faction].pressure = clamp(
        s.strategic.territories[zone].factions[faction].pressure - 6,
      );
    }
    if (type === "priority") {
      const plan = s.strategic.strategies[faction];
      plan.priority = zone;
      plan.priorityUntil = s.day + 20;
    }
  }
  return { state: s, error: null };
}
export function promotionRequirements(s: GameState) {
  const p = player(s),
    stage = AUTHORITY_STAGES.find((x) => x.authority > p.authority),
    f = p.affiliation ? s.factions[p.affiliation] : null;
  const missing: string[] = [];
  if (!f || !stage)
    return {
      stage,
      missing: [f ? "You’re as high as you can go" : "You need to join an organization"],
    };
  if (p.organizationStanding[f.id] < stage.standing)
    missing.push(`${stage.standing} organizational standing`);
  if (s.strategic.contributions[f.id] < stage.contribution)
    missing.push(
      `$${stage.contribution} contributed to the organization`,
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
  player(s).authority = r.stage.authority;
  s.strategic.lastPromotionDay = s.day;
  record(
    s,
    "city",
    `${player(s).name} stepped up to ${r.stage.name}. You can now: ${r.stage.permission.charAt(0).toLowerCase() + r.stage.permission.slice(1)}. The leadership is still in charge.`,
    [s.playerId],
    [s.playerId],
    {
      importance: "major",
      title: "Moving up",
      factionId: player(s).affiliation!,
    },
  );
  return { state: s, error: null };
}
export function successorError(s: GameState, id: string): string | null {
  const p = player(s),
    c = s.characters[id];
  if (!p.affiliation || p.authority < 70)
    return "Only the succession council can name a successor";
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
    },
  );
  return { state: s, error: null };
}
