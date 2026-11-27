import type { GameState } from "../core/GameState";
import { worldTime } from "../core/TimeSystem";
import { isValidSimSnapshotV1 } from "../sim/persistence";
import type { SimSnapshotV1 } from "../sim/types";
import {
  canRunPublicRoutine,
  worldCharacterStatus,
} from "../systems/CharacterAvailability";

export type { SimSnapshotV1 } from "../sim/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

// Protect the current restore path from partial nested data accepted by Gemini's
// version guard. Navigation, schedule and richer format validation remain there.
function hasRestorableGoal(value: unknown) {
  return (
    isRecord(value) &&
    [
      value.slotId,
      value.targetNodeId,
      value.destinationId,
      value.destinationLabel,
      value.activity,
      value.reason,
    ].every((entry) => typeof entry === "string") &&
    Number.isFinite(value.priority) &&
    (value.remainingSec === null || Number.isFinite(value.remainingSec))
  );
}

/** Gemini validates its format. This boundary also checks restore inputs and campaign identity. */
export function campaignSimulationSnapshot(
  state: GameState,
  value: unknown = state.sim,
): SimSnapshotV1 | undefined {
  if (!isValidSimSnapshotV1(value)) return;
  const time = worldTime(state);
  const { clock, npcs } = value;
  if (
    !Object.hasOwn(state.zones, value.hood) ||
    !Number.isSafeInteger(value.seed) ||
    !Number.isSafeInteger(value.rngState) ||
    !Number.isSafeInteger(clock.tickCount) ||
    clock.tickCount < 0 ||
    typeof clock.dayWrapPending !== "boolean" ||
    clock.engineDay !== time.day ||
    Math.floor(clock.minuteOfDay) !== time.minuteOfDay ||
    !Array.isArray(value.disturbances) ||
    !value.disturbances.every(
      (event) =>
        isRecord(event) &&
        typeof event.id === "string" &&
        typeof event.kind === "string" &&
        typeof event.label === "string" &&
        [event.x, event.z, event.radius, event.remainingSec].every(
          Number.isFinite,
        ),
    ) ||
    !Array.isArray(value.recentDecisions) ||
    !value.recentDecisions.every(isRecord) ||
    !isStringArray(value.blockedNodeIds)
  )
    return;

  const ids = new Set<string>();
  for (const npc of npcs) {
    if (
      !isRecord(npc) ||
      typeof npc.id !== "string" ||
      !npc.id ||
      ids.has(npc.id) ||
      typeof npc.isCanonical !== "boolean" ||
      !isStringArray(npc.path) ||
      !hasRestorableGoal(npc.goal) ||
      (npc.interruptedGoal !== null &&
        !hasRestorableGoal(npc.interruptedGoal)) ||
      ![
        npc.x,
        npc.z,
        npc.prevX,
        npc.prevZ,
        npc.facing,
        npc.prevFacing,
        npc.speed,
        npc.socialCooldownSec,
        npc.yieldTimerSec,
        npc.blockedTicks,
      ].every(Number.isFinite) ||
      ![
        npc.displayName,
        npc.currentNodeId,
        npc.homeNodeId,
        npc.homeDestinationId,
        npc.locomotion,
      ].every((entry) => typeof entry === "string") ||
      (npc.atDestinationId !== null &&
        typeof npc.atDestinationId !== "string") ||
      typeof npc.inView !== "boolean" ||
      !Number.isSafeInteger(npc.pathIndex) ||
      npc.pathIndex < 0 ||
      npc.pathIndex > npc.path.length
    )
      return;
    ids.add(npc.id);
    const actor = Object.hasOwn(state.characters, npc.id)
      ? state.characters[npc.id]
      : undefined;
    if (npc.isCanonical !== !!actor || npc.id === state.playerId) return;
    if (
      actor &&
      (npc.affiliation !== actor.affiliation ||
        npc.homeZone !== actor.home ||
        !canRunPublicRoutine(worldCharacterStatus(state, actor)))
    )
      return;
  }
  return value;
}

/** Store only detached data that can round-trip through the campaign JSON envelope. */
export function withSimulationSnapshot(
  state: GameState,
  snapshot: unknown,
): GameState {
  let sim: SimSnapshotV1 | undefined;
  try {
    const compatible = campaignSimulationSnapshot(state, snapshot);
    if (compatible) {
      const decoded: unknown = JSON.parse(JSON.stringify(compatible));
      sim = campaignSimulationSnapshot(state, decoded);
    }
  } catch {
    // An invalid optional checkpoint must never hold up a gameplay save.
  }
  return { ...state, sim };
}
