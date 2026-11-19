import { districtGrid } from "../city3d/layout";

export const MARKET = "reservoir.lil-jays";
export const INTERACTION_RANGE = 2.4;
export const RETREAT_RANGE = 7;

const { sections, blocks } = districtGrid("reservoir");
const strip = sections.find((section) => section.id === "strip")!;
const lots = blocks.filter((block) => block.section === strip.id);

// Keep this first slice on public streets and the outer edge of the sidewalks.
// The inner lots include doors, fences and props built for the strategy camera.
export function canWalkReservoir(x: number, z: number) {
  const radius = 0.32;
  return (
    x >= strip.minX + radius &&
    x <= strip.maxX - radius &&
    z >= strip.minZ + radius &&
    z <= strip.maxZ + 4.5 - radius &&
    !lots.some(
      (lot) =>
        x > lot.minX + 0.45 - radius && x < lot.maxX - 0.45 + radius &&
        z > lot.minZ + 0.45 - radius && z < lot.maxZ - 0.45 + radius,
    )
  );
}

export function clearReservoirApproach(x: number, z: number, toX: number, toZ: number) {
  const samples = Math.ceil(Math.hypot(toX - x, toZ - z) / 0.15);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (!canWalkReservoir(x + (toX - x) * t, z + (toZ - z) * t)) return false;
  }
  return true;
}

export type StreetTarget = {
  id: string;
  label: string;
  placeId: string;
  slot?: number;
};
