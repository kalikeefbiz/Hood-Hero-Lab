// The player controller: walking, running, facing, collision and arrival at map anchors.
// Pure logic with no renderer, so it runs headless in tests and in a future host. The avatar,
// camera and touch input are separate and only read or feed this.
//
// What it does NOT do: decide whether an interaction is allowed or what it costs (Codex's
// engine), or move NPCs (Gemini's simulation).
import { anchorsAt, type AnchorKind, type CityAnchor } from "../anchors";
import { moveCircle, resolveCircle, MAP_SOLIDS, type Solids } from "./collision";

export type Motion = "idle" | "walk" | "run";

/** Read-only view of the player for anyone else (UI, NPC simulation, gameplay host). */
export interface PlayerView {
  readonly x: number;
  readonly z: number;
  /** Radians about +Y; 0 faces +Z (south). Same convention as cityMap facing/rotY. */
  readonly heading: number;
  /** Ground speed, m/s. */
  readonly speed: number;
  readonly motion: Motion;
  /** Anchors the player is standing within, nearest first. */
  readonly nearby: readonly CityAnchor[];
}

export interface ControllerOptions {
  x: number; z: number; heading: number;
  radius?: number;
  walkSpeed?: number;
  runSpeed?: number;
  solids?: Solids;
  /** Which anchors count for arrival. */
  arrivalKinds?: readonly AnchorKind[];
}

export interface MoveInput {
  /** Stick in camera space: x right, y forward. Length 0..1. Past `runAt` it runs. */
  x: number; y: number;
  /** Direction the camera looks along the ground (radians about +Y, same convention as heading). */
  cameraYaw: number;
  /** Force running (keyboard shift). */
  run?: boolean;
}

type Listener = (anchor: CityAnchor) => void;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class PlayerController implements PlayerView {
  x: number; z: number; heading: number;
  speed = 0;
  motion: Motion = "idle";
  nearby: CityAnchor[] = [];

  readonly radius: number;
  readonly walkSpeed: number;
  readonly runSpeed: number;
  /** Stick length at which walking becomes running. */
  readonly runAt = 0.82;
  solids: Solids;
  private kinds: readonly AnchorKind[];
  private arriveFns: Listener[] = [];
  private leaveFns: Listener[] = [];

  constructor(o: ControllerOptions) {
    this.radius = o.radius ?? 0.3;
    this.walkSpeed = o.walkSpeed ?? 1.6;
    this.runSpeed = o.runSpeed ?? 4.2;
    this.solids = o.solids ?? MAP_SOLIDS;
    this.kinds = o.arrivalKinds ?? ["place", "home", "storefront", "npc"];
    const p = resolveCircle(o.x, o.z, this.radius, this.solids);
    this.x = p.x; this.z = p.z; this.heading = o.heading;
    this.nearby = anchorsAt(this.x, this.z, this.kinds);
  }

  onArrive(fn: Listener) { this.arriveFns.push(fn); return () => this.arriveFns.splice(this.arriveFns.indexOf(fn), 1); }
  onLeave(fn: Listener) { this.leaveFns.push(fn); return () => this.leaveFns.splice(this.leaveFns.indexOf(fn), 1); }

  /** Advance one frame. dt in seconds (clamp it; the host should never pass more than ~0.1). */
  update(dt: number, input: MoveInput) {
    const mag = Math.min(1, Math.hypot(input.x, input.y));
    const running = input.run || mag >= this.runAt;
    const target = mag < 0.12 ? 0 : running ? this.runSpeed : this.walkSpeed * Math.min(1, mag / 0.6);

    // Ease speed: quick to start, a short slide to stop.
    const rate = target > this.speed ? 10 : 14;
    this.speed += (target - this.speed) * Math.min(1, dt * rate);
    if (this.speed < 0.02 && target === 0) this.speed = 0;

    if (mag >= 0.12) {
      // Camera-relative: stick up walks the way the camera looks; stick right turns to its right.
      const want = wrap(input.cameraYaw - Math.atan2(input.x, input.y));
      const turn = wrap(want - this.heading);
      this.heading = wrap(this.heading + turn * Math.min(1, dt * 12));
    }
    if (this.speed > 0) {
      const step = this.speed * dt;
      const p = moveCircle(this.x, this.z, Math.sin(this.heading) * step, Math.cos(this.heading) * step, this.radius, this.solids);
      // Report the speed actually achieved, so walking into a wall plays idle, not a treadmill.
      const moved = Math.hypot(p.x - this.x, p.z - this.z);
      this.x = p.x; this.z = p.z;
      if (dt > 0) this.speed = Math.min(this.speed, moved / dt);
    }
    this.motion = this.speed < 0.15 ? "idle" : this.speed > (this.walkSpeed + this.runSpeed) / 2 ? "run" : "walk";
    this.updateNearby();
  }

  /** Place the player (spawn, or a save restored at a door). Not a gameplay teleport. */
  place(x: number, z: number, heading = this.heading) {
    const p = resolveCircle(x, z, this.radius, this.solids);
    this.x = p.x; this.z = p.z; this.heading = heading; this.speed = 0; this.motion = "idle";
    this.updateNearby();
  }

  private updateNearby() {
    const now = anchorsAt(this.x, this.z, this.kinds);
    const was = new Set(this.nearby.map((a) => a.id));
    const is = new Set(now.map((a) => a.id));
    const left = this.nearby.filter((a) => !is.has(a.id));
    this.nearby = now;
    for (const a of left) for (const fn of this.leaveFns) fn(a);
    for (const a of now) if (!was.has(a.id)) for (const fn of this.arriveFns) fn(a);
  }

  /** A frozen snapshot for consumers who must not mutate the controller. */
  view(): PlayerView {
    return Object.freeze({ x: this.x, z: this.z, heading: this.heading, speed: this.speed, motion: this.motion, nearby: [...this.nearby] });
  }
}
