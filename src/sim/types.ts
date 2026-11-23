import type { FactionId, Relationship, ZoneId } from "../core/GameState";
import type { Rect, Segment } from "../strip/cityMap";

/**
 * Navigation node kinds shared between the derived test graph and Claude's future
 * `src/strip/navMap.ts`.
 */
export type NavNodeKind =
  | "sidewalk"
  | "crosswalk"
  | "door"
  | "porch"
  | "portal"
  | "spot";

export interface NavNode {
  id: string;
  kind: NavNodeKind;
  x: number;
  z: number;
  street?: string;
  /** Canonical game locationId (e.g. "reservoir.lil-jays", "reservoir.homes") when applicable. */
  locationId?: string | null;
  /** Canonical home property id (e.g. "res-home-01") when applicable. */
  homeId?: string | null;
  /** Door / anchor facing in radians about +Y (0 = +Z south, Math.PI = -Z north). */
  facing?: number;
  /** Interaction / arrival radius in metres. */
  radius?: number;
}

export type NavEdgeKind = "sidewalk" | "crosswalk" | "approach" | "portal";

export interface NavEdge {
  from: string;
  to: string;
  kind: NavEdgeKind;
  /** Traversal cost in metres (or weighted cost). */
  cost: number;
  /** Clear walkable corridor width in metres. */
  width: number;
  bidirectional?: boolean;
}

export interface NavMap {
  version: 1;
  hood: ZoneId;
  source: "derived-from-cityMap" | "authored-navMap";
  nodes: NavNode[];
  edges: NavEdge[];
  obstacles: Rect[];
  fences: Segment[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Explicitly documented gaps where verified geometry/crossings do not yet exist. */
  missingConnections: string[];
}

export type LocomotionState =
  | "idle"
  | "walk"
  | "run"
  | "turn"
  | "wait"
  | "interact";

export type ActivityKind =
  | "home_rest"
  | "shop_errand"
  | "work_shift"
  | "post_up"
  | "visit_neighbor"
  | "stroll"
  | "social_chat"
  | "yield_wait"
  | "react_disturbance"
  | "recover_route";

export const BEHAVIOR_PRIORITY = {
  idle: 0,
  schedule: 20,
  social: 45,
  yield: 60,
  disturbance: 80,
  recovery: 90,
} as const;

export interface ScheduleSlot {
  id: string;
  /** Start minute of day [0, 1440). */
  startMinute: number;
  /** End minute of day (0, 1440]. */
  endMinute: number;
  /** Target nav node id (derived from cityMap locationId or homeId). */
  targetNodeId: string;
  /** Canonical locationId or homeId for gameplay presence reporting. */
  destinationId: string;
  destinationLabel: string;
  activity: ActivityKind;
  reason: string;
  /** Preferred movement speed in m/s (walking ~1.25–1.55 m/s). */
  speed?: number;
}

export interface SimGoal {
  slotId: string;
  targetNodeId: string;
  destinationId: string;
  destinationLabel: string;
  activity: ActivityKind;
  reason: string;
  priority: number;
  /** Remaining activity duration in sim seconds once arrived, or null if bound to schedule window. */
  remainingSec: number | null;
  /** Partner NPC id for social interactions. */
  partnerId?: string;
}

export interface DecisionLogEntry {
  day: number;
  minuteOfDay: number;
  npcId: string;
  event: string;
  detail: string;
}

export interface SimNpcProfile {
  id: string;
  displayName: string;
  /** True when backed by an engine Character record; false for clearly labeled test residents. */
  isCanonical: boolean;
  /** Faction from canonical GameState ("angels" | "backstreet" | "blocks" | "blips" | "muds" | null). */
  affiliation: FactionId | null;
  homeZone: ZoneId;
  homeNodeId: string;
  homeDestinationId: string;
  startNodeId: string;
  walkSpeed: number;
  runSpeed: number;
  /** Behavioral traits in [0, 100], sourced from engine Character when canonical. */
  traits: {
    sociability: number;
    caution: number;
    punctuality: number;
  };
  /** Visual accent color for preview/debug only (not authoritative art). */
  accentColor: string;
  /** Optional model id matching public/assets/models/characters/<id>.glb. */
  modelId?: string;
  schedule: ScheduleSlot[];
}

export interface SimNpcState {
  id: string;
  displayName: string;
  isCanonical: boolean;
  affiliation: FactionId | null;
  homeZone: ZoneId;
  homeNodeId: string;
  homeDestinationId: string;

