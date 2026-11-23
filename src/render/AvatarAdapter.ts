import type { LivingBlockSim } from "../sim/engine";
import type { ActivityKind, LocomotionState, SimNpcState } from "../sim/types";

export type AvatarClipName = "idle" | "walk" | "run";

export interface AvatarAssetDescriptor {
  modelUrl: string | null;
  /** A clip file, or a named animation inside one ("x.glb#Walk"). */
  clips: Partial<Record<AvatarClipName, string>>;
  usesApprovedModel: boolean;
  /** Standing height in metres (manifest heightM). */
  heightM?: number;
  /** Ground speed each clip was made for (manifest speedMps); the character moves at these. */
  clipSpeedMps?: { walk: number; run: number };
}

export interface AvatarPose {
  id: string;
  displayName: string;
  isCanonical: boolean;
  /** Interpolated world XZ position (metres). */
  x: number;
  y: number;
  z: number;
  /** Interpolated facing radians about +Y (0 = +Z south). */
  facing: number;
  speed: number;
  locomotion: LocomotionState;
  clip: AvatarClipName;
  activity: ActivityKind;
  destinationLabel: string;
  accentColor: string;
  inView: boolean;
  assets: AvatarAssetDescriptor;
}

/**
 * Approved character rig paths in `public/assets/models/characters/` (read-only), relative to the
 * site root so the host can resolve them under any base path.
 * Never invents or modifies Claude's assets.
 */
const APPROVED_CHARACTER_ASSETS: Record<string, AvatarAssetDescriptor> = {
  quanny: {
    heightM: 1.9,
    clipSpeedMps: { walk: 0.92, run: 2.73 },
    modelUrl: "assets/models/characters/quanny.glb",
    clips: {
      idle: "assets/models/characters/quanny-idle.glb",
      walk: "assets/models/characters/quanny-walk.glb",
      run: "assets/models/characters/quanny-run.glb",
    },
    usesApprovedModel: true,
  },
  // Delivered by Codex through docs/CHARACTER_PIPELINE.md (PR #62); one file, clips inside.
  "mr-lewis": {
    heightM: 1.78,
    clipSpeedMps: { walk: 0.75, run: 2.42 },
    modelUrl: "assets/models/characters/mr-lewis.glb",
    clips: {
      idle: "assets/models/characters/mr-lewis.glb#Idle",
      walk: "assets/models/characters/mr-lewis.glb#Walk",
      run: "assets/models/characters/mr-lewis.glb#Run",
    },
    usesApprovedModel: true,
  },
  mega: {
    modelUrl: "assets/models/characters/mega.glb",
    clips: {
      walk: "assets/models/characters/mega-walk.glb",
      run: "assets/models/characters/mega-run.glb",
    },
    usesApprovedModel: true,
  },
};

const FALLBACK_AVATAR_ASSETS: AvatarAssetDescriptor = {
  modelUrl: null,
  clips: {},
  usesApprovedModel: false,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function locomotionToClip(locomotion: LocomotionState): AvatarClipName {
  switch (locomotion) {
    case "run":
      return "run";
    case "walk":
    case "turn":
      return "walk";
    case "idle":
    case "wait":
    case "interact":
    default:
      return "idle";
  }
}

export function resolveAvatarAssets(characterId: string): AvatarAssetDescriptor {
  return APPROVED_CHARACTER_ASSETS[characterId] ?? FALLBACK_AVATAR_ASSETS;
}

/**
 * Renderer-agnostic adapter bridging `LivingBlockSim` (20 Hz active / 1 Hz off-view)
 * to any visual layer (Three.js rigged models or 2D Canvas preview).
 *
 * Pre-allocates and reuses `AvatarPose` objects to avoid per-frame GC churn on mobile.
 */
export class AvatarAdapter {
  private readonly posesById = new Map<string, AvatarPose>();
  private readonly poseList: AvatarPose[] = [];

  /**
   * Synchronizes and interpolates all NPC poses at render frame rate using `alpha` in [0, 1].
   * Returns a stable, zero-allocation array view of current poses.
   */
  sync(sim: LivingBlockSim, alpha: number): readonly AvatarPose[] {
    const t = Math.max(0, Math.min(1, alpha));
    const npcs = sim.getNpcs();

    if (this.poseList.length !== npcs.length) {
      this.poseList.length = 0;
      for (const npc of npcs) {
        const pose = this.getOrCreatePose(sim, npc);
        this.poseList.push(pose);
      }
    }

    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i]!;
      const pose = this.poseList[i]!;
      pose.x = lerp(npc.prevX, npc.x, t);
      pose.y = 0;
      pose.z = lerp(npc.prevZ, npc.z, t);
      pose.facing = lerpAngle(npc.prevFacing, npc.facing, t);
      pose.speed = npc.speed;
      pose.locomotion = npc.locomotion;
      pose.clip = locomotionToClip(npc.locomotion);
      pose.activity = npc.goal.activity;
      pose.destinationLabel = npc.goal.destinationLabel;
      pose.inView = npc.inView;
    }

    return this.poseList;
  }

  getPose(characterId: string): AvatarPose | undefined {
    return this.posesById.get(characterId);
  }

  private getOrCreatePose(sim: LivingBlockSim, npc: SimNpcState): AvatarPose {
    const existing = this.posesById.get(npc.id);
    if (existing) return existing;

    const profile = sim.profiles.get(npc.id);
    const pose: AvatarPose = {
      id: npc.id,
      displayName: npc.displayName,
      isCanonical: npc.isCanonical,
      x: npc.x,
      y: 0,
      z: npc.z,
      facing: npc.facing,
      speed: npc.speed,
      locomotion: npc.locomotion,
      clip: locomotionToClip(npc.locomotion),
      activity: npc.goal.activity,
      destinationLabel: npc.goal.destinationLabel,
      accentColor: profile?.accentColor ?? "#94a3b8",
      inView: npc.inView,
      assets: resolveAvatarAssets(profile?.modelId ?? npc.id),
    };
    this.posesById.set(npc.id, pose);
    return pose;
  }
}
