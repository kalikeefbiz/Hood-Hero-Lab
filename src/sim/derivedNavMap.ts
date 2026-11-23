import {
  DOORS,
  FENCES,
  HOUSES,
  NPC_SPOTS,
  PLAYER_START,
  STOREFRONTS,
  WALK_BOUNDS,
  WALLS,
  type Door,
  type HomeProperty,
  type Rect,
  type Segment,
} from "../strip/cityMap";
import type { NavEdge, NavEdgeKind, NavMap, NavNode } from "./types";

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

/**
 * Derives a verified sidewalk-aware navigation graph directly from Claude's
 * canonical `src/strip/cityMap.ts` data until `src/strip/navMap.ts` is authored.
 *
 * Every edge is verified against `WALLS` and `FENCES`; no paths are fabricated
 * through buildings or unverified back-lot geometry.
 */
export function buildDerivedReservoirNavMap(): NavMap {
  const nodes: NavNode[] = [];
  const edges: NavEdge[] = [];
  const nodeById = new Map<string, NavNode>();
  const missingConnections: string[] = [];

  const addNode = (node: NavNode) => {
    if (nodeById.has(node.id)) return;
    nodes.push(node);
    nodeById.set(node.id, node);
  };

  const addVerifiedEdge = (
    fromId: string,
    toId: string,
    kind: NavEdgeKind,
    width = 2.0,
    costMultiplier = 1.0,
  ): boolean => {
    const a = nodeById.get(fromId);
    const b = nodeById.get(toId);
    if (!a || !b) return false;
    if (segmentBlockedByWorld(a.x, a.z, b.x, b.z, WALLS, FENCES, NPC_COLLISION_RADIUS)) {
      missingConnections.push(
        `Blocked edge skipped: ${fromId} -> ${toId} intersects WALLS or FENCES`,
      );
      return false;
    }
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    edges.push({
      from: fromId,
      to: toId,
      kind,
      cost: Number((dist * costMultiplier).toFixed(3)),
      width,
      bidirectional: true,
    });
    return true;
  };

  // --- Derive street sidewalk z-lines and Kirkwood x-line from cityMap anchors ---
  const lilJaysDoor = DOORS.find((d) => d.locationId === "reservoir.lil-jays");
  const pawnDoor = DOORS.find((d) => d.locationId === "reservoir.pawn");
  const laundryDoor = DOORS.find((d) => d.locationId === "reservoir.laundry");
  const warehouseDoor = DOORS.find((d) => d.locationId === "reservoir.warehouse");
  const lilBitSouthHouse = HOUSES.find((h) => h.id === "res-home-04");
  const bigMouthHouse = HOUSES.find((h) => h.id === "res-home-08");

  // Sidewalk coordinates derived strictly from cityMap door/player anchors.
  const kirkwoodX = PLAYER_START.x; // 6.0 m — east of Lil Jay's/Pawn/Laundry, west of Kirkwood house
  const lilBitNorthZ = (lilJaysDoor?.z ?? 1.9) + 0.3; // 2.2 m
  const lilBitSouthZ = (lilBitSouthHouse?.z ?? 16.9) - 2.3; // 14.6 m
  const bloccBoyNorthZ = (pawnDoor?.z ?? 46.2) + 0.9; // 47.1 m
  const noRefundNorthZ = (warehouseDoor?.z ?? 91.2) + 0.3; // 91.5 m
  const bigMouthNorthZ = (bigMouthHouse?.z ?? -43.3) + 1.5; // -41.8 m
  const dirtyMoneyNorthZ = (laundryDoor?.z ?? -94.0) + 1.2; // -92.8 m
  const dirtyMoneySouthZ = -81.4; // Derived from south Dirty Money houses at z -79.9 minus 1.5 m

  // --- 1. Add canonical Door, Home, and NPC Spot anchor nodes directly from cityMap ---
  const addDoorNode = (door: Door) => {
    if (!door.locationId) return;
    addNode({
      id: doorNodeId(door.locationId),
      kind: "door",
      x: door.x,
      z: door.z,
      locationId: door.locationId,
      facing: door.facing,
      radius: door.radius,
    });
  };
  for (const door of DOORS) addDoorNode(door);

  const addHomeNode = (house: HomeProperty) => {
    addNode({
      id: homeNodeId(house.id),
      kind: "porch",
      x: house.x,
      z: house.z,
      street: house.street,
      locationId: house.locationId,
      homeId: house.id,
      facing: house.facing,
      radius: house.radius,
    });
  };
  for (const house of HOUSES) addHomeNode(house);

  for (const spot of NPC_SPOTS) {
    addNode({
      id: npcSpotNodeId(spot.characterId),
      kind: "spot",
      x: spot.x,
      z: spot.z,
      street: "Lil Bit Lane",
      locationId: "reservoir.lil-jays",
      facing: spot.rotY,
      radius: 1.5,
    });
  }

  // --- 2. Build Lil Bit Lane sidewalk spines (north & south) + crosswalks ---
  const lilBitNorthXs = [-28.4, -19.4, -10.1, 0.0, 2.7, kirkwoodX];
  const lilBitNorthIds = lilBitNorthXs.map((x, idx) => {
    const id = `sw:lilbit-n-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: lilBitNorthZ, street: "Lil Bit Lane" });
    return id;
  });
  for (let i = 0; i < lilBitNorthIds.length - 1; i++) {
    addVerifiedEdge(lilBitNorthIds[i]!, lilBitNorthIds[i + 1]!, "sidewalk", 2.2);
  }

  const lilBitSouthXs = [-25.9, -13.6, -2.6, kirkwoodX, 21.6];
  const lilBitSouthIds = lilBitSouthXs.map((x, idx) => {
    const id = `sw:lilbit-s-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: lilBitSouthZ, street: "Lil Bit Lane" });
    return id;
  });
  for (let i = 0; i < lilBitSouthIds.length - 1; i++) {
    addVerifiedEdge(lilBitSouthIds[i]!, lilBitSouthIds[i + 1]!, "sidewalk", 2.2);
  }

  // Crosswalks across Lil Bit Lane (west, mid, Kirkwood corner).
  addNode({ id: "cw:lilbit-w-n", kind: "crosswalk", x: -25.9, z: lilBitNorthZ, street: "Lil Bit Lane" });
  addVerifiedEdge("sw:lilbit-n-0", "cw:lilbit-w-n", "sidewalk", 2.0);
  addVerifiedEdge("cw:lilbit-w-n", "sw:lilbit-n-1", "sidewalk", 2.0);
  addVerifiedEdge("cw:lilbit-w-n", "sw:lilbit-s-0", "crosswalk", 2.4, 1.15);

  addNode({ id: "cw:lilbit-mid-n", kind: "crosswalk", x: -13.6, z: lilBitNorthZ, street: "Lil Bit Lane" });
  addVerifiedEdge("sw:lilbit-n-1", "cw:lilbit-mid-n", "sidewalk", 2.0);
  addVerifiedEdge("cw:lilbit-mid-n", "sw:lilbit-n-2", "sidewalk", 2.0);
  addVerifiedEdge("cw:lilbit-mid-n", "sw:lilbit-s-1", "crosswalk", 2.4, 1.15);

  addVerifiedEdge("sw:lilbit-n-5", "sw:lilbit-s-3", "crosswalk", 2.6, 1.1);

  // Connect Lil Bit Lane doors, homes, and NPC spots to their sidewalk spines.
  addVerifiedEdge(doorNodeId("reservoir.lil-jays"), "sw:lilbit-n-3", "approach", 1.8);
  addVerifiedEdge(npcSpotNodeId("quanny"), "sw:lilbit-n-4", "approach", 1.8);
  addVerifiedEdge(npcSpotNodeId("quanny"), doorNodeId("reservoir.lil-jays"), "approach", 1.8);
  addVerifiedEdge(homeNodeId("res-home-01"), "sw:lilbit-n-2", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-02"), "sw:lilbit-n-1", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-03"), "sw:lilbit-n-0", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-04"), "sw:lilbit-s-2", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-05"), "sw:lilbit-s-1", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-06"), "sw:lilbit-s-0", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-07"), "sw:lilbit-s-4", "approach", 1.6);

  // --- 3. Kirkwood St north-south sidewalk spine connecting all five streets ---
  addNode({ id: "sw:kirkwood-bloccboy", kind: "sidewalk", x: kirkwoodX, z: bloccBoyNorthZ, street: "Kirkwood St" });
  addNode({ id: "sw:kirkwood-norefund", kind: "sidewalk", x: kirkwoodX, z: noRefundNorthZ, street: "Kirkwood St" });
  addNode({ id: "sw:kirkwood-bigmouth", kind: "sidewalk", x: kirkwoodX, z: bigMouthNorthZ, street: "Kirkwood St" });
  addNode({ id: "sw:kirkwood-dirtymoney-s", kind: "sidewalk", x: kirkwoodX, z: dirtyMoneySouthZ, street: "Kirkwood St" });
  addNode({ id: "sw:kirkwood-dirtymoney-n", kind: "sidewalk", x: kirkwoodX, z: dirtyMoneyNorthZ, street: "Kirkwood St" });

  addVerifiedEdge("sw:lilbit-s-3", "sw:kirkwood-bloccboy", "sidewalk", 2.2);
  addVerifiedEdge("sw:kirkwood-bloccboy", "sw:kirkwood-norefund", "sidewalk", 2.2);
  addVerifiedEdge("sw:lilbit-n-5", "sw:kirkwood-bigmouth", "sidewalk", 2.2);
  addVerifiedEdge("sw:kirkwood-bigmouth", "sw:kirkwood-dirtymoney-s", "sidewalk", 2.2);
  addVerifiedEdge("sw:kirkwood-dirtymoney-s", "sw:kirkwood-dirtymoney-n", "crosswalk", 2.4, 1.1);

  // --- 4. Blocc Boy Blvd north sidewalk (connected to Lil Bit Lane via Kirkwood) ---
  const bloccBoyXs = [-22.6, -14.6, -6.95, 0.52];
  const bloccBoyIds = bloccBoyXs.map((x, idx) => {
    const id = `sw:bloccboy-n-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: bloccBoyNorthZ, street: "Blocc Boy Blvd" });
    return id;
  });
  for (let i = 0; i < bloccBoyIds.length - 1; i++) {
    addVerifiedEdge(bloccBoyIds[i]!, bloccBoyIds[i + 1]!, "sidewalk", 2.2);
  }
  addVerifiedEdge(bloccBoyIds[bloccBoyIds.length - 1]!, "sw:kirkwood-bloccboy", "sidewalk", 2.2);
  addVerifiedEdge(doorNodeId("reservoir.pawn"), "sw:bloccboy-n-3", "approach", 1.8);

  // --- 5. No Refund Road north sidewalk (Warehouse & Lot Court gate) ---
  addNode({ id: "sw:norefund-warehouse", kind: "sidewalk", x: -33.85, z: noRefundNorthZ, street: "No Refund Road" });
  addNode({ id: "sw:norefund-lotcourt", kind: "sidewalk", x: -16.98, z: noRefundNorthZ, street: "No Refund Road" });
  addVerifiedEdge("sw:norefund-warehouse", "sw:norefund-lotcourt", "sidewalk", 2.2);
  addVerifiedEdge("sw:norefund-lotcourt", "sw:kirkwood-norefund", "sidewalk", 2.2);
  addVerifiedEdge(doorNodeId("reservoir.warehouse"), "sw:norefund-warehouse", "approach", 1.8);
  addVerifiedEdge(doorNodeId("reservoir.lot-court"), "sw:norefund-lotcourt", "approach", 1.8);

  // --- 6. Big Mouth Blvd north sidewalk (Boarded house, Water Tower, res-home-08/09) ---
  const bigMouthXs = [-58.5, -49.9, -39.0, -29.1];
  const bigMouthIds = bigMouthXs.map((x, idx) => {
    const id = `sw:bigmouth-n-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: bigMouthNorthZ, street: "Big Mouth Blvd" });
    return id;
  });
  for (let i = 0; i < bigMouthIds.length - 1; i++) {
    addVerifiedEdge(bigMouthIds[i]!, bigMouthIds[i + 1]!, "sidewalk", 2.2);
  }
  addVerifiedEdge(bigMouthIds[bigMouthIds.length - 1]!, "sw:kirkwood-bigmouth", "sidewalk", 2.2);
  addVerifiedEdge(homeNodeId("res-home-09"), "sw:bigmouth-n-3", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-08"), "sw:bigmouth-n-2", "approach", 1.6);
  addVerifiedEdge(doorNodeId("reservoir.boarded-house"), "sw:bigmouth-n-1", "approach", 1.8);
  addVerifiedEdge(doorNodeId("reservoir.water-tower"), "sw:bigmouth-n-0", "approach", 2.0);

  // --- 7. Dirty Money Dr north & south sidewalks (Laundry + res-home-10..16) ---
  const dirtyNorthXs = [-41.4, -30.5, -10.1, 0.0];
  const dirtyNorthIds = dirtyNorthXs.map((x, idx) => {
    const id = `sw:dirtymoney-n-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: dirtyMoneyNorthZ, street: "Dirty Money Dr" });
    return id;
  });
  for (let i = 0; i < dirtyNorthIds.length - 1; i++) {
    addVerifiedEdge(dirtyNorthIds[i]!, dirtyNorthIds[i + 1]!, "sidewalk", 2.2);
  }
  addVerifiedEdge(dirtyNorthIds[dirtyNorthIds.length - 1]!, "sw:kirkwood-dirtymoney-n", "sidewalk", 2.2);
  addVerifiedEdge(doorNodeId("reservoir.laundry"), "sw:dirtymoney-n-3", "approach", 1.8);
  addVerifiedEdge(homeNodeId("res-home-10"), "sw:dirtymoney-n-2", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-11"), "sw:dirtymoney-n-1", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-12"), "sw:dirtymoney-n-0", "approach", 1.6);

  const dirtySouthXs = [-47.1, -26.1, -7.2, -2.8];
  const dirtySouthIds = dirtySouthXs.map((x, idx) => {
    const id = `sw:dirtymoney-s-${idx}`;
    addNode({ id, kind: "sidewalk", x, z: dirtyMoneySouthZ, street: "Dirty Money Dr" });
    return id;
  });
  for (let i = 0; i < dirtySouthIds.length - 1; i++) {
    addVerifiedEdge(dirtySouthIds[i]!, dirtySouthIds[i + 1]!, "sidewalk", 2.2);
  }
  addVerifiedEdge(dirtySouthIds[dirtySouthIds.length - 1]!, "sw:kirkwood-dirtymoney-s", "sidewalk", 2.2);
  addVerifiedEdge(homeNodeId("res-home-13"), "sw:dirtymoney-s-2", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-14"), "sw:dirtymoney-s-3", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-15"), "sw:dirtymoney-s-1", "approach", 1.6);
  addVerifiedEdge(homeNodeId("res-home-16"), "sw:dirtymoney-s-0", "approach", 1.6);

  // Explicitly document missing / unverified geometry connections rather than fabricating them.
  missingConnections.push(
    `Scenery storefronts (${STOREFRONTS.map((s) => s.label).join(", ")}) have locationId=null and are excluded as gameplay destinations until promoted in cityMap.ts.`,
    "Baylor Ave (west-end N-S connector) is not yet authored in cityMap.ts; inter-street travel routes via Kirkwood St only.",
    "Back-lot alleys behind Lil Bit Lane and Dirty Money Dr are not included until Claude authors verified geometry in src/strip/navMap.ts.",
    "District portals to Southside / Eastside / Northside / Downtown are pending Claude's src/strip/navMap.ts.",
  );

  return {
    version: 1,
    hood: "reservoir",
    source: "derived-from-cityMap",
    nodes,
    edges,
    obstacles: WALLS,
    fences: FENCES,
    bounds: WALK_BOUNDS,
    missingConnections,
  };
}