  /** Current world coordinates (metres, Three.js XZ plane). */
  x: number;
  z: number;
  /** Previous fixed-tick coordinates for render-rate interpolation. */
  prevX: number;
  prevZ: number;
  /** Current facing in radians about +Y (0 = +Z). */
  facing: number;
  prevFacing: number;
  speed: number;
  locomotion: LocomotionState;

  /** Current navigation node id (nearest or last reached). */
  currentNodeId: string;
  /** Active path of node ids (index `pathIndex` is next waypoint). */
  path: string[];
  pathIndex: number;

  /** Current goal & interrupted goal stack (max depth 1 for clean resume). */
  goal: SimGoal;
  interruptedGoal: SimGoal | null;

  /** Cooldowns in sim seconds so NPCs don't re-trigger the same interaction immediately. */
  socialCooldownSec: number;
  yieldTimerSec: number;
  blockedTicks: number;
  /** Current canonical place/home id if standing at a destination anchor, else null. */
  atDestinationId: string | null;
  /** True while NPC is inside the active high-frequency camera area. */
  inView: boolean;
}

export interface DisturbanceEvent {
  id: string;
  kind: "argument" | "siren" | "commotion" | "blocked_path";
  x: number;
  z: number;
  radius: number;
  remainingSec: number;
  label: string;
}

export interface PlayerContextInput {
  x: number;
  z: number;
  affiliation?: FactionId | null;
  disturbanceActive?: boolean;
}

/**
 * Read/write adapter so the engine (`src/systems/Relationships.ts`) stays the single
 * source of truth for relationships. The sim caches affinity scores and emits deltas.
 */
export interface RelationshipDelta {
  actorId: string;
  targetId: string;
  trust?: number;
  respect?: number;
  affection?: number;
  grievance?: number;
  reason: string;
}

export interface EngineRelationshipAdapter {
  getRelationship(actorId: string, targetId: string): Relationship | null;
  onRelationshipDelta?(delta: RelationshipDelta): void;
}

/**
 * Verified gameplay presence contract returned by `peopleHere` / `peopleNear`.
 * Read-only output for Codex's gameplay interaction layer.
 */
export interface PeopleHereEntry {
  characterId: string;
  displayName: string;
  isCanonical: boolean;
  affiliation: FactionId | null;
  destinationId: string | null;
  activity: ActivityKind;
  reason: string;
  locomotion: LocomotionState;
  x: number;
  z: number;
  facing: number;
  inView: boolean;
}

export interface SimClockState {
  /** Authoritative day number from engine GameState.day (sim never owns campaign day count). */
  engineDay: number;
  /** Time of day within the current day [0, 1440). */
  minuteOfDay: number;
  /** Total fixed sim ticks processed. */
  tickCount: number;
  /** True if minuteOfDay wrapped past midnight while waiting for engine day sync. */
  dayWrapPending: boolean;
}

export interface SimPerformanceStats {
  lastStepMs: number;
  avgStepMs: number;
  maxStepMs: number;
  sampleCount: number;
  mode: "active-20hz" | "offview-1hz";
}

export const SIM_SNAPSHOT_VERSION = 1 as const;

export interface SimSnapshotV1 {
  schemaVersion: typeof SIM_SNAPSHOT_VERSION;
  hood: ZoneId;
  seed: number;
  rngState: number;
  clock: SimClockState;
  npcs: SimNpcState[];
  disturbances: DisturbanceEvent[];
  blockedNodeIds: string[];
  recentDecisions: DecisionLogEntry[];
}

export interface SimInspectorSnapshot {
  clock: SimClockState;
  paused: boolean;
  speedMultiplier: number;
  cameraInArea: boolean;
  perf: SimPerformanceStats;
  npcs: SimNpcState[];
  disturbances: DisturbanceEvent[];
  blockedNodeIds: string[];
  recentDecisions: DecisionLogEntry[];
}
