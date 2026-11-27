import { player, type FactionId, type GameState } from "../../core/GameState";
import { visibleEvents } from "../../core/EventLog";
import { worldTime } from "../../core/TimeSystem";
import { inventoryOf } from "../Inventory";
import { npcCanTakeDailyAction } from "../NPCDecisionAI";
import { rankFor, underlordProgress } from "./Authority";

function territorySummary(state: GameState) {
  return Object.values(state.zones).map(({ id, name }) => {
    const { controller, contested } = state.strategic.territories[id];
    return { id, name, controller, contested };
  });
}

function factionSummary(
  state: GameState,
  id: FactionId,
  known: ReadonlySet<FactionId>,
) {
  const faction = state.factions[id];
  return {
    id,
    name: faction.name,
    allies: faction.allies.filter((ally) => known.has(ally)),
    rivals: faction.enemies.filter((rival) => known.has(rival)),
  };
}

/** Player-facing disclosure. All returned values are detached from engine state. */
export function queryGangMenu(state: GameState) {
  const p = player(state);
  const territory = territorySummary(state);
  const visible = visibleEvents(state);
  const known = new Set<FactionId>();
  if (p.affiliation) known.add(p.affiliation);
  for (const { controller } of territory) if (controller) known.add(controller);
  for (const event of visible) if (event.factionId) known.add(event.factionId);
  for (const faction of Object.values(state.factions))
    if (p.organizationStanding[faction.id] > 0) known.add(faction.id);

  return {
    day: state.day,
    affiliation: p.affiliation,
    rank: rankFor(state, p),
    factions: [...known].map((id) => ({
      ...factionSummary(state, id, known),
      standing: p.organizationStanding[id],
    })),
    territory,
    developments: visible
      .filter((event) => event.factionId)
      .map(({ id, day, title, text, factionId }) => ({
        id,
        day,
        title,
        text,
        factionId,
      })),
    set: {
      capacity: state.crew.capacity,
      members: state.crew.members.map((id) => {
        const { name, alias, status } = state.characters[id];
        return {
          id,
          name,
          alias,
          status,
          inventory: inventoryOf(state, id).slots.map(
            ({ itemId, kind, quantity }) => ({
              itemId,
              kind,
              quantity,
            }),
          ),
        };
      }),
    },
    underlord: p.affiliation ? underlordProgress(state) : null,
  };
}

export type GangMenuView = ReturnType<typeof queryGangMenu>;

/** Trusted simulation input. Scope identity and observed events to the requested actors. */
export function queryGangWorld(
  state: GameState,
  actorIds: readonly string[],
  afterEventId?: string,
) {
  const requested = new Set(actorIds);
  const after = afterEventId
    ? state.events.findIndex((event) => event.id === afterEventId)
    : -1;
  const characters = Object.values(state.characters).filter((actor) =>
    requested.has(actor.id),
  );
  const factionIds = new Set(Object.values(state.factions).map(({ id }) => id));

  return {
    time: worldTime(state),
    eventCursor: state.events.at(-1)?.id ?? null,
    characters: characters.map((actor) => ({
      id: actor.id,
      name: actor.name,
      alias: actor.alias,
      home: actor.home,
      affiliation: actor.affiliation,
      rank: rankFor(state, actor),
      status: actor.status,
      availableDay: actor.availableDay,
      lastActionDay: actor.lastActionDay,
      lastAssignmentDay: actor.agency.lastAssignmentDay,
      canTakeDailyAction:
        actor.id !== state.playerId && npcCanTakeDailyAction(state, actor),
      relationships: structuredClone(actor.relationships),
    })),
    factions: [...factionIds].map((id) =>
      factionSummary(state, id, factionIds),
    ),
    territory: territorySummary(state),
    events: state.events
      .slice(after + 1)
      .filter((event) => event.observedBy.some((id) => requested.has(id)))
      .map((event) => structuredClone(event)),
  };
}

export type GangWorldView = ReturnType<typeof queryGangWorld>;
