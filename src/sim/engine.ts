import type { GameState } from "../core/GameState";
import { NPC_COLLISION_RADIUS, resolveWorldCollision } from "./derivedNavMap";
import { RESERVOIR_NAV_MAP } from "../strip/navMap";
import {
  buildNavGraphIndex,
  findNavPath,
  findNearestNavNode,
  type NavGraphIndex,
} from "./pathfinding";
import { SimRelationshipCache } from "./relationships";
import { SeededRng } from "./rng";
import { activeSlotForMinute, createReservoirNpcProfiles } from "./schedules";
import {
  BEHAVIOR_PRIORITY,
  SIM_SNAPSHOT_VERSION,
  type DecisionLogEntry,
  type DisturbanceEvent,
  type EngineRelationshipAdapter,
  type NavMap,
  type PeopleHereEntry,
  type PlayerContextInput,
  type SimClockState,
  type SimGoal,
  type SimInspectorSnapshot,
  type SimNpcProfile,
  type SimNpcState,
  type SimPerformanceStats,
  type SimSnapshotV1,
} from "./types";

export const ACTIVE_HZ = 20;
export const ACTIVE_DT = 1 / ACTIVE_HZ; // 0.05s
export const OFFVIEW_HZ = 1;
export const OFFVIEW_DT = 1 / OFFVIEW_HZ; // 1.0s

const ARRIVAL_EPSILON = 0.35;
const SOCIAL_RANGE = 2.6;
const YIELD_RANGE = 1.15;
const MAX_DECISION_LOG = 60;

