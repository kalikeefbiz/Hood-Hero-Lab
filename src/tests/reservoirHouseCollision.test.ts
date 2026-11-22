import { describe, expect, it } from "vitest";
import {
  createHouseCollision,
  houseEntrances,
} from "../showcases/reservoir-house/house";
import {
  walkOnLot,
  type WalkerPosition,
} from "../showcases/reservoir-house/movement";

const collision = createHouseCollision();

function walkTo(from: WalkerPosition, x: number, z: number) {
  const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.065);
  let position = from;
  for (let step = 1; step <= steps; step++) {
    position = walkOnLot(
      position,
      from.x + ((x - from.x) * step) / steps,
      from.z + ((z - from.z) * step) / steps,
      collision,
    );
    if (
      position.x !== from.x + ((x - from.x) * step) / steps ||
      position.z !== from.z + ((z - from.z) * step) / steps
    )
      break;
  }
  return position;
}

describe("Reservoir house walkable exterior", () => {
  it.each([
    {
      entrance: houseEntrances.front,
      start: { x: 0, y: 0, z: 3.28 },
      wall: [0, -0.25],
    },
    {
      entrance: houseEntrances.side,
      start: { x: 3.77, y: 0, z: -4.75 },
      wall: [2.9, -6.92],
    },
  ])(
    "allows both directions on the stairs and stops at the closed door",
    ({ entrance, start, wall }) => {
      const [x, y, z] = entrance.approach;
      const landing = walkTo(start, x, z);
      expect(landing.x).toBeCloseTo(x);
      expect(landing.y).toBeCloseTo(y);
      expect(landing.z).toBeCloseTo(z);
      const door = walkTo(landing, wall[0], wall[1]);
      expect(door.y).toBeCloseTo(y);
      expect(Math.hypot(door.x - wall[0], door.z - wall[1])).toBeGreaterThan(
        0.22,
      );
      expect(walkTo(landing, start.x, start.z)).toEqual(start);
    },
  );

  it("admits a continuous route around the entire house and blocks the porch rail", () => {
    const posts = [
      [5.35, 3.88],
      [5.35, -10.3],
      [-5.35, -10.3],
      [-5.35, 3.88],
      [5.35, 3.88],
    ];
    let position = { x: -5.35, y: 0.055, z: 3.88 };
    for (const [x, z] of posts) {
      position = walkTo(position, x, z);
      expect(position.x).toBeCloseTo(x);
      expect(position.z).toBeCloseTo(z);
    }
    const rail = walkTo({ x: 2.2, y: 0, z: 3.22 }, 2.2, 1.55);
    expect(rail.z).toBeGreaterThan(1.97);
    expect(rail.y).toBe(0);
  });
});
