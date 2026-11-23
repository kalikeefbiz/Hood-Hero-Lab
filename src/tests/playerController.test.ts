import { describe, expect, it } from "vitest";
import { PlayerController } from "../strip/player/controller";
import { blocked, firstWallHit, moveCircle, MAP_SOLIDS } from "../strip/player/collision";
import { PLAYER_START, WALLS, NPC_SPOTS, DOORS } from "../strip/cityMap";
import { CITY_ANCHORS } from "../strip/anchors";

const WEST = -Math.PI / 2, NORTH = Math.PI, EAST = Math.PI / 2;
const lilJays = WALLS.find((w) => w.id === "lil-jays")!;
const door = (id: string) => DOORS.find((d) => d.locationId === id)!;

/** Hold the stick straight "forward" with the camera looking `yaw`, for `seconds`. */
function hold(p: PlayerController, yaw: number, seconds: number, mag = 0.7) {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, { x: 0, y: mag, cameraYaw: yaw });
}

describe("collision", () => {
  it("keeps the player out of buildings and slides along walls", () => {
    // Walk north into Lil Jay's front wall.
    const p = moveCircle(0, 2, 0, -3, 0.3, MAP_SOLIDS);
    expect(p.z).toBeCloseTo(lilJays.z1 + 0.3, 5);
    // A diagonal push into the wall keeps the sideways part.
    const s = moveCircle(0, 1.3, 1, -1, 0.3, MAP_SOLIDS);
    expect(s.x).toBeGreaterThan(0.9);
    expect(s.z).toBeCloseTo(lilJays.z1 + 0.3, 5);
  });

  it("stops at fences but lets you through the Lot Court gate", () => {
    const fenceZ = 88.7;
    const wall = moveCircle(-24, 91, 0, -4, 0.3, MAP_SOLIDS); // front fence, west half
    expect(wall.z).toBeGreaterThanOrEqual(fenceZ + 0.3 - 1e-6);
    const gate = moveCircle(-16.98, 91, 0, -4, 0.3, MAP_SOLIDS);
    expect(gate.z).toBeLessThan(fenceZ - 1);
  });

  it("never tunnels through a fence on a long frame", () => {
    const p = moveCircle(-24, 89.2, 0, -6, 0.3, MAP_SOLIDS);
    expect(p.z).toBeGreaterThan(88.7);
  });

  it("keeps the player inside the walkable bounds", () => {
    const p = moveCircle(20, 2.4, 50, 0, 0.3, MAP_SOLIDS);
    expect(p.x).toBeLessThanOrEqual(MAP_SOLIDS.bounds.x1 - 0.3 + 1e-9);
  });

  it("start point and every anchor are standable", () => {
    expect(blocked(PLAYER_START.x, PLAYER_START.z, 0.3)).toBe(false);
    for (const a of CITY_ANCHORS) expect(blocked(a.x, a.z, 0.1), a.id).toBe(false);
  });

  it("finds the first wall between the player and the camera", () => {
    // From the sidewalk in front of Lil Jay's to a point behind the building: blocked partway.
    const t = firstWallHit(0, 2, 0, -14);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.1);
    expect(firstWallHit(0, 2, 0, 6)).toBe(1);
  });
});

describe("player controller", () => {
  it("walks, runs, and faces where it goes (camera-relative)", () => {
    const p = new PlayerController({ x: 6, z: 4, heading: WEST });
    hold(p, WEST, 1, 0.6);
    expect(p.motion).toBe("walk");
    expect(p.x).toBeLessThan(6);
    const walkSpeed = p.speed;
    hold(p, WEST, 0.6, 1);
    expect(p.motion).toBe("run");
    expect(p.speed).toBeGreaterThan(walkSpeed * 2);

    // Stick right while the camera looks north: turns to face east and moves east.
    const q = new PlayerController({ x: 10, z: 4, heading: NORTH });
    for (let t = 0; t < 1; t += 1 / 60) q.update(1 / 60, { x: 0.7, y: 0, cameraYaw: NORTH });
    expect(Math.abs(q.heading - EAST)).toBeLessThan(0.05);
    expect(q.x).toBeGreaterThan(10.5);
  });

  it("comes to rest and goes idle when the stick is released", () => {
    const p = new PlayerController({ x: 6, z: 4, heading: WEST });
    hold(p, WEST, 0.5);
    for (let t = 0; t < 0.6; t += 1 / 60) p.update(1 / 60, { x: 0, y: 0, cameraYaw: WEST });
    expect(p.speed).toBe(0);
    expect(p.motion).toBe("idle");
  });

  it("goes idle when pushing into a wall instead of running on the spot", () => {
    const p = new PlayerController({ x: 0, z: 1.4, heading: NORTH });
    hold(p, NORTH, 1, 1);
    expect(p.z).toBeCloseTo(lilJays.z1 + 0.3, 3);
    expect(p.motion).toBe("idle");
  });

  it("can't walk through people standing at their spots", () => {
    const quanny = NPC_SPOTS.find((n) => n.characterId === "quanny")!;
    const solids = { ...MAP_SOLIDS, circles: [{ x: quanny.x, z: quanny.z, r: 0.35 }] };
    const p = new PlayerController({ x: quanny.x + 2, z: quanny.z, heading: WEST, solids });
    hold(p, WEST, 2);
    expect(p.x - quanny.x).toBeGreaterThanOrEqual(0.65 - 1e-6);
  });

  it("reports arriving at and leaving a door, once each", () => {
    const p = new PlayerController({ x: 9, z: 2.4, heading: WEST });
    const arrived: string[] = [], left: string[] = [];
    p.onArrive((a) => arrived.push(a.id));
    p.onLeave((a) => left.push(a.id));
    hold(p, WEST, 5); // walk west along the sidewalk past Lil Jay's door
    expect(arrived).toContain("reservoir.lil-jays");
    expect(arrived.filter((id) => id === "reservoir.lil-jays")).toHaveLength(1);
    const d = door("reservoir.lil-jays");
    if (Math.hypot(p.x - d.x, p.z - d.z) > d.radius) expect(left).toContain("reservoir.lil-jays");
  });

  it("exposes a read-only snapshot", () => {
    const p = new PlayerController({ x: PLAYER_START.x, z: PLAYER_START.z, heading: PLAYER_START.rotY });
    const v = p.view();
    expect(Object.isFrozen(v)).toBe(true);
    expect(v.x).toBe(PLAYER_START.x);
  });
});
