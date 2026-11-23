import { describe, expect, it } from "vitest";
import { LivingBlockSim, createReservoirNpcProfiles } from "../sim";
import { RESERVOIR_NAV_MAP, edgeBlocked } from "../strip/navMap";
import { WALLS, DOORS, HOUSES, NPC_SPOTS, HOUSEHOLDS } from "../strip/cityMap";
import { newGame } from "../core/Simulation";

const nav = RESERVOIR_NAV_MAP;
const inWall = (x: number, z: number) => WALLS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);
function makeSim() {
  const state = newGame("T", "reservoir");
  return new LivingBlockSim({
    navMap: nav,
    engineState: state,
    simMinutesPerSecond: 3,
  });
}

describe("authored nav map (src/strip/navMap.ts)", () => {
  it("connects every node into one graph", () => {
    const adj = new Map(nav.nodes.map((n) => [n.id, [] as string[]]));
    for (const e of nav.edges) { adj.get(e.from)!.push(e.to); adj.get(e.to)!.push(e.from); }
    const seen = new Set([nav.nodes[0].id]);
    const q = [nav.nodes[0].id];
    while (q.length) for (const n of adj.get(q.pop()!)!) if (!seen.has(n)) { seen.add(n); q.push(n); }
    expect(nav.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id)).toEqual([]);
  });

  it("keeps every edge clear of buildings and fences, and drops none", () => {
    for (const e of nav.edges) {
      const a = nav.nodes.find((n) => n.id === e.from)!, b = nav.nodes.find((n) => n.id === e.to)!;
      expect(edgeBlocked(a.x, a.z, b.x, b.z), `${e.from} -> ${e.to}`).toBe(false);
    }
    expect(nav.missingConnections.filter((m) => m.startsWith("Blocked") || m.startsWith("No sidewalk"))).toEqual([]);
  });

  it("has a node for every door, house and NPC spot, with the simulation's id scheme", () => {
    const ids = new Set(nav.nodes.map((n) => n.id));
    for (const d of DOORS) expect(ids.has(`door:${d.locationId}`)).toBe(true);
    for (const h of HOUSES) expect(ids.has(`home:${h.id}`)).toBe(true);
    for (const s of NPC_SPOTS) expect(ids.has(`spot:${s.characterId}`)).toBe(true);
  });

  it("reaches all five streets", () => {
    const streets = new Set(nav.nodes.map((n) => n.street).filter(Boolean));
    for (const s of ["Lil Bit Lane", "Blocc Boy Blvd", "Big Mouth Blvd", "Dirty Money Dr", "No Refund Road", "Kirkwood St"]) expect(streets.has(s)).toBe(true);
  });
});

describe("living Reservoir (Gemini's simulation on Claude's map)", () => {
  it("homes NPCs where cityMap HOUSEHOLDS says", () => {
    const profiles = createReservoirNpcProfiles(newGame("T", "reservoir"));
    for (const h of HOUSEHOLDS) for (const id of h.residents) {
      const p = profiles.find((q) => q.id === id);
      if (p) expect(p.homeDestinationId, id).toBe(h.propertyId);
    }
    const homes = profiles.map((p) => p.homeDestinationId);
    expect(homes.filter((h) => h === "res-home-01")).toHaveLength(1); // nobody doubled up by accident
  });

  it("runs a full day on the real map: everyone moves between places, never through walls, never stuck", () => {
    const sim = makeSim();
    const visits = new Map<string, Set<string>>();
    const atMarket = new Set<string>();
    let wall = 0, stuck = 0, maxStep = 0;
    const prev = new Map<string, [number, number]>();
    for (let i = 0; i < 20 * 60 * 8; i++) { // 8 real minutes = 24 game hours at 3 min/s
      sim.stepFixed(0.05);
      for (const n of sim.getNpcs()) {
        if (inWall(n.x, n.z)) wall++;
        if (n.goal.activity === "recover_route") stuck++;
        const p = prev.get(n.id);
        if (p) maxStep = Math.max(maxStep, Math.hypot(n.x - p[0], n.z - p[1]));
        prev.set(n.id, [n.x, n.z]);
        if (n.atDestinationId) { if (!visits.has(n.id)) visits.set(n.id, new Set()); visits.get(n.id)!.add(n.atDestinationId); }
      }
      if (i % 600 === 0) for (const p of sim.peopleHere("reservoir.lil-jays")) atMarket.add(p.characterId);
    }
    expect(wall).toBe(0);
    expect(stuck).toBe(0);
    expect(maxStep).toBeLessThan(0.5); // 20 Hz: no teleporting
    expect(sim.getNpcs()).toHaveLength(5);
    for (const n of sim.getNpcs()) expect(visits.get(n.id)?.size ?? 0, n.id).toBeGreaterThanOrEqual(2);
    expect(atMarket.has("quanny")).toBe(true);
    expect(atMarket.has("mr-lewis")).toBe(true);
  });

  it("keeps routines going off-view and resumes without resetting", () => {
    const sim = makeSim();
    for (let i = 0; i < 200; i++) sim.stepFixed(0.05);
    const before = sim.getNpcs().map((n) => ({ id: n.id, x: n.x, z: n.z }));
    const minute = sim.getClock().minuteOfDay;
    sim.setCameraInArea(false);
    for (let i = 0; i < 300; i++) sim.update(1); // 300 s in the background at 1 Hz
    sim.setCameraInArea(true);
    expect(sim.getClock().minuteOfDay).toBeGreaterThan(minute + 10);
    const moved = sim.getNpcs().filter((n) => {
      const b = before.find((q) => q.id === n.id)!;
      return Math.hypot(n.x - b.x, n.z - b.z) > 1;
    });
    expect(moved.length).toBeGreaterThan(0);
    for (const n of sim.getNpcs()) expect(inWall(n.x, n.z)).toBe(false);
  });
});
