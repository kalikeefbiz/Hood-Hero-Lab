import { describe, expect, it } from "vitest";
import { AvatarAdapter } from "../render/AvatarAdapter";
import { DOORS, FENCES, HOUSES, WALLS } from "../strip/cityMap";
import { RESERVOIR_NAV_MAP } from "../strip/navMap";
import {
  ACTIVE_DT,
  createGameStateRelationshipAdapter,
  doorNodeId,
  extractSimSnapshot,
  findNavPath,
  homeNodeId,
  isPointWalkable,
  LivingBlockSim,
  NPC_COLLISION_RADIUS,
  OFFVIEW_DT,
  restoreSimFromSave,
  segmentBlockedByWorld,
  SIM_SNAPSHOT_VERSION,
  type RelationshipDelta,
} from "../sim";

describe("One Living Block — headless Reservoir NPC simulation", () => {
  it("walks Claude's authored navMap (built from cityMap.ts): real IDs, zero wall/fence intersections", () => {
    const navMap = new LivingBlockSim().navMap;
    expect(navMap).toBe(RESERVOIR_NAV_MAP);

    expect(navMap.hood).toBe("reservoir");
    expect(navMap.source).toBe("authored-navMap");
    expect(navMap.obstacles).toBe(WALLS);
    expect(navMap.fences).toBe(FENCES);

    const nodeById = new Map(navMap.nodes.map((n) => [n.id, n]));
    // All canonical doors and Reservoir homes res-home-01..16 exist as nodes.
    for (const door of DOORS) {
      if (door.locationId) {
        expect(nodeById.has(doorNodeId(door.locationId))).toBe(true);
      }
    }
    for (const house of HOUSES) {
      expect(nodeById.has(homeNodeId(house.id))).toBe(true);
      expect(nodeById.get(homeNodeId(house.id))?.homeId).toBe(house.id);
    }

    // No edge clips any solid building or fence.
    for (const edge of navMap.edges) {
      const a = nodeById.get(edge.from)!;
      const b = nodeById.get(edge.to)!;
      expect(
        segmentBlockedByWorld(a.x, a.z, b.x, b.z, WALLS, FENCES, NPC_COLLISION_RADIUS),
      ).toBe(false);
    }

    // Missing connections are explicitly documented rather than fabricated.
    expect(navMap.missingConnections.length).toBeGreaterThan(0);
  });

  it("produces bit-for-bit reproducible seeded behavior across equivalent runs", () => {
    const run = () => {
      const sim = new LivingBlockSim({
        seed: 90210,
        engineDay: 2,
        startMinuteOfDay: 480,
        simMinutesPerSecond: 1.0,
      });
      for (let i = 0; i < 600; i++) {
        sim.stepFixed(ACTIVE_DT);
      }
      return sim.serialize();
    };

    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });

  it("runs five autonomous NPCs with distinct routines, zero wall penetration, and no teleporting", () => {
    const sim = new LivingBlockSim({
      seed: 20261122,
      engineDay: 1,
      startMinuteOfDay: 460, // 07:40 — right before morning errands begin
      simMinutesPerSecond: 1.0,
    });

    const npcs = sim.getNpcs();
    expect(npcs).toHaveLength(5);

    // Canonical identities present alongside clearly labeled anonymous test residents.
    const ids = npcs.map((n) => n.id);
    expect(ids).toContain("quanny");
    expect(ids).toContain("mr-lewis");
    expect(ids).toContain("resident-reservoir");
    expect(npcs.filter((n) => n.isCanonical)).toHaveLength(3);
    expect(npcs.filter((n) => !n.isCanonical)).toHaveLength(2);

    // Track distinct destinations visited & max single-tick displacement per NPC.
    const visitedByNpc = new Map<string, Set<string>>(
      npcs.map((n) => [n.id, new Set([n.goal.destinationId])]),
    );
    const movedDistance = new Map<string, number>(npcs.map((n) => [n.id, 0]));
    let maxStepDisplacement = 0;

    // Simulate 360 seconds (6 in-game hours at 1 min/sec) at 20 Hz active rate.
    const totalTicks = 360 * 20;
    for (let t = 0; t < totalTicks; t++) {
      sim.stepFixed(ACTIVE_DT);
      for (const npc of sim.getNpcs()) {
        const d = Math.hypot(npc.x - npc.prevX, npc.z - npc.prevZ);
        maxStepDisplacement = Math.max(maxStepDisplacement, d);
        movedDistance.set(npc.id, (movedDistance.get(npc.id) ?? 0) + d);
        if (npc.atDestinationId) {
          visitedByNpc.get(npc.id)!.add(npc.atDestinationId);
        }
        // Must never penetrate buildings or fences.
        expect(
          isPointWalkable(npc.x, npc.z, sim.navMap, NPC_COLLISION_RADIUS - 0.05),
        ).toBe(true);
      }
    }

    // No teleporting: max displacement per 0.05s tick stays within run speed bound (~3.2 m/s * 0.05 = 0.16m + collision push).
    expect(maxStepDisplacement).toBeLessThan(0.45);

    // Every NPC actually traveled autonomously across the neighborhood and reached multiple destinations.
    for (const npc of sim.getNpcs()) {
      const visited = Array.from(visitedByNpc.get(npc.id)!);
      expect(movedDistance.get(npc.id)!, `${npc.id} movedDistance`).toBeGreaterThan(15);
      expect(
        visited.length,
        `${npc.id} visited only [${visited.join(", ")}]`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles environmental disturbances with interrupt and resume/replan", () => {
    const sim = new LivingBlockSim({
      seed: 4242,
      engineDay: 1,
      startMinuteOfDay: 485,
      simMinutesPerSecond: 0.25,
    });

    // Advance slightly so NPCs are active on Lil Bit Lane.
    for (let i = 0; i < 40; i++) sim.stepFixed(ACTIVE_DT);

    const quanny = sim.getNpc("quanny")!;
    const mrLewis = sim.getNpc("mr-lewis")!;
    const prevQuannySlot = quanny.goal.slotId;

    // Trigger disturbance right outside Lil Jay's Market.
    sim.triggerDisturbance({
      kind: "commotion",
      x: 0.5,
      z: 2.0,
      radius: 10.0,
      remainingSec: 4.0,
      label: "Loud dispute outside Lil Jay's",
    });

    sim.stepFixed(ACTIVE_DT);
    expect(quanny.goal.activity).toBe("react_disturbance");
    expect(quanny.interruptedGoal?.slotId).toBe(prevQuannySlot);
    expect(mrLewis.goal.activity).toBe("react_disturbance");

    // Step past the disturbance duration (10s of active ticks) and verify recovery/resume.
    for (let i = 0; i < 200; i++) sim.stepFixed(ACTIVE_DT);
    expect(quanny.goal.activity).not.toBe("react_disturbance");
    expect(mrLewis.goal.activity).not.toBe("react_disturbance");
    expect(quanny.interruptedGoal).toBeNull();
  });

  it("recovers cleanly when an NPC destination becomes unreachable", () => {
    const sim = new LivingBlockSim({
      seed: 777,
      engineDay: 1,
      startMinuteOfDay: 480,
      simMinutesPerSecond: 1.0,
    });

    // Block Lil Jay's Market door so Drew cannot reach his 08:00 grocery errand.
    const lilJaysNode = doorNodeId("reservoir.lil-jays");
    sim.blockNode(lilJaysNode, true);

    expect(
      findNavPath(sim.navIndex, homeNodeId("res-home-02"), lilJaysNode, new Set([lilJaysNode])),
    ).toBeNull();

    // Advance until Drew transitions to his 08:00 errand slot and detects blockage.
    const drew = sim.getNpc("resident-reservoir")!;
    for (let i = 0; i < 20; i++) sim.stepFixed(ACTIVE_DT);
    // Force a schedule transition check at 08:01 if already in slot.
    sim.blockNode(lilJaysNode, true);
    for (let i = 0; i < 40; i++) sim.stepFixed(ACTIVE_DT);

    expect(drew.goal.activity).toBe("recover_route");
    // Unblock and step past recovery timer -> resumes normal schedule cleanly.
    sim.blockNode(lilJaysNode, false);
    for (let i = 0; i < 160; i++) sim.stepFixed(ACTIVE_DT);
    expect(drew.goal.activity).not.toBe("recover_route");
  });

  it("continues persistent routines at 1 Hz off-screen without resetting to spawn", () => {
    const sim = new LivingBlockSim({
      seed: 1337,
      engineDay: 1,
      startMinuteOfDay: 565, // 09:25 — right before Quanny walks to Pawn at 09:30
      simMinutesPerSecond: 1.0,
    });

    const beforeQuanny = { x: sim.getNpc("quanny")!.x, z: sim.getNpc("quanny")!.z };

    // Leave Lil Bit Lane -> switches to 1 Hz off-view mode.
    sim.setCameraInArea(false);
    expect(sim.getPerformanceStats().mode).toBe("offview-1hz");

    // Advance 90 simulated seconds at 1 Hz off-view ticks.
    for (let i = 0; i < 90; i++) {
      sim.stepFixed(OFFVIEW_DT);
    }

    const duringOffview = {
      x: sim.getNpc("quanny")!.x,
      z: sim.getNpc("quanny")!.z,
      dest: sim.getNpc("quanny")!.goal.destinationId,
    };

    // Quanny moved away from Lil Jay's toward Pawn while off-screen.
    expect(duringOffview.dest).toBe("reservoir.pawn");
    expect(Math.hypot(duringOffview.x - beforeQuanny.x, duringOffview.z - beforeQuanny.z)).toBeGreaterThan(10);

    // Return camera to Lil Bit Lane -> must NOT reset position or routine.
    sim.setCameraInArea(true);
    expect(sim.getPerformanceStats().mode).toBe("active-20hz");
    expect(sim.getNpc("quanny")!.x).toBeCloseTo(duringOffview.x, 4);
    expect(sim.getNpc("quanny")!.z).toBeCloseTo(duringOffview.z, 4);
    expect(sim.getNpc("quanny")!.goal.destinationId).toBe("reservoir.pawn");
  });

  it("keeps engine day authoritative, reads relationships via adapter, and supports old saves", () => {
    const deltas: RelationshipDelta[] = [];
    const mockEngineState = {
      day: 7,
      characters: {
        quanny: {
          relationships: {
            "mr-lewis": { trust: 20, respect: 40, affection: 10, grievance: 0, history: [] },
          },
        },
        "mr-lewis": {
          relationships: {
            quanny: { trust: 15, respect: 25, affection: 5, grievance: 0, history: [] },
          },
        },
      },
    };

    const adapter = createGameStateRelationshipAdapter(
      () => mockEngineState as never,
      (d) => deltas.push(d),
    );

    const sim = new LivingBlockSim({
      seed: 555,
      engineDay: mockEngineState.day,
      startMinuteOfDay: 1435,
      simMinutesPerSecond: 1.0,
      relationshipAdapter: adapter,
    });

    // Cached relationship reads from engine adapter.
    expect(sim.relationships.getAffinity("quanny", "mr-lewis")).toBeGreaterThan(15);

    // Wrapping past midnight does NOT increment a second independent dayCount.
    for (let i = 0; i < 200; i++) sim.stepFixed(ACTIVE_DT);
    expect(sim.getClock().engineDay).toBe(7);
    expect(sim.getClock().dayWrapPending).toBe(true);

    // Engine authoritatively advances day to 8.
    sim.syncEngineDay(8);
    expect(sim.getClock().engineDay).toBe(8);
    expect(sim.getClock().dayWrapPending).toBe(false);

    // Versioned snapshot round-trip.
    const snapshot = extractSimSnapshot(sim);
    expect(snapshot.schemaVersion).toBe(SIM_SNAPSHOT_VERSION);
    const restored = restoreSimFromSave({ day: 8, sim: snapshot });
    expect(restored.restoredFromSnapshot).toBe(true);
    expect(restored.sim.serialize()).toEqual(snapshot);

    // Old save without `sim` field loads cleanly with no error.
    const legacy = restoreSimFromSave({ day: 12 });
    expect(legacy.restoredFromSnapshot).toBe(false);
    expect(legacy.sim.getClock().engineDay).toBe(12);
    expect(legacy.sim.getNpcs()).toHaveLength(5);
  });

  it("exposes verified peopleHere contract and AvatarAdapter interpolation under 3 ms/frame", () => {
    const sim = new LivingBlockSim({
      seed: 2026,
      engineDay: 1,
      startMinuteOfDay: 485,
      simMinutesPerSecond: 0.5,
    });
    const adapter = new AvatarAdapter();

    // Quanny starts outside Lil Jay's Market.
    const atLilJays = sim.peopleHere("reservoir.lil-jays");
    expect(atLilJays.some((p) => p.characterId === "quanny")).toBe(true);

    // Approved rig mapping for Quanny; temporary fallback for test residents.
    const poses0 = adapter.sync(sim, 0);
    expect(poses0).toHaveLength(5);
    const quannyPose = adapter.getPose("quanny")!;
    expect(quannyPose.assets.usesApprovedModel).toBe(true);
    expect(quannyPose.assets.modelUrl).toBe("assets/models/characters/quanny.glb");
    expect(adapter.getPose("sim-resident-lilbit-04")!.assets.usesApprovedModel).toBe(false);

    // Measure 1,000 active 20 Hz ticks + render interpolation sync.
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const s0 = performance.now();
      sim.stepFixed(ACTIVE_DT);
      adapter.sync(sim, 0.5);
      samples.push(performance.now() - s0);
    }
    samples.sort((a, b) => a - b);
    const totalMs = samples.reduce((a, b) => a + b, 0);
    const avgMsPerFrame = totalMs / samples.length;
    const p95Ms = samples[Math.floor(samples.length * 0.95)]!;
    const maxMs = samples[samples.length - 1]!;
    console.log(
      "SIM_PERF",
      JSON.stringify({
        frames: samples.length,
        avgMs: Number(avgMsPerFrame.toFixed(4)),
        p95Ms: Number(p95Ms.toFixed(4)),
        maxMs: Number(maxMs.toFixed(4)),
      }),
    );

    // Must be well under the ~3 ms/frame budget.
    expect(avgMsPerFrame).toBeLessThan(3.0);
  });
});