export interface LivingBlockSimOptions {
  seed?: number;
  engineDay?: number;
  startMinuteOfDay?: number;
  /** How many in-game minutes advance per simulated second (default: 0.5 => 1 sim hour = 2 real min at 1x). */
  simMinutesPerSecond?: number;
  navMap?: NavMap;
  profiles?: SimNpcProfile[];
  engineState?: Pick<GameState, "characters" | "day">;
  relationshipAdapter?: EngineRelationshipAdapter;
  cameraInArea?: boolean;
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function turnToward(current: number, target: number, maxDelta: number): number {
  const diff = normalizeAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return normalizeAngle(current + Math.sign(diff) * maxDelta);
}

export function formatSimClock(minuteOfDay: number): string {
  const wrapped = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export class LivingBlockSim {
  readonly navMap: NavMap;
  readonly navIndex: NavGraphIndex;
  readonly profiles: Map<string, SimNpcProfile>;
  readonly relationships: SimRelationshipCache;
  readonly simMinutesPerSecond: number;

  private rng: SeededRng;
  private clock: SimClockState;
  private npcs: SimNpcState[];
  private disturbances: DisturbanceEvent[] = [];
  private blockedNodes = new Set<string>();
  private decisions: DecisionLogEntry[] = [];

  private accumulator = 0;
  private paused = false;
  private speedMultiplier = 1;
  private cameraInArea: boolean;
  private playerContext: PlayerContextInput | null = null;

  private perf: SimPerformanceStats = {
    lastStepMs: 0,
    avgStepMs: 0,
    maxStepMs: 0,
    sampleCount: 0,
    mode: "active-20hz",
  };

  constructor(options: LivingBlockSimOptions = {}) {
    this.navMap = options.navMap ?? RESERVOIR_NAV_MAP;
    this.navIndex = buildNavGraphIndex(this.navMap);
    this.relationships = new SimRelationshipCache(options.relationshipAdapter);
    this.simMinutesPerSecond = options.simMinutesPerSecond ?? 0.5;
    this.cameraInArea = options.cameraInArea ?? true;
    this.perf.mode = this.cameraInArea ? "active-20hz" : "offview-1hz";

    const seed = options.seed ?? 20261122;
    this.rng = new SeededRng(seed);

    const engineDay = options.engineDay ?? options.engineState?.day ?? 1;
    const startMinute = ((options.startMinuteOfDay ?? 485) % 1440 + 1440) % 1440; // Default 08:05
    this.clock = {
      engineDay,
      minuteOfDay: startMinute,
      tickCount: 0,
      dayWrapPending: false,
    };

    const profileList = options.profiles ?? createReservoirNpcProfiles(options.engineState);
    this.profiles = new Map(profileList.map((p) => [p.id, p]));
    this.npcs = profileList.map((profile) => this.spawnNpcFromProfile(profile));
  }

  private spawnNpcFromProfile(profile: SimNpcProfile): SimNpcState {
    const startNode =
      this.navIndex.nodeById.get(profile.startNodeId) ??
      this.navIndex.nodeById.get(profile.homeNodeId) ??
      this.navMap.nodes[0]!;
    const slot = activeSlotForMinute(profile.schedule, this.clock.minuteOfDay);
    const goal: SimGoal = {
      slotId: slot.id,
      targetNodeId: slot.targetNodeId,
      destinationId: slot.destinationId,
      destinationLabel: slot.destinationLabel,
      activity: slot.activity,
      reason: slot.reason,
      priority: BEHAVIOR_PRIORITY.schedule,
      remainingSec: null,
    };

    const path = findNavPath(this.navIndex, startNode.id, goal.targetNodeId, this.blockedNodes) ?? [
      startNode.id,
    ];
    const atDest =
      startNode.id === goal.targetNodeId ? goal.destinationId : startNode.homeId ?? startNode.locationId ?? null;

    return {
      id: profile.id,
      displayName: profile.displayName,
      isCanonical: profile.isCanonical,
      affiliation: profile.affiliation,
      homeZone: profile.homeZone,
      homeNodeId: profile.homeNodeId,
      homeDestinationId: profile.homeDestinationId,
      x: startNode.x,
      z: startNode.z,
      prevX: startNode.x,
      prevZ: startNode.z,
      facing: startNode.facing ?? 0,
      prevFacing: startNode.facing ?? 0,
      speed: 0,
      locomotion: path.length > 1 ? "walk" : "idle",
      currentNodeId: startNode.id,
      path,
      pathIndex: path.length > 1 ? 1 : 0,
      goal,
      interruptedGoal: null,
      socialCooldownSec: 0,
      yieldTimerSec: 0,
      blockedTicks: 0,
      atDestinationId: atDest,
      inView: this.cameraInArea,
    };
  }

  /** Restores simulation state from a versioned snapshot (or falls back safely if null/invalid). */
  static fromSnapshot(
    snapshot: SimSnapshotV1 | null | undefined,
    options: LivingBlockSimOptions = {},
  ): LivingBlockSim {
    if (!snapshot || snapshot.schemaVersion !== SIM_SNAPSHOT_VERSION) {
      return new LivingBlockSim(options);
    }

    const sim = new LivingBlockSim({
      ...options,
      seed: snapshot.seed,
      engineDay: options.engineDay ?? snapshot.clock.engineDay,
      startMinuteOfDay: snapshot.clock.minuteOfDay,
    });

    sim.rng = new SeededRng(snapshot.seed, snapshot.rngState);
    sim.clock = {
      engineDay: options.engineDay ?? snapshot.clock.engineDay,
      minuteOfDay: snapshot.clock.minuteOfDay,
      tickCount: snapshot.clock.tickCount,
      dayWrapPending: snapshot.clock.dayWrapPending,
    };
    sim.npcs = snapshot.npcs.map((n) => ({
      ...n,
      path: [...n.path],
      goal: { ...n.goal },
      interruptedGoal: n.interruptedGoal ? { ...n.interruptedGoal } : null,
    }));
    sim.disturbances = snapshot.disturbances.map((d) => ({ ...d }));
    sim.blockedNodes = new Set(snapshot.blockedNodeIds);
    sim.decisions = snapshot.recentDecisions.map((e) => ({ ...e }));
    return sim;
  }

  serialize(): SimSnapshotV1 {
    return {
      schemaVersion: SIM_SNAPSHOT_VERSION,
      hood: this.navMap.hood,
      seed: this.rng.seed,
      rngState: this.rng.getState(),
      clock: { ...this.clock },
      npcs: this.npcs.map((n) => ({
        ...n,
        path: [...n.path],
        goal: { ...n.goal },
        interruptedGoal: n.interruptedGoal ? { ...n.interruptedGoal } : null,
      })),
      disturbances: this.disturbances.map((d) => ({ ...d })),
      blockedNodeIds: Array.from(this.blockedNodes).sort(),
      recentDecisions: this.decisions.map((e) => ({ ...e })),
    };
  }

  /** Engine-authoritative day sync (One Clock rule). */
  syncEngineDay(engineDay: number): void {
    if (engineDay !== this.clock.engineDay) {
      this.clock.engineDay = engineDay;
      this.clock.dayWrapPending = false;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.25, Math.min(120, multiplier));
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  /**
   * Switches between high-frequency active view (20 Hz) and low-frequency off-view
   * background simulation (1 Hz). Never resets NPC positions or routines.
   */
  setCameraInArea(inArea: boolean): void {
    if (this.cameraInArea === inArea) return;
    this.cameraInArea = inArea;
    this.accumulator = 0;
    this.perf.mode = inArea ? "active-20hz" : "offview-1hz";
    for (const npc of this.npcs) {
      npc.inView = inArea;
      // Sync previous pose on view return to prevent interpolation snap artifacts.
      if (inArea) {
        npc.prevX = npc.x;
        npc.prevZ = npc.z;
        npc.prevFacing = npc.facing;
      }
    }
    this.logDecision(
      "system",
      inArea ? "camera_returned" : "camera_left",
      inArea
        ? "Returned to Lil Bit Lane (resumed 20 Hz active sim)"
        : "Left Lil Bit Lane (switched to 1 Hz persistent off-view sim)",
    );
  }

  isCameraInArea(): boolean {
    return this.cameraInArea;
  }

  setPlayerContext(ctx: PlayerContextInput | null): void {
    this.playerContext = ctx;
  }

  blockNode(nodeId: string, blocked: boolean): void {
    if (blocked) this.blockedNodes.add(nodeId);
    else this.blockedNodes.delete(nodeId);
  }

  getBlockedNodes(): string[] {
    return Array.from(this.blockedNodes).sort();
  }

  triggerDisturbance(event: Omit<DisturbanceEvent, "id"> & { id?: string }): DisturbanceEvent {
    const id = event.id ?? `dist-${this.clock.tickCount}-${this.disturbances.length + 1}`;
    const created: DisturbanceEvent = {
      id,
      kind: event.kind,
      x: event.x,
      z: event.z,
      radius: event.radius,
      remainingSec: event.remainingSec,
      label: event.label,
    };
    this.disturbances.push(created);
    this.logDecision("world", "disturbance_started", `${created.label} (${created.kind})`);
    return created;
  }

  /**
   * Advances the simulation from a real frame delta (seconds) using a fixed-step
   * accumulator (20 Hz active, 1 Hz off-view). Returns interpolation alpha in [0, 1].
   */
  update(realDeltaSec: number): number {
    if (this.paused) return this.getInterpolationAlpha();
    const clampedReal = Math.max(0, Math.min(0.25, realDeltaSec));
    const simDelta = clampedReal * this.speedMultiplier;
    const stepDt = this.cameraInArea ? ACTIVE_DT : OFFVIEW_DT;

    this.accumulator += simDelta;
    // Cap catch-up steps per render frame to protect mobile frame budget.
    const maxSteps = this.cameraInArea ? 12 : 4;
    let steps = 0;
    while (this.accumulator >= stepDt && steps < maxSteps) {
      this.stepFixed(stepDt);
      this.accumulator -= stepDt;
      steps++;
    }
    if (steps === maxSteps && this.accumulator > stepDt) {
      this.accumulator = this.accumulator % stepDt;
    }
    return this.getInterpolationAlpha();
  }

  getInterpolationAlpha(): number {
    const stepDt = this.cameraInArea ? ACTIVE_DT : OFFVIEW_DT;
    return Math.max(0, Math.min(1, this.accumulator / stepDt));
  }

  /** Executes exactly one deterministic fixed simulation step of `dt` seconds. */
  stepFixed(dt: number): void {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;

    // 1. Advance time-of-day within the engine's authoritative day.
    this.clock.tickCount += 1;
    const nextMin = this.clock.minuteOfDay + dt * this.simMinutesPerSecond;
    if (nextMin >= 1440) {
      this.clock.minuteOfDay = nextMin % 1440;
      this.clock.dayWrapPending = true;
    } else {
      this.clock.minuteOfDay = nextMin;
    }

    // 2. Decay disturbances.
    for (let i = this.disturbances.length - 1; i >= 0; i--) {
      this.disturbances[i]!.remainingSec -= dt;
      if (this.disturbances[i]!.remainingSec <= 0) {
        const ended = this.disturbances.splice(i, 1)[0]!;
        this.logDecision("world", "disturbance_cleared", ended.label);
      }
    }

    // 3. Snapshot previous poses & decay per-NPC cooldowns.
    for (const npc of this.npcs) {
      npc.prevX = npc.x;
      npc.prevZ = npc.z;
      npc.prevFacing = npc.facing;
      npc.inView = this.cameraInArea;
      if (npc.socialCooldownSec > 0) {
        npc.socialCooldownSec = Math.max(0, npc.socialCooldownSec - dt);
      }
      if (npc.yieldTimerSec > 0) {
        npc.yieldTimerSec = Math.max(0, npc.yieldTimerSec - dt);
      }
    }

    // 4. Evaluate disturbances, schedules, and goal completions.
    for (const npc of this.npcs) {
      this.evaluateNpcIntent(npc, dt);
    }

    // 5. Active-view pairwise interactions (yielding & brief social chats).
    if (this.cameraInArea) {
      this.evaluatePairwiseInteractions();
    }

    // 6. Advance locomotion along paths (with wall/fence collision resolution).
    for (const npc of this.npcs) {
      this.stepNpcMovement(npc, dt);
    }

    if (typeof performance !== "undefined") {
      const elapsed = performance.now() - t0;
      this.perf.lastStepMs = elapsed;
      this.perf.sampleCount += 1;
      this.perf.maxStepMs = Math.max(this.perf.maxStepMs, elapsed);
      const alpha = Math.min(1, 1 / Math.min(this.perf.sampleCount, 60));
      this.perf.avgStepMs = this.perf.avgStepMs * (1 - alpha) + elapsed * alpha;
    }
  }

  private evaluateNpcIntent(npc: SimNpcState, dt: number): void {
    const profile = this.profiles.get(npc.id);
    if (!profile) return;

    // 4a. Check environmental disturbances (highest behavioral priority).
    const activeDist = this.findRelevantDisturbance(npc);
    if (activeDist && npc.goal.priority < BEHAVIOR_PRIORITY.disturbance) {
      this.interruptNpc(npc, this.buildDisturbanceGoal(npc, profile, activeDist));
      this.logDecision(
        npc.id,
        "interrupt_disturbance",
        `Reacted to ${activeDist.label} (${profile.traits.caution >= 60 ? "stepping back" : "watching closely"})`,
      );
      return;
    }

    // 4b. Tick timed goals (social chat, yield wait, disturbance reaction, recovery).
    if (npc.goal.remainingSec !== null) {
      const isTraveling = npc.pathIndex < npc.path.length;
      if (
        !isTraveling ||
        npc.goal.activity === "social_chat" ||
        npc.goal.activity === "react_disturbance" ||
        npc.goal.activity === "yield_wait"
      ) {
        npc.goal.remainingSec -= dt;
      }

      const disturbanceStillNear =
        npc.goal.activity === "react_disturbance" && this.findRelevantDisturbance(npc) !== null;

      if (npc.goal.remainingSec <= 0 && !disturbanceStillNear) {
        this.resumeOrReplan(npc, profile);
        return;
      }
    }

    // 4c. Schedule evaluation (only when at schedule/idle priority).
    if (npc.goal.priority <= BEHAVIOR_PRIORITY.schedule) {
      const slot = activeSlotForMinute(profile.schedule, this.clock.minuteOfDay);
      if (slot.id !== npc.goal.slotId) {
        const nextGoal: SimGoal = {
          slotId: slot.id,
          targetNodeId: slot.targetNodeId,
          destinationId: slot.destinationId,
          destinationLabel: slot.destinationLabel,
          activity: slot.activity,
          reason: slot.reason,
          priority: BEHAVIOR_PRIORITY.schedule,
          remainingSec: null,
        };
        this.assignGoalWithRouting(npc, profile, nextGoal, "schedule_change");
      }
    }
  }

  private findRelevantDisturbance(npc: SimNpcState): DisturbanceEvent | null {
    for (const d of this.disturbances) {
      const dist = Math.hypot(npc.x - d.x, npc.z - d.z);
      if (dist <= d.radius + 5.0) return d;
    }
    if (this.playerContext?.disturbanceActive) {
      const dist = Math.hypot(npc.x - this.playerContext.x, npc.z - this.playerContext.z);
      if (dist <= 9.0) {
        return {
          id: "player-disturbance",
          kind: "commotion",
          x: this.playerContext.x,
          z: this.playerContext.z,
          radius: 7.0,
          remainingSec: 2.0,
          label: "Street commotion near player",
        };
      }
    }
    return null;
  }

  private buildDisturbanceGoal(
    npc: SimNpcState,
    profile: SimNpcProfile,
    dist: DisturbanceEvent,
  ): SimGoal {
    const cautious = profile.traits.caution >= 60;
    if (cautious) {
      // Pick a safe sidewalk or home node away from the disturbance.
      const safeTarget = this.pickSafeNodeAwayFrom(npc, profile, dist.x, dist.z);
      return {
        slotId: `dist:${dist.id}`,
        targetNodeId: safeTarget.id,
        destinationId: safeTarget.homeId ?? safeTarget.locationId ?? safeTarget.id,
        destinationLabel: `Stepping clear of ${dist.label}`,
        activity: "react_disturbance",
        reason: `Moving away from ${dist.label}`,
        priority: BEHAVIOR_PRIORITY.disturbance,
        remainingSec: Math.max(3.5, Math.min(8.0, dist.remainingSec)),
      };
    }

    // Less cautious NPCs (e.g. Quanny) hold position and watch cautiously.
    return {
      slotId: `dist:${dist.id}`,
      targetNodeId: npc.currentNodeId,
      destinationId: npc.atDestinationId ?? npc.currentNodeId,
      destinationLabel: `Watching ${dist.label}`,
      activity: "react_disturbance",
      reason: `Sizing up ${dist.label}`,
      priority: BEHAVIOR_PRIORITY.disturbance,
      remainingSec: Math.max(3.0, Math.min(7.0, dist.remainingSec)),
    };
  }

  private pickSafeNodeAwayFrom(
    npc: SimNpcState,
    profile: SimNpcProfile,
    dx: number,
    dz: number,
  ) {
    const home = this.navIndex.nodeById.get(profile.homeNodeId);
    if (
      home &&
      !this.blockedNodes.has(home.id) &&
      Math.hypot(home.x - dx, home.z - dz) > 10 &&
      findNavPath(this.navIndex, npc.currentNodeId, home.id, this.blockedNodes)
    ) {
      return home;
    }

    let best = this.navIndex.nodeById.get(npc.currentNodeId) ?? this.navMap.nodes[0]!;
    let bestScore = -Infinity;
    for (const node of this.navMap.nodes) {
      if (this.blockedNodes.has(node.id)) continue;
      const distFromHazard = Math.hypot(node.x - dx, node.z - dz);
      const distFromNpc = Math.hypot(node.x - npc.x, node.z - npc.z);
      if (distFromNpc > 28) continue;
      const score = distFromHazard - distFromNpc * 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  private interruptNpc(npc: SimNpcState, interruptGoal: SimGoal): void {
    // Preserve the underlying schedule goal if not already interrupted.
    if (!npc.interruptedGoal && npc.goal.priority <= BEHAVIOR_PRIORITY.schedule) {
      npc.interruptedGoal = { ...npc.goal };
    }
    const profile = this.profiles.get(npc.id)!;
    this.assignGoalWithRouting(npc, profile, interruptGoal, "interrupt");
  }

  private resumeOrReplan(npc: SimNpcState, profile: SimNpcProfile): void {
    const currentSlot = activeSlotForMinute(profile.schedule, this.clock.minuteOfDay);
    const saved = npc.interruptedGoal;
    npc.interruptedGoal = null;

    // Resume interrupted goal if its schedule window is still active; otherwise re-plan.
    if (saved && saved.slotId === currentSlot.id) {
      this.assignGoalWithRouting(npc, profile, saved, "resume_goal");
      this.logDecision(
        npc.id,
        "resume_activity",
        `Resumed ${saved.activity} -> ${saved.destinationLabel}`,
      );
      return;
    }

    const freshGoal: SimGoal = {
      slotId: currentSlot.id,
      targetNodeId: currentSlot.targetNodeId,
      destinationId: currentSlot.destinationId,
      destinationLabel: currentSlot.destinationLabel,
      activity: currentSlot.activity,
      reason: currentSlot.reason,
      priority: BEHAVIOR_PRIORITY.schedule,
      remainingSec: null,
    };
    this.assignGoalWithRouting(npc, profile, freshGoal, "replan_schedule");
    this.logDecision(
      npc.id,
      "replan_activity",
      `Switched to ${freshGoal.activity} -> ${freshGoal.destinationLabel}`,
    );
  }

  private assignGoalWithRouting(
    npc: SimNpcState,
    profile: SimNpcProfile,
    goal: SimGoal,
    trigger: string,
  ): void {
    const startNode =
      findNearestNavNode(this.navMap, npc.x, npc.z, this.blockedNodes) ??
      this.navIndex.nodeById.get(npc.currentNodeId);
    const startId = startNode?.id ?? npc.currentNodeId;
    npc.currentNodeId = startId;

    const path = findNavPath(this.navIndex, startId, goal.targetNodeId, this.blockedNodes);
    if (path) {
      npc.goal = goal;
      npc.path = path;
      npc.pathIndex = path.length > 1 ? 1 : path.length;
      npc.blockedTicks = 0;
      if (trigger === "schedule_change") {
        this.logDecision(
          npc.id,
          "schedule_transition",
          `${goal.activity}: ${goal.reason} (${goal.destinationLabel})`,
        );
      }
      return;
    }

    // Recovery: target became unreachable. Pick a reachable fallback (home or nearest open sidewalk).
    this.logDecision(
      npc.id,
      "route_unreachable",
      `Cannot reach ${goal.targetNodeId}; initiating recovery route`,
    );
    const fallback = this.pickReachableFallback(npc, profile, goal.targetNodeId);
    const recoveryPath =
      (fallback && findNavPath(this.navIndex, startId, fallback.id, this.blockedNodes)) || [startId];
    npc.goal = {
      slotId: `recover:${goal.slotId}`,
      targetNodeId: fallback?.id ?? startId,
      destinationId: fallback?.homeId ?? fallback?.locationId ?? startId,
      destinationLabel: fallback ? `Fallback (${fallback.street ?? fallback.id})` : "Holding position",
      activity: "recover_route",
      reason: `Rerouting after ${goal.destinationLabel} became unreachable`,
      priority: BEHAVIOR_PRIORITY.recovery,
      remainingSec: 6.0,
    };
    npc.path = recoveryPath;
    npc.pathIndex = recoveryPath.length > 1 ? 1 : recoveryPath.length;
  }

  private pickReachableFallback(
    npc: SimNpcState,
    profile: SimNpcProfile,
    blockedTargetId: string,
  ) {
    const candidates = [
      this.navIndex.nodeById.get(profile.homeNodeId),
      ...this.navMap.nodes.filter((n) => n.kind === "sidewalk" || n.kind === "door"),
    ];
    for (const node of candidates) {
      if (!node || node.id === blockedTargetId || this.blockedNodes.has(node.id)) continue;
      if (findNavPath(this.navIndex, npc.currentNodeId, node.id, this.blockedNodes)) {
        return node;
      }
    }
    return null;
  }

  private evaluatePairwiseInteractions(): void {
    for (let i = 0; i < this.npcs.length; i++) {
      for (let j = i + 1; j < this.npcs.length; j++) {
        const a = this.npcs[i]!;
        const b = this.npcs[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);

        // 1. Path conflict yielding when two moving NPCs are too close head-on.
        if (
          dist < YIELD_RANGE &&
          a.locomotion === "walk" &&
          b.locomotion === "walk" &&
          a.goal.priority <= BEHAVIOR_PRIORITY.schedule &&
          b.goal.priority <= BEHAVIOR_PRIORITY.schedule
        ) {
          const facingDot =
            Math.sin(a.facing) * Math.sin(b.facing) + Math.cos(a.facing) * Math.cos(b.facing);
          if (facingDot < -0.25 && b.yieldTimerSec <= 0) {
            const yieldGoal: SimGoal = {
              slotId: `yield:${a.id}:${this.clock.tickCount}`,
              targetNodeId: b.currentNodeId,
              destinationId: b.atDestinationId ?? b.currentNodeId,
              destinationLabel: `Yielding sidewalk to ${a.displayName}`,
              activity: "yield_wait",
              reason: `Stepping aside for ${a.displayName}`,
              priority: BEHAVIOR_PRIORITY.yield,
              remainingSec: 1.4,
              partnerId: a.id,
            };
            b.yieldTimerSec = 4.0;
            this.interruptNpc(b, yieldGoal);
            this.logDecision(b.id, "yield_path", `Yielded sidewalk space to ${a.displayName}`);
            continue;
          }
        }

        // 2. Brief social interaction when two nearby NPCs have capacity & positive/neutral affinity.
        if (
          dist <= SOCIAL_RANGE &&
          a.socialCooldownSec <= 0 &&
          b.socialCooldownSec <= 0 &&
          a.goal.priority <= BEHAVIOR_PRIORITY.schedule &&
          b.goal.priority <= BEHAVIOR_PRIORITY.schedule
        ) {
          const profA = this.profiles.get(a.id)!;
          const profB = this.profiles.get(b.id)!;
          const affinity = this.relationships.getAffinity(a.id, b.id);
          if (affinity < -10) continue;

          const baseChance = ((profA.traits.sociability + profB.traits.sociability) / 200) * 0.22;
          const affinityBonus = Math.max(0, affinity / 250);
          if (this.rng.next() < baseChance + affinityBonus) {
            const chatSec = this.rng.range(4.0, 7.5);
            const faceAtoB = Math.atan2(dx, dz);
            const faceBtoA = Math.atan2(-dx, -dz);

            a.facing = faceAtoB;
            b.facing = faceBtoA;
            a.socialCooldownSec = 35;
            b.socialCooldownSec = 35;

            this.interruptNpc(a, {
              slotId: `social:${b.id}:${this.clock.tickCount}`,
              targetNodeId: a.currentNodeId,
              destinationId: a.atDestinationId ?? a.currentNodeId,
              destinationLabel: `Talking with ${b.displayName}`,
              activity: "social_chat",
              reason: `Stopped to check in with ${b.displayName}`,
              priority: BEHAVIOR_PRIORITY.social,
              remainingSec: chatSec,
              partnerId: b.id,
            });
            this.interruptNpc(b, {
              slotId: `social:${a.id}:${this.clock.tickCount}`,
              targetNodeId: b.currentNodeId,
              destinationId: b.atDestinationId ?? b.currentNodeId,
              destinationLabel: `Talking with ${a.displayName}`,
              activity: "social_chat",
              reason: `Stopped to check in with ${a.displayName}`,
              priority: BEHAVIOR_PRIORITY.social,
              remainingSec: chatSec,
              partnerId: a.id,
            });

            this.logDecision(
              a.id,
              "social_encounter",
              `Brief sidewalk chat with ${b.displayName} (${chatSec.toFixed(1)}s)`,
            );

            // Propose non-authoritative micro-delta to engine adapter for canonical pairs only.
            if (a.isCanonical && b.isCanonical) {
              this.relationships.proposeDelta({
                actorId: a.id,
                targetId: b.id,
                trust: 1,
                reason: "Brief neighborhood greeting on Lil Bit Lane",
              });
            }
          }
        }
      }
    }
  }

  private stepNpcMovement(npc: SimNpcState, dt: number): void {
    const profile = this.profiles.get(npc.id);
    if (!profile) return;

    // Stationary social / yield / watching states.
    if (npc.goal.activity === "social_chat") {
      npc.speed = 0;
      npc.locomotion = "interact";
      if (npc.goal.partnerId) {
        const partner = this.npcs.find((p) => p.id === npc.goal.partnerId);
        if (partner) {
          const desired = Math.atan2(partner.x - npc.x, partner.z - npc.z);
          npc.facing = turnToward(npc.facing, desired, 6.0 * dt);
        }
      }
      return;
    }

    if (npc.goal.activity === "yield_wait") {
      npc.speed = 0;
      npc.locomotion = "wait";
      return;
    }

    // Check if the destination or next waypoint on our active path became blocked dynamically.
    if (
      npc.goal.activity !== "recover_route" &&
      (this.blockedNodes.has(npc.goal.targetNodeId) ||
        (npc.pathIndex < npc.path.length && this.blockedNodes.has(npc.path[npc.pathIndex]!)))
    ) {
      this.assignGoalWithRouting(npc, profile, npc.goal, "dynamic_block");
    }

    // If at destination, settle into idle / interact / wait pose.
    if (npc.pathIndex >= npc.path.length) {
      npc.speed = 0;
      const targetNode = this.navIndex.nodeById.get(npc.goal.targetNodeId);
      if (targetNode) {
        npc.currentNodeId = targetNode.id;
        npc.atDestinationId = targetNode.homeId ?? targetNode.locationId ?? npc.goal.destinationId;
        // People sharing a destination stand side by side, not on one point: step to this
        // NPC's own slot along the doorway (walking, collision-checked, never teleporting).
        const slot = this.settleSlot(npc, targetNode);
        const sdx = slot.x - npc.x, sdz = slot.z - npc.z, sd = Math.hypot(sdx, sdz);
        if (sd > 0.05) {
          const step = Math.min(sd, profile.walkSpeed * dt);
          const r = resolveWorldCollision(npc.x + (sdx / sd) * step, npc.z + (sdz / sd) * step, this.navMap, NPC_COLLISION_RADIUS);
          npc.x = r.x;
          npc.z = r.z;
          npc.facing = turnToward(npc.facing, Math.atan2(sdx, sdz), 8.0 * dt);
          npc.speed = profile.walkSpeed;
          npc.locomotion = "walk";
          return;
        }
        if (targetNode.facing !== undefined && npc.goal.activity !== "react_disturbance") {
          npc.facing = turnToward(npc.facing, targetNode.facing, 4.5 * dt);
        }
      }
      if (npc.goal.activity === "react_disturbance") {
        const dist = this.findRelevantDisturbance(npc);
        if (dist) {
          npc.facing = turnToward(npc.facing, Math.atan2(dist.x - npc.x, dist.z - npc.z), 6.0 * dt);
        }
        npc.locomotion = "wait";
      } else if (
        npc.goal.activity === "work_shift" ||
        npc.goal.activity === "shop_errand" ||
        npc.goal.activity === "visit_neighbor"
      ) {
        npc.locomotion = "interact";
      } else {
        npc.locomotion = "idle";
      }
      return;
    }

    // Move along path waypoints without teleporting (distance <= speed * dt).
    const running =
      npc.goal.activity === "react_disturbance" && profile.traits.caution >= 60;
    const moveSpeed = running ? profile.runSpeed : profile.walkSpeed;
    let remainingMove = moveSpeed * dt;
    npc.atDestinationId = null;

    while (remainingMove > 1e-4 && npc.pathIndex < npc.path.length) {
      const wpId = npc.path[npc.pathIndex]!;
      const wp = this.navIndex.nodeById.get(wpId);
      if (!wp) {
        npc.pathIndex++;
        continue;
      }

      const dx = wp.x - npc.x;
      const dz = wp.z - npc.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= ARRIVAL_EPSILON || dist <= remainingMove) {
        const resolved = resolveWorldCollision(wp.x, wp.z, this.navMap, NPC_COLLISION_RADIUS);
        npc.x = resolved.x;
        npc.z = resolved.z;
        npc.currentNodeId = wp.id;
        npc.pathIndex++;
        remainingMove = Math.max(0, remainingMove - dist);
        if (dist > 1e-4) {
          npc.facing = turnToward(npc.facing, Math.atan2(dx, dz), 8.0 * dt);
        }
      } else {
        const stepX = npc.x + (dx / dist) * remainingMove;
        const stepZ = npc.z + (dz / dist) * remainingMove;
        const resolved = resolveWorldCollision(stepX, stepZ, this.navMap, NPC_COLLISION_RADIUS);
        npc.x = resolved.x;
        npc.z = resolved.z;
        npc.facing = turnToward(npc.facing, Math.atan2(dx, dz), 8.0 * dt);
        remainingMove = 0;
      }
    }

    npc.speed = moveSpeed;
    npc.locomotion = running ? "run" : "walk";

    if (npc.pathIndex >= npc.path.length) {
      const destNode = this.navIndex.nodeById.get(npc.goal.targetNodeId);
      npc.atDestinationId =
        destNode?.homeId ?? destNode?.locationId ?? npc.goal.destinationId;
      this.logDecision(
        npc.id,
        "arrived",
        `Arrived at ${npc.goal.destinationLabel} (${npc.goal.activity})`,
      );
    }
  }

  /**
   * Where an NPC stands at a shared destination: the node itself for the first arrival (by id
   * order), then 0.9 m steps either side along the doorway. Deterministic.
   */
  private settleSlot(npc: SimNpcState, node: { id: string; x: number; z: number; facing?: number }) {
    const here = this.npcs
      .filter((n) => n.goal.targetNodeId === node.id && n.pathIndex >= n.path.length)
      .map((n) => n.id)
      .sort();
    const rank = Math.max(0, here.indexOf(npc.id));
    const offsets = [0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7];
    const o = offsets[rank % offsets.length]!;
    const f = node.facing ?? 0;
    const r = resolveWorldCollision(node.x + Math.cos(f) * o, node.z - Math.sin(f) * o, this.navMap, NPC_COLLISION_RADIUS);
    return { x: r.x, z: r.z };
  }

  private logDecision(npcId: string, event: string, detail: string): void {
    this.decisions.push({
      day: this.clock.engineDay,
      minuteOfDay: Number(this.clock.minuteOfDay.toFixed(2)),
      npcId,
      event,
      detail,
    });
    if (this.decisions.length > MAX_DECISION_LOG) {
      this.decisions.splice(0, this.decisions.length - MAX_DECISION_LOG);
    }
  }

  // --- Read-only integration queries ---

  getClock(): Readonly<SimClockState> {
    return this.clock;
  }

  getNpcs(): readonly SimNpcState[] {
    return this.npcs;
  }

  getNpc(id: string): SimNpcState | undefined {
    return this.npcs.find((n) => n.id === id);
  }

  getPerformanceStats(): Readonly<SimPerformanceStats> {
    return this.perf;
  }

  /**
   * Verified `peopleHere` gameplay contract for Codex.
   * Matches canonical `locationId` (e.g. "reservoir.lil-jays") or `homeId` (e.g. "res-home-02").
   */
  peopleHere(destinationId: string): PeopleHereEntry[] {
    const out: PeopleHereEntry[] = [];
    for (const npc of this.npcs) {
      const node = this.navIndex.nodeById.get(npc.currentNodeId);
      const matches =
        npc.atDestinationId === destinationId ||
        (npc.atDestinationId !== null &&
          (node?.locationId === destinationId || node?.homeId === destinationId));
      if (!matches) continue;
      out.push(this.toPeopleHereEntry(npc));
    }
    return out;
  }

  /** Returns all NPCs within `radius` metres of world coordinate (x, z). */
  peopleNear(x: number, z: number, radius: number): PeopleHereEntry[] {
    const rSq = radius * radius;
    const out: PeopleHereEntry[] = [];
    for (const npc of this.npcs) {
      const dx = npc.x - x;
      const dz = npc.z - z;
      if (dx * dx + dz * dz <= rSq) {
        out.push(this.toPeopleHereEntry(npc));
      }
    }
    return out;
  }

  private toPeopleHereEntry(npc: SimNpcState): PeopleHereEntry {
    return {
      characterId: npc.id,
      displayName: npc.displayName,
      isCanonical: npc.isCanonical,
      affiliation: npc.affiliation,
      destinationId: npc.atDestinationId,
      activity: npc.goal.activity,
      reason: npc.goal.reason,
      locomotion: npc.locomotion,
      x: npc.x,
      z: npc.z,
      facing: npc.facing,
      inView: npc.inView,
    };
  }

  getInspectorSnapshot(): SimInspectorSnapshot {
    return {
      clock: { ...this.clock },
      paused: this.paused,
      speedMultiplier: this.speedMultiplier,
      cameraInArea: this.cameraInArea,
      perf: { ...this.perf },
      npcs: this.npcs.map((n) => ({
        ...n,
        path: [...n.path],
        goal: { ...n.goal },
        interruptedGoal: n.interruptedGoal ? { ...n.interruptedGoal } : null,
      })),
      disturbances: this.disturbances.map((d) => ({ ...d })),
      blockedNodeIds: this.getBlockedNodes(),
      recentDecisions: this.decisions.slice(-20),
    };
  }
}
