// Player collision against the authored map: building footprints (WALLS), fences (FENCES),
// people standing at their spots, and the walkable box (WALK_BOUNDS). Plain 2D circle-vs-shape
// maths on the ground plane, no physics engine. The NPC simulation can import the same
// `blocked` / `resolveCircle` so both agree on what is solid.
import { WALLS, FENCES, WALK_BOUNDS, type Rect, type Segment } from "../cityMap";

export interface Circle { x: number; z: number; r: number }
export interface Solids {
  rects: readonly Rect[];
  segments: readonly Segment[];
  /** Round obstacles (people). */
  circles: readonly Circle[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

export const MAP_SOLIDS: Solids = { rects: WALLS, segments: FENCES, circles: [], bounds: WALK_BOUNDS };

/** Push a circle of radius r at (x, z) out of every solid it overlaps. Returns the corrected point. */
export function resolveCircle(x: number, z: number, r: number, solids: Solids): { x: number; z: number } {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const w of solids.rects) {
      const cx = Math.min(Math.max(x, w.x0), w.x1), cz = Math.min(Math.max(z, w.z0), w.z1);
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-12) {
        // Centre is inside the rectangle: leave by the nearest side.
        const out = [x - w.x0, w.x1 - x, z - w.z0, w.z1 - z];
        const i = out.indexOf(Math.min(...out));
        if (i === 0) x = w.x0 - r; else if (i === 1) x = w.x1 + r; else if (i === 2) z = w.z0 - r; else z = w.z1 + r;
      } else {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        x = cx + dx * r; z = cz + dz * r;
      }
      moved = true;
    }
    for (const s of solids.segments) {
      const vx = s.bx - s.ax, vz = s.bz - s.az;
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.min(1, Math.max(0, ((x - s.ax) * vx + (z - s.az) * vz) / len2));
      const px = s.ax + vx * t, pz = s.az + vz * t;
      let dx = x - px, dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-9) { dx = -vz; dz = vx; } // on the line: step off to one side
      const n = Math.hypot(dx, dz) || 1;
      x = px + (dx / n) * r; z = pz + (dz / n) * r;
      moved = true;
    }
    for (const c of solids.circles) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      const d = Math.hypot(dx, dz);
      if (d >= rr) continue;
      const n = d || 1;
      x = c.x + (d ? dx / n : 1) * rr; z = c.z + (d ? dz / n : 0) * rr;
      moved = true;
    }
    const b = solids.bounds;
    const bx = Math.min(Math.max(x, b.x0 + r), b.x1 - r), bz = Math.min(Math.max(z, b.z0 + r), b.z1 - r);
    if (bx !== x || bz !== z) { x = bx; z = bz; moved = true; }
    if (!moved) break;
  }
  return { x, z };
}

/**
 * Move a circle from (x, z) by (dx, dz), sliding along anything solid. Long steps are split so a
 * fast frame can never tunnel through a fence.
 */
export function moveCircle(x: number, z: number, dx: number, dz: number, r: number, solids: Solids) {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
  let p = { x, z };
  for (let i = 0; i < steps; i++) p = resolveCircle(p.x + dx / steps, p.z + dz / steps, r, solids);
  return p;
}

/** True if a circle at (x, z) overlaps something solid (for spawn checks and tests). */
export function blocked(x: number, z: number, r: number, solids: Solids = MAP_SOLIDS) {
  const p = resolveCircle(x, z, r, solids);
  return Math.hypot(p.x - x, p.z - z) > 1e-6;
}

/**
 * Where a ray from (ax, az) towards (bx, bz) first enters a building footprint taller than `y`
 * (0..1 along the ray), or 1 if it is clear. Used to keep the follow camera out of walls.
 */
export function firstWallHit(ax: number, az: number, bx: number, bz: number, rects: readonly Rect[] = WALLS) {
  let best = 1;
  const dx = bx - ax, dz = bz - az;
  for (const w of rects) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, dx, w.x0, w.x1], [az, dz, w.z0, w.z1]] as const) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < best && t0 >= 0) best = t0;
  }
  return best;
}
