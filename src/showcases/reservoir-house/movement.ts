import type { HouseCollision } from "./house";
import { pavementEnd, pavementHeight, pavementStart } from "./lot";

export interface WalkerPosition {
  x: number;
  y: number;
  z: number;
}
const bodyRadius = 0.22;
const stepUp = 0.22;

export function walkOnLot(
  from: WalkerPosition,
  x: number,
  z: number,
  collision: HouseCollision,
): WalkerPosition {
  x = Math.min(6.95, Math.max(-7.28, x));
  z = Math.min(9.3, Math.max(-13.0, z));
  let y = z >= pavementStart && z <= pavementEnd + 0.2 ? pavementHeight : 0;
  for (const surface of collision.walkable) {
    if (x < surface.x0 || x > surface.x1 || z < surface.z0 || z > surface.z1)
      continue;
    y = Math.max(y, surface.top);
  }
  if (y > from.y + stepUp) return from;
  for (const solid of collision.blockers) {
    if (y >= solid.top || y + 1.8 <= solid.bottom) continue;
    if (
      x + bodyRadius > solid.x0 &&
      x - bodyRadius < solid.x1 &&
      z + bodyRadius > solid.z0 &&
      z - bodyRadius < solid.z1
    )
      return from;
  }
  return { x, y, z };
}
