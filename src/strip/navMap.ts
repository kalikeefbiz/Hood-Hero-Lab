// Authored navigation graph for the Reservoir (Claude). The NPC simulation (src/sim, Gemini)
// walks this graph; the player controller doesn't need it. Built from cityMap.ts so it moves
// when the map moves.
//
// Shape: each street has sidewalk lines; Kirkwood St's west sidewalk (x 6) runs north-south and
// links them, crossing each road at a crosswalk. Every door, porch, NPC spot and gathering spot
// gets an approach edge to the point on its sidewalk straight in front of it. Every edge is
// checked against WALLS and FENCES (inflated by the NPC radius); one that fails is dropped and
// listed in `missingConnections`, never fabricated.
//
// Node ids follow the simulation's convention: door:<locationId | storefront id>,
// home:<res-home-NN>, spot:<characterId>, spot:<gathering id>, sw:<street>:<n>, cw:<name>.
import { WALLS, FENCES, WALK_BOUNDS, DOORS, HOUSES, STOREFRONTS, NPC_SPOTS, GATHERING_SPOTS, type Rect, type Segment } from "./cityMap";

// Structural copy of src/sim/types.ts NavMap (kept local so the map has no dependency on the sim).
export interface NavNode {
  id: string;
  kind: "sidewalk" | "crosswalk" | "door" | "porch" | "portal" | "spot";
  x: number; z: number;
  street?: string;
  locationId?: string | null;
  homeId?: string | null;
  facing?: number;
  radius?: number;
}
export interface NavEdge {
  from: string; to: string;
  kind: "sidewalk" | "crosswalk" | "approach" | "portal";
  cost: number; width: number;
  bidirectional?: boolean;
}
export interface NavMap {
  version: 1;
  hood: "reservoir";
  source: "authored-navMap";
  nodes: NavNode[];
  edges: NavEdge[];
  obstacles: Rect[];
  fences: Segment[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  missingConnections: string[];
}

/** NPC body radius the simulation collides with (src/sim NPC_COLLISION_RADIUS). Edges keep this clear. */
export const NAV_CLEARANCE = 0.42;
/** Longest straight sidewalk edge; longer runs get intermediate nodes so NPCs can pass and yield. */
const MAX_RUN = 8;

/** Kirkwood St west sidewalk, the north-south spine. */
const KIRKWOOD_X = 6.0;
/** Kirkwood St east sidewalk (only the house east of Kirkwood on Lil Bit Lane needs it). */
const KIRKWOOD_EAST_X = 15.3;

interface Line { id: string; street: string; axis: "x" | "z"; at: number; from: number; to: number }
/** Sidewalk centre lines (roads per docs/RESERVOIR_LAYOUT.md "Street grid as built"). */
const LINES: Line[] = [
  { id: "lilbit-n", street: "Lil Bit Lane", axis: "x", at: 2.2, from: -28.4, to: KIRKWOOD_X },
  { id: "lilbit-s", street: "Lil Bit Lane", axis: "x", at: 14.6, from: -25.9, to: KIRKWOOD_EAST_X },
  { id: "lilbit-se", street: "Lil Bit Lane", axis: "x", at: 14.6, from: KIRKWOOD_EAST_X, to: 21.6 },
  { id: "blocc-n", street: "Blocc Boy Blvd", axis: "x", at: 47.1, from: -22.6, to: KIRKWOOD_X },
  { id: "norefund-n", street: "No Refund Road", axis: "x", at: 91.6, from: -33.85, to: KIRKWOOD_X },
  { id: "bigmouth-n", street: "Big Mouth Blvd", axis: "x", at: -41.8, from: -60.2, to: KIRKWOOD_X },
  { id: "dirty-n", street: "Dirty Money Dr", axis: "x", at: -92.9, from: -41.4, to: KIRKWOOD_X },
  { id: "dirty-s", street: "Dirty Money Dr", axis: "x", at: -81.4, from: -47.1, to: KIRKWOOD_X },
  // Kirkwood St west sidewalk, split at each road so the road crossings are crosswalk edges.
  { id: "kirk-dirty-bigmouth", street: "Kirkwood St", axis: "z", at: KIRKWOOD_X, from: -81.4, to: -41.8 },
  { id: "kirk-bigmouth-lilbit", street: "Kirkwood St", axis: "z", at: KIRKWOOD_X, from: -30.0, to: 2.2 },
  { id: "kirk-lilbit-blocc", street: "Kirkwood St", axis: "z", at: KIRKWOOD_X, from: 14.6, to: 47.1 },
  { id: "kirk-blocc-norefund", street: "Kirkwood St", axis: "z", at: KIRKWOOD_X, from: 58.6, to: 91.6 },
];
/** Road crossings: [id, ax, az, bx, bz]. Ends land on sidewalk-line nodes. */
const CROSSWALKS: [string, number, number, number, number][] = [
  ["kirk-dirty", KIRKWOOD_X, -92.9, KIRKWOOD_X, -81.4],
  ["kirk-bigmouth", KIRKWOOD_X, -41.8, KIRKWOOD_X, -30.0],
  ["kirk-lilbit", KIRKWOOD_X, 2.2, KIRKWOOD_X, 14.6],
  ["kirk-blocc", KIRKWOOD_X, 47.1, KIRKWOOD_X, 58.6],
  ["lilbit-kirkwood-east", KIRKWOOD_X, 14.6, KIRKWOOD_EAST_X, 14.6],
  ["lilbit-mid", -13.6, 2.2, -13.6, 14.6],
  ["lilbit-west", -25.9, 2.2, -25.9, 14.6],
  ["dirty-west", -41.4, -92.9, -41.4, -81.4],
];

// ------------------------------------------------------------------ geometry checks
function segHitsRect(ax: number, az: number, bx: number, bz: number, w: Rect, pad: number) {
  const x0 = w.x0 - pad, x1 = w.x1 + pad, z0 = w.z0 - pad, z1 = w.z1 + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}
function segSegDist(ax: number, az: number, bx: number, bz: number, s: Segment) {
  const cross = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = cross(ax, az, bx, bz, s.ax, s.az), d2 = cross(ax, az, bx, bz, s.bx, s.bz);
  const d3 = cross(s.ax, s.az, s.bx, s.bz, ax, az), d4 = cross(s.ax, s.az, s.bx, s.bz, bx, bz);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  const pd = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => {
    const vx = rx - qx, vz = rz - qz, l = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((px - qx) * vx + (pz - qz) * vz) / l));
    return Math.hypot(px - (qx + vx * t), pz - (qz + vz * t));
  };
  return Math.min(pd(ax, az, s.ax, s.az, s.bx, s.bz), pd(bx, bz, s.ax, s.az, s.bx, s.bz), pd(s.ax, s.az, ax, az, bx, bz), pd(s.bx, s.bz, ax, az, bx, bz));
}
/** True if a body of radius `pad` walking a→b would touch a building or fence. */
export function edgeBlocked(ax: number, az: number, bx: number, bz: number, pad = NAV_CLEARANCE) {
  // Endpoints themselves may sit close to a wall (a porch); test the walked segment with a
  // slightly smaller pad at the ends by shrinking the segment 0.15 m each side.
  const len = Math.hypot(bx - ax, bz - az);
  const k = len > 0.4 ? 0.15 / len : 0;
  const sx = ax + (bx - ax) * k, sz = az + (bz - az) * k, ex = bx - (bx - ax) * k, ez = bz - (bz - az) * k;
  return WALLS.some((w) => segHitsRect(sx, sz, ex, ez, w, pad)) || FENCES.some((f) => segSegDist(sx, sz, ex, ez, f) < pad);
}

