// Third-person follow camera for the walking player. One-finger drag on the city orbits it,
// pinch zooms; while you walk it drifts back behind you. It pulls in when a building would hide
// the player, using the map's footprints (2D, no per-frame raycast against meshes).
import * as THREE from "three";
import type { PlayerView } from "./controller";
import { firstWallHit } from "./collision";
import { WALLS, type Rect } from "../cityMap";

/** Rough roof height per footprint, for deciding whether a wall can hide the player. */
const roofOf = (w: Rect) => (w.id.includes("water-tower") ? 30 : w.id.includes("warehouse") ? 9 : 7.5);

export class FollowCamera {
  yaw: number;
  pitch = 0.34;
  distance = 5.2;
  readonly minDist = 2.2;
  readonly maxDist = 11;
  shown = 5.2;
  private lastManual = -Infinity;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private dist0 = 0;
  private look = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera, private el: HTMLElement, startYaw: number) {
    this.yaw = startYaw;
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", this.wheel, { passive: true });
  }

  dispose() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.down);
    el.removeEventListener("pointermove", this.move);
    el.removeEventListener("pointerup", this.up);
    el.removeEventListener("pointercancel", this.up);
    el.removeEventListener("wheel", this.wheel);
  }

  /** Direction the camera looks along the ground (for camera-relative movement). */
  get groundYaw() { return this.yaw; }

  private down = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      this.dist0 = this.distance;
    }
  };
  private move = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, cur);
    if (this.pointers.size === 1) {
      const k = 2.6 / Math.max(320, this.el.clientWidth);
      this.yaw -= (cur.x - prev.x) * k * Math.PI;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (cur.y - prev.y) * k * 1.6, 0.05, 1.15);
      this.lastManual = performance.now();
    } else if (this.pointers.size === 2 && this.pinch0 > 0) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.distance = THREE.MathUtils.clamp(this.dist0 * (this.pinch0 / Math.max(20, d)), this.minDist, this.maxDist);
      this.lastManual = performance.now();
    }
  };
  private up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch0 = 0; };
  private wheel = (e: WheelEvent) => {
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.1), this.minDist, this.maxDist);
  };

  update(dt: number, p: PlayerView) {
    // Drift back behind the player while walking, unless the player just looked around.
    if (p.motion !== "idle" && performance.now() - this.lastManual > 1400) {
      const behind = p.heading;
      const d = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
      this.yaw += d * Math.min(1, dt * (p.motion === "run" ? 2.2 : 1.2));
    }
    const headY = 1.45;
    this.look.set(p.x, headY, p.z);
    // Camera sits opposite the look direction.
    const horiz = Math.cos(this.pitch), lift = Math.sin(this.pitch);
    const want = this.distance;
    const ex = p.x - Math.sin(this.yaw) * horiz * want;
    const ez = p.z - Math.cos(this.yaw) * horiz * want;
    // Occlusion: find the first footprint between player and camera that is taller than the line there.
    let t = 1;
    for (const w of WALLS) {
      const hit = firstWallHit(p.x, p.z, ex, ez, [w]);
      if (hit >= t) continue;
      const yAtHit = headY + lift * want * hit;
      if (yAtHit < roofOf(w)) t = hit;
    }
    const target = Math.max(this.minDist * 0.6, t * want - 0.35);
    // Pull in at once (never see through a wall), ease back out.
    this.shown = target < this.shown ? target : this.shown + (target - this.shown) * Math.min(1, dt * 3);
    const d = this.shown;
    this.camera.position.set(
      p.x - Math.sin(this.yaw) * horiz * d,
      Math.max(0.5, headY + lift * d),
      p.z - Math.cos(this.yaw) * horiz * d,
    );
    this.camera.lookAt(this.look);
  }
}
