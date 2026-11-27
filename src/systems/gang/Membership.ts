import { BALANCE } from "../../content/balance";
import { AUTHORITY_STAGES } from "../../content/strategy";
import { clamp, type Character, type GameState } from "../../core/GameState";
import { witnessIdentity } from "../Danger";
import { change } from "../Relationships";
import { applyInfluence } from "../Territory";
import { applyFactionConsequences } from "./Consequences";

export function membershipError(
  type: "standing" | "affiliate",
  actor: Character,
  contact: Character | undefined,
) {
  if (type === "standing")
    return contact?.affiliation ? null : "They aren’t with an organization";
  if (actor.affiliation) return "Already affiliated";
  if (!contact?.affiliation) return "A member must sponsor you";
  if (
    actor.organizationStanding[contact.affiliation] <
      BALANCE.affiliationStanding ||
    (contact.relationships[actor.id]?.trust ?? 0) < BALANCE.affiliationTrust
  )
    return `Requires ${BALANCE.affiliationStanding} organizational standing and a sponsor willing to vouch for you`;
  return null;
}

/** Called by ActionEngine after contact eligibility and the action cost are settled. */
export function resolveStanding(
  state: GameState,
  actor: Character,
  contact: Character,
) {
  const faction = contact.affiliation!;
  applyFactionConsequences(state, faction, {
    standing: { characterId: actor.id, amount: 8 },
  });
  actor.neighborhoodStanding[contact.home] = clamp(
    actor.neighborhoodStanding[contact.home] + 5,
  );
  actor.influence += 3;
  actor.legitimacy = clamp(actor.legitimacy + 1);
  change(contact, actor.id, { trust: 5, respect: 4 });
  if (actor.id === state.playerId) {
    applyInfluence(state, {
      actor: actor.id,
      participants: [contact.id],
      faction,
      zone: contact.home,
      kind: "support",
      magnitude: 1.5,
      cause: `${actor.name} helped out in the neighborhood, and people noticed who you run with.`,
    });
    if (actor.affiliation === faction)
      applyFactionConsequences(state, faction, { contribution: 2 });
  }
  return `${actor.name} strengthened a connection with ${state.factions[faction].name}.`;
}

/** The existing sponsorship path. Initiation may supply evidence at this boundary in a later phase. */
export function resolveAffiliation(
  state: GameState,
  actor: Character,
  sponsor: Character,
) {
  const faction = sponsor.affiliation!;
  actor.affiliation = faction;
  actor.authority = AUTHORITY_STAGES[0].authority;
  if (actor.id === state.playerId) state.strategic.membershipDay = state.day;
  change(sponsor, actor.id, { respect: 5 });
  return `${sponsor.name} vouched for ${actor.name}, and ${state.factions[faction].name} took you in. Your Set is still your own crew.`;
}

export function recordSponsorship(
  state: GameState,
  sponsorId: string,
  memberId: string,
  eventId: string,
  locationId: string,
) {
  witnessIdentity(
    state,
    sponsorId,
    memberId,
    eventId,
    locationId,
    "sponsorship",
    true,
  );
}
