import { clamp, player, type GameState, type ZoneId } from "../core/GameState";
import { expense } from "./Economy";
import { contactError, change } from "./Relationships";
import { authorityRequiredFor } from "./gang/Authority";
import { applyFactionConsequences } from "./gang/Consequences";
import { settlePlayerProgress } from "./Progression";
import { adjustFoothold, applyInfluence } from "./Territory";
import { STRATEGY_BALANCE as B } from "../content/strategy";
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
    return `You need more say in your organization for this (${authorityRequiredFor(s, a.authority) ?? "a higher"} rank)`;
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
    applyFactionConsequences(s, faction, {
      resources: a.cost * 0.4,
      contribution: a.cost * 0.5,
      standing: { characterId: p.id, amount: 3 },
    });
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
      applyFactionConsequences(s, faction, { instability: 2 });
    }
    if (type === "cooperate") {
      applyFactionConsequences(s, faction, { instability: -4 });
      adjustFoothold(s, zone, faction, "pressure", -6);
    }
    if (type === "priority") {
      applyFactionConsequences(s, faction, {
        priority: { zone, untilDay: s.day + 20 },
      });
    }
  }
  settlePlayerProgress(s);
  return { state: s, error: null };
}

// Keep existing strategy callers on the same engine contracts.
export { appointSuccessor, authorityStage, promote, promotionRequirements, representative, successorError } from "./gang/Authority";
