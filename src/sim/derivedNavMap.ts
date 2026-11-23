// Navigation helpers for the NPC simulation: node-id scheme shared with Claude's authored graph
// (src/strip/navMap.ts) and circle-vs-world collision. The graph itself is RESERVOIR_NAV_MAP.
import type { Rect, Segment } from "../strip/cityMap";
import type { NavMap } from "./types";

/** Minimum clearance (metres) kept between NPC capsule center and walls/fences. */
export const NPC_COLLISION_RADIUS = 0.42;

/** Returns true if point (x, z) lies inside rect expanded by `margin`. */
export function pointInRect(
  x: number,
  z: number,
  rect: Rect,
  margin = 0,
): boolean {
  return (
    x >= rect.x0 - margin &&
    x <= rect.x1 + margin &&
    z >= rect.z0 - margin &&
    z <= rect.z1 + margin
  );
}

function orientation(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function onSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): boolean {
  return (
    px <= Math.max(ax, bx) + 1e-6 &&
    px >= Math.min(ax, bx) - 1e-6 &&
    pz <= Math.max(az, bz) + 1e-6 &&
    pz >= Math.min(az, bz) - 1e-6
  );
}

export function segmentsIntersect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const o1 = orientation(ax, az, bx, bz, cx, cz);
  const o2 = orientation(ax, az, bx, bz, dx, dz);
  const o3 = orientation(cx, cz, dx, dz, ax, az);
  const o4 = orientation(cx, cz, dx, dz, bx, bz);

  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }
  if (Math.abs(o1) < 1e-6 && onSegment(ax, az, bx, bz, cx, cz)) return true;
  if (Math.abs(o2) < 1e-6 && onSegment(ax, az, bx, bz, dx, dz)) return true;
  if (Math.abs(o3) < 1e-6 && onSegment(cx, cz, dx, dz, ax, az)) return true;
  if (Math.abs(o4) < 1e-6 && onSegment(cx, cz, dx, dz, bx, bz)) return true;
  return false;
}

export function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

export function segmentIntersectsRect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rect: Rect,
  margin = 0,
): boolean {
  const x0 = rect.x0 - margin;
  const x1 = rect.x1 + margin;
  const z0 = rect.z0 - margin;
  const z1 = rect.z1 + margin;

  if (
    (ax >= x0 && ax <= x1 && az >= z0 && az <= z1) ||
    (bx >= x0 && bx <= x1 && bz >= z0 && bz <= z1)
  ) {
    return true;
  }

  return (
    segmentsIntersect(ax, az, bx, bz, x0, z0, x1, z0) ||
    segmentsIntersect(ax, az, bx, bz, x1, z0, x1, z1) ||
    segmentsIntersect(ax, az, bx, bz, x1, z1, x0, z1) ||
    segmentsIntersect(ax, az, bx, bz, x0, z1, x0, z0)
  );
}

export function segmentBlockedByWorld(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: readonly Rect[],
  fences: readonly Segment[],
  margin = NPC_COLLISION_RADIUS,
): boolean {
  for (const w of walls) {
    if (segmentIntersectsRect(ax, az, bx, bz, w, margin)) return true;
  }
  for (const f of fences) {
    if (segmentsIntersect(ax, az, bx, bz, f.ax, f.az, f.bx, f.bz)) return true;
    if (
      distancePointToSegment(ax, az, f.ax, f.az, f.bx, f.bz) < margin * 0.7 ||
      distancePointToSegment(bx, bz, f.ax, f.az, f.bx, f.bz) < margin * 0.7
    ) {
      return true;
    }
  }
  return false;
}

export function isPointWalkable(
  x: number,
  z: number,
  navMap: Pick<NavMap, "obstacles" | "fences" | "bounds">,
  margin = NPC_COLLISION_RADIUS,
): boolean {
  if (
    x < navMap.bounds.x0 + margin ||
    x > navMap.bounds.x1 - margin ||
    z < navMap.bounds.z0 + margin ||
    z > navMap.bounds.z1 - margin
  ) {
    return false;
  }
  for (const w of navMap.obstacles) {
    if (pointInRect(x, z, w, margin)) return false;
  }
  for (const f of navMap.fences) {
    if (distancePointToSegment(x, z, f.ax, f.az, f.bx, f.bz) < margin) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves circle-vs-AABB and circle-vs-fence collisions so an NPC slides cleanly
 * along walls and never penetrates buildings or fences.
 */
export function resolveWorldCollision(
  x: number,
  z: number,
  navMap: Pick<NavMap, "obstacles" | "fences" | "bounds">,
  radius = NPC_COLLISION_RADIUS,
): { x: number; z: number; collided: boolean } {
  let rx = Math.max(navMap.bounds.x0 + radius, Math.min(navMap.bounds.x1 - radius, x));
  let rz = Math.max(navMap.bounds.z0 + radius, Math.min(navMap.bounds.z1 - radius, z));
  let collided = rx !== x || rz !== z;

  for (const w of navMap.obstacles) {
    const cx = Math.max(w.x0, Math.min(rx, w.x1));
    const cz = Math.max(w.z0, Math.min(rz, w.z1));
    const dx = rx - cx;
    const dz = rz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      collided = true;
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        // Inside rect center fallback: push toward nearest edge.
        const dLeft = Math.abs(rx - w.x0);
        const dRight = Math.abs(w.x1 - rx);
        const dTop = Math.abs(rz - w.z0);
        const dBot = Math.abs(w.z1 - rz);
        const minD = Math.min(dLeft, dRight, dTop, dBot);
        if (minD === dLeft) rx = w.x0 - radius;
        else if (minD === dRight) rx = w.x1 + radius;
        else if (minD === dTop) rz = w.z0 - radius;
        else rz = w.z1 + radius;
      }
    }
  }

  for (const f of navMap.fences) {
    const vx = f.bx - f.ax;
    const vz = f.bz - f.az;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((rx - f.ax) * vx + (rz - f.az) * vz) / lenSq));
    const cx = f.ax + t * vx;
    const cz = f.az + t * vz;
    const dx = rx - cx;
    const dz = rz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      collided = true;
      const dist = Math.sqrt(distSq);
      if (dist > 1e-6) {
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        // Push perpendicular to fence segment.
        const inv = 1 / Math.sqrt(lenSq);
        rx += -vz * inv * radius;
        rz += vx * inv * radius;
      }
    }
  }

  return { x: rx, z: rz, collided };
}

export function doorNodeId(locationId: string): string {
  return `door:${locationId}`;
}

export function homeNodeId(homeId: string): string {
  return `home:${homeId}`;
}

export function npcSpotNodeId(characterId: string): string {
  return `spot:${characterId}`;
}
