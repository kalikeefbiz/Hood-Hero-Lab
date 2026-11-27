import {
  ACTIONS,
  actionExecutionError,
  performAction,
} from "../core/ActionEngine";
import {
  dayEndWarning,
  type DayEndDecision,
  type TimedActionResult,
} from "../core/ActionTiming";
import { player, type GameState, type ZoneId } from "../core/GameState";
import { worldTime, type WorldTime } from "../core/TimeSystem";
import { worldCharacterStatus } from "../systems/CharacterAvailability";
import { streetConversation } from "../systems/Danger";
import { currentEncounter } from "../systems/EncounterLifecycle";
import { quannyConversation } from "../systems/QuannyState";
import { contactError } from "../systems/Relationships";
import { resolveReservoirLocation } from "./reservoirLocations";

export type PresenceTime = Pick<WorldTime, "day" | "minuteOfDay">;

export function isCurrentPresenceTime(
  state: GameState,
  observation: PresenceTime | null | undefined,
) {
  const now = worldTime(state);
  return (
    now.day === observation?.day && now.minuteOfDay === observation.minuteOfDay
  );
}

export interface StreetPresenceObservation {
  time: PresenceTime;
  zone: ZoneId;
  /** Omit for a physical street position with no mapped gameplay location. */
  locationId?: string;
  playerPresent: boolean;
  nearbyCharacterIds: readonly string[];
}

export const STREET_SOCIAL_ACTIONS = [
  "contact",
  "socialize",
  "inquire",
  "introduce",
  "offer",
  "transfer",
] as const;
export interface StreetConversationCommand {
  targetId: string;
  type: (typeof STREET_SOCIAL_ACTIONS)[number];
}

/** The host verifies physical proximity. Gameplay owns willingness, story and action eligibility. */
export function queryStreetConversation(
  state: GameState,
  observation: StreetPresenceObservation,
  targetId: string,
) {
  const { time, zone, locationId, playerPresent, nearbyCharacterIds } =
    observation;
  const target = Object.hasOwn(state.characters, targetId)
    ? state.characters[targetId]
    : undefined;
  if (!target || targetId === state.playerId)
    return {
      error: "Choose a canonical NPC.",
      present: false,
      target: null,
      actions: [],
    };
  if (
    !Object.hasOwn(state.zones, zone) ||
    (locationId !== undefined &&
      resolveReservoirLocation(locationId)?.zone !== zone)
  )
    return {
      error: "Unknown street location.",
      present: false,
      target: null,
      actions: [],
    };
  if (!isCurrentPresenceTime(state, time))
    return {
      error: "That observation is out of date.",
      present: false,
      target: null,
      actions: [],
    };
  if (
    playerPresent !== true ||
    !Array.isArray(nearbyCharacterIds) ||
    !nearbyCharacterIds.includes(targetId)
  )
    return {
      error: "That person isn’t here.",
      present: false,
      target: null,
      actions: [],
    };

  const encounter = currentEncounter(state);
  const status = worldCharacterStatus(state, target);
  const p = player(state);
  const error = state.end
    ? "This story has ended."
    : encounter || streetConversation(state) || quannyConversation(state)
      ? "Finish the active encounter first."
      : state.activeRobbery && state.activeRobbery.status !== "ended"
        ? "Finish the job you’re on first."
        : worldCharacterStatus(state, p) !== "active"
          ? "You’re unavailable right now."
          : status === "hospitalized"
            ? "They’re in the hospital."
            : contactError(state, p.id, targetId);

  return {
    present: true,
    target: { id: targetId, name: target.name, alias: target.alias, status },
    error,
    actions: error
      ? []
      : STREET_SOCIAL_ACTIONS.map((type) => {
          const { ap, label, durationMinutes, endsDay } = ACTIONS[type];
          const timing = { durationMinutes, endsDay };
          const error = actionExecutionError(state, {
            type,
            actor: p.id,
            target: targetId,
          });
          return {
            command: { type, targetId },
            label,
            cost: {
              ap,
              ...(type === "offer" || type === "transfer"
                ? { cash: ACTIONS[type].amount }
                : {}),
            },
            timing,
            confirmation: error ? null : dayEndWarning(state, ap, timing),
            error,
          };
        }),
  };
}

export type StreetConversationView = ReturnType<typeof queryStreetConversation>;

export interface StreetConversationResult extends TimedActionResult {
  eventIds: string[];
}

export function executeStreetConversationAction(
  state: GameState,
  observation: StreetPresenceObservation,
  command: StreetConversationCommand,
  decision?: DayEndDecision,
): StreetConversationResult {
  const view = queryStreetConversation(state, observation, command.targetId);
  const action = view.actions.find(
    ({ command: offered }) => offered.type === command.type,
  );
  if (!action || view.error || action.error)
    return {
      state,
      error:
        view.error ??
        action?.error ??
        "That isn’t a street conversation action.",
      eventIds: [],
    };
  const result = performAction(
    state,
    {
      actor: state.playerId,
      target: command.targetId,
      type: command.type,
    },
    {
      decision,
      observedSocialContext: {
        zone: observation.zone,
        locationId: observation.locationId,
        peopleHere: observation.nearbyCharacterIds,
      },
    },
  );
  return {
    ...result,
    eventIds: result.state.events
      .slice(state.events.length)
      .map(({ id }) => id),
  };
}