// ------------------------------------------------------------------ build
export function buildReservoirNavMap(): NavMap {
  const nodes: NavNode[] = [];
  const edges: NavEdge[] = [];
  const byId = new Map<string, NavNode>();
  const missing: string[] = [];
  const add = (n: NavNode) => { if (!byId.has(n.id)) { byId.set(n.id, n); nodes.push(n); } return byId.get(n.id)!; };
  const link = (a: NavNode, b: NavNode, kind: NavEdge["kind"], width: number) => {
    if (a.id === b.id) return;
    if (edgeBlocked(a.x, a.z, b.x, b.z)) { missing.push(`Blocked ${kind} edge dropped: ${a.id} -> ${b.id}`); return; }
    edges.push({ from: a.id, to: b.id, kind, cost: Math.hypot(b.x - a.x, b.z - a.z) * (kind === "crosswalk" ? 1.15 : 1), width, bidirectional: true });
  };

  // Destinations, and the sidewalk point in front of each.
  type Dest = { node: NavNode; line: Line };
  const dests: Dest[] = [];
  const lineFor = (x: number, z: number) => {
    let best: Line | null = null, bestD = 9;
    for (const l of LINES) {
      const along = l.axis === "x" ? x : z, across = l.axis === "x" ? z : x;
      if (along < l.from - 0.5 || along > l.to + 0.5) continue;
      const d = Math.abs(across - l.at);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  };
  const dest = (n: NavNode) => {
    const node = add(n);
    const line = lineFor(n.x, n.z);
    if (!line) { missing.push(`No sidewalk within 9 m of ${n.id}`); return; }
    dests.push({ node, line });
  };
  for (const d of DOORS) dest({ id: `door:${d.locationId}`, kind: "door", x: d.x, z: d.z, locationId: d.locationId, facing: d.facing, radius: d.radius });
  for (const s of STOREFRONTS) dest({ id: `door:${s.id}`, kind: "door", x: s.x, z: s.z, locationId: s.locationId, facing: s.facing, radius: s.radius });
  for (const h of HOUSES) dest({ id: `home:${h.id}`, kind: "porch", x: h.x, z: h.z, street: h.street, locationId: h.locationId, homeId: h.id, facing: h.facing, radius: h.radius });
  for (const s of NPC_SPOTS) dest({ id: `spot:${s.characterId}`, kind: "spot", x: s.x, z: s.z, locationId: s.locationId, facing: s.rotY, radius: 1.5 });
  for (const g of GATHERING_SPOTS) {
    // The court sideline is inside the fence: reach it from the court gate, not a sidewalk.
    if (g.id === "res-court-sideline") { add({ id: `spot:${g.id}`, kind: "spot", x: g.x, z: g.z, locationId: g.locationId, radius: g.radius }); continue; }
    dest({ id: `spot:${g.id}`, kind: "spot", x: g.x, z: g.z, locationId: g.locationId, radius: g.radius });
  }

  // Sidewalk lines: endpoints + each destination's foot point + crosswalk ends + subdivisions.
  const lineNodes = new Map<string, NavNode[]>();
  for (const l of LINES) {
    const stops = new Set<number>([l.from, l.to]);
    for (const d of dests) if (d.line === l) stops.add(Math.min(l.to, Math.max(l.from, l.axis === "x" ? d.node.x : d.node.z)));
    for (const [, ax, az, bx, bz] of CROSSWALKS) for (const [px, pz] of [[ax, az], [bx, bz]]) {
      const along = l.axis === "x" ? px : pz, across = l.axis === "x" ? pz : px;
      if (Math.abs(across - l.at) < 0.01 && along >= l.from - 0.01 && along <= l.to + 0.01) stops.add(along);
    }
    const sorted = [...stops].sort((a, b) => a - b);
    const full: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const gap = sorted[i] - sorted[i - 1];
        const n = Math.ceil(gap / MAX_RUN);
        for (let k = 1; k < n; k++) full.push(sorted[i - 1] + (gap * k) / n);
      }
      full.push(sorted[i]);
    }
    const ns = full
      .filter((v, i) => i === 0 || v - full[i - 1] > 0.05)
      .map((v) => {
        const x = l.axis === "x" ? v : l.at, z = l.axis === "x" ? l.at : v;
        // Shared corners (where lines meet) reuse one node.
        const key = `${x.toFixed(2)},${z.toFixed(2)}`;
        const existing = nodes.find((n) => n.kind === "sidewalk" && `${n.x.toFixed(2)},${n.z.toFixed(2)}` === key);
        return existing ?? add({ id: `sw:${l.id}:${key}`, kind: "sidewalk", x, z, street: l.street });
      });
    for (let i = 1; i < ns.length; i++) link(ns[i - 1], ns[i], "sidewalk", 2.2);
    lineNodes.set(l.id, ns);
  }
  const sidewalkAt = (x: number, z: number) =>
    nodes.find((n) => n.kind === "sidewalk" && Math.abs(n.x - x) < 0.02 && Math.abs(n.z - z) < 0.02);

  // Approaches: destination -> its foot point on the sidewalk.
  for (const d of dests) {
    const l = d.line;
    const along = Math.min(l.to, Math.max(l.from, l.axis === "x" ? d.node.x : d.node.z));
    const foot = l.axis === "x" ? sidewalkAt(along, l.at) : sidewalkAt(l.at, along);
    if (foot) link(d.node, foot, "approach", 1.4);
    else missing.push(`No sidewalk node in front of ${d.node.id}`);
  }
  // Court sideline: through the gate from the court door.
  const court = byId.get("door:reservoir.lot-court"), side = byId.get("spot:res-court-sideline");
  if (court && side) link(court, side, "approach", 3.0);

  // Crosswalks.
  for (const [id, ax, az, bx, bz] of CROSSWALKS) {
    const a = sidewalkAt(ax, az), b = sidewalkAt(bx, bz);
    if (!a || !b) { missing.push(`Crosswalk ${id} has no sidewalk at one end`); continue; }
    const mid = add({ id: `cw:${id}`, kind: "crosswalk", x: (ax + bx) / 2, z: (az + bz) / 2 });
    link(a, mid, "crosswalk", 2.4);
    link(mid, b, "crosswalk", 2.4);
  }

  missing.push(
    "No district portals yet: Southside, Eastside, Northside and Downtown are not built.",
    "No back alleys or Baylor Ave: the as-built Reservoir has neither; all north-south travel is Kirkwood St.",
  );
  return {
    version: 1,
    hood: "reservoir",
    source: "authored-navMap",
    nodes,
    edges,
    obstacles: WALLS,
    fences: FENCES,
    bounds: WALK_BOUNDS,
    missingConnections: missing,
  };
}

export const RESERVOIR_NAV_MAP: NavMap = buildReservoirNavMap();
