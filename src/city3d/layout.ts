import type { ZoneId } from "../core/GameState";
import type { LocationDef } from "../board/locations";

// World layout for the 3D city board. It deliberately mirrors the existing
// 2D CityMap (420 × 390 SVG units) so both views describe the same Stixx City:
// The Nawf north, The Reservoir west, Downtown centre, Rio Gabriel east and
// Southside south, with the river winding from the southwest to the northeast.
// The 3D city is 1.58x the 2D map in each direction: 2.5x the land area.
export const SVG_SCALE = 0.79;
export const toWorld = (x: number, y: number): [number, number] => [
  (x - 210) * SVG_SCALE,
  (y - 195) * SVG_SCALE,
];

export interface DistrictRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const rect = (x: number, y: number, w: number, h: number): DistrictRect => {
  const [minX, minZ] = toWorld(x, y),
    [maxX, maxZ] = toWorld(x + w, y + h);
  return { minX, maxX, minZ, maxZ };
};
// Same rectangles as CityMap.tsx.
export const DISTRICTS: Record<ZoneId, DistrictRect> = {
  nawf: rect(120, 12, 170, 88),
  reservoir: rect(12, 122, 135, 130),
  downtown: rect(160, 122, 100, 130),
  rio: rect(273, 122, 135, 130),
  south: rect(120, 274, 170, 100),
};
export const ZONE_ORDER: ZoneId[] = [
  "nawf",
  "reservoir",
  "downtown",
  "rio",
  "south",
];
export const districtCenter = (z: ZoneId): [number, number] => {
  const d = DISTRICTS[z];
  return [(d.minX + d.maxX) / 2, (d.minZ + d.maxZ) / 2];
};
export const zoneAt = (x: number, z: number): ZoneId | null => {
  for (const s of ALL_SECTIONS)
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.zone;
  return null;
};

// The CityMap river path, M5 320 C85 290 25 180 90 130 S290 170 330 70
// S400 50 419 0, expanded into explicit cubic segments.
const RIVER_SEGMENTS: [number, number][][] = [
  [
    [5, 320],
    [85, 290],
    [25, 180],
    [90, 130],
  ],
  [
    [90, 130],
    [155, 80],
    [290, 170],
    [330, 70],
  ],
  [
    [330, 70],
    [370, -30],
    [400, 50],
    [419, 0],
  ],
];
export const RIVER_WIDTH = 8;
// The expanded districts no longer leave the old CityMap curve a gap through
// the Reservoir, so its western reach is redrawn in world space: up the far
// side of the Reservoir and east along the channel under the Nawf.
const WEST_RIVER: [number, number][][] = [
  [
    [-225, 150],
    [-176, 118],
    [-168, 60],
    [-167, -40],
  ],
  [
    [-167, -40],
    [-167, -67],
    [-167, -67],
    [-112, -67],
  ],
];
const CHANNEL_Z = -67;
const bezier = (seg: [number, number][], t: number): [number, number] => {
  const [p0, p1, p2, p3] = seg,
    u = 1 - t;
  return [0, 1].map(
    (k) =>
      u * u * u * p0[k] +
      3 * u * u * t * p1[k] +
      3 * u * t * t * p2[k] +
      t * t * t * p3[k],
  ) as [number, number];
};
export function riverPath(samplesPerSegment = 28): [number, number][] {
  const out: [number, number][] = [];
  for (const seg of WEST_RIVER)
    for (let i = out.length ? 1 : 0; i <= samplesPerSegment; i++)
      out.push(bezier(seg, i / samplesPerSegment));
  // Straight down the channel between the Nawf and the middle row, then the
  // old curve takes over north-east of Downtown.
  const east = DISTRICTS.downtown.maxX + 18;
  for (let x = -100; x < east; x += 12) out.push([x, CHANNEL_Z]);
  for (const seg of RIVER_SEGMENTS)
    for (let i = 0; i <= samplesPerSegment; i++) {
      const w = toWorld(...bezier(seg, i / samplesPerSegment));
      if (w[0] > east) out.push(w);
    }
  out.push(toWorld(470, -60));
  return out;
}
export function distanceToPath(path: [number, number][], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i],
      [bx, bz] = path[i + 1];
    const dx = bx - ax,
      dz = bz - az,
      len = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len));
    const px = ax + t * dx - x,
      pz = az + t * dz - z;
    best = Math.min(best, Math.sqrt(px * px + pz * pz));
  }
  return best;
}

// Avenues follow the 2D map's dividing lines.
export const AVENUES_X = [toWorld(153, 0)[0], toWorld(267, 0)[0]];
export const AVENUES_Z = [toWorld(0, 110)[1], toWorld(0, 264)[1]];

// Block grid, shared by the renderer, the board UI and tests.
export const STREET = 3.2;
export const DISTRICT_INSET = 1.2;

/**
 * What a block is for. The renderer fills each kind differently, which is
 * what gives each part of a neighborhood its own density and character.
 */
export type BlockKind =
  | "dense"
  | "rowhouse"
  | "projects"
  | "suburban"
  | "commercial"
  | "industrial"
  | "civic"
  | "highrise"
  | "lowrise";

/**
 * A neighborhood is several sections, each with its own block size and kind.
 * Sections are given as fractions of the district's bounding box; the gaps
 * between them are streets and boulevards (some carry the El), and corners
 * left uncovered give each district an irregular outline.
 */
export interface SectionDef {
  id: string;
  at: [number, number, number, number];
  block: number;
  kind: BlockKind;
  street?: number;
}
export const SECTIONS: Record<ZoneId, SectionDef[]> = {
  // Blips west of the boulevard, Mudgang east; the El runs across the middle
  // and down three streets.
  nawf: [
    { id: "nw", at: [0.04, 0, 0.48, 0.4], block: 11, kind: "dense" },
    { id: "ne", at: [0.52, 0, 0.97, 0.4], block: 11, kind: "dense" },
    { id: "wedge", at: [0, 0.5, 0.171, 1], block: 10, kind: "rowhouse" },
    { id: "w", at: [0.223, 0.5, 0.503, 1], block: 10, kind: "rowhouse" },
    { id: "e", at: [0.555, 0.5, 0.835, 0.82], block: 14, kind: "projects" },
    { id: "strip", at: [0.555, 0.86, 0.835, 1], block: 8, kind: "commercial" },
    { id: "edge", at: [0.887, 0.5, 1, 1], block: 10, kind: "dense" },
  ],
  // Big suburban lots, a commercial strip and a warehouse edge.
  reservoir: [
    { id: "n", at: [0, 0, 0.6, 0.42], block: 15, kind: "suburban" },
    { id: "strip", at: [0.65, 0, 1, 0.22], block: 8, kind: "commercial" },
    { id: "e", at: [0.65, 0.27, 1, 0.62], block: 13, kind: "suburban" },
    { id: "s", at: [0.05, 0.48, 0.6, 1], block: 15, kind: "suburban" },
    { id: "yards", at: [0.65, 0.68, 1, 1], block: 16, kind: "industrial" },
  ],
  // Towers north, government south-west, the interchange in the middle and
  // the port at the bottom.
  downtown: [
    { id: "nw", at: [0, 0, 0.4557, 0.46], block: 10, kind: "highrise" },
    { id: "ne", at: [0.5443, 0, 1, 0.46], block: 10, kind: "highrise" },
    { id: "civic", at: [0, 0.53, 0.4557, 1], block: 14, kind: "civic" },
    { id: "se", at: [0.5443, 0.53, 1, 0.84], block: 10, kind: "highrise" },
    { id: "port", at: [0.5443, 0.88, 1, 1], block: 11, kind: "industrial" },
  ],
  // Low and spread out, with a commercial corridor on both sides of the
  // boulevard.
  rio: [
    { id: "n", at: [0, 0, 1, 0.42], block: 12, kind: "lowrise" },
    { id: "corridor-n", at: [0, 0.46, 1, 0.54], block: 8, kind: "commercial" },
    { id: "corridor-s", at: [0, 0.6, 1, 0.68], block: 8, kind: "commercial" },
    { id: "s", at: [0.04, 0.72, 0.95, 1], block: 12, kind: "lowrise" },
  ],
  // Project superblocks, rowhouse side streets and the rail yards.
  south: [
    { id: "projects", at: [0, 0, 0.503, 0.55], block: 15, kind: "projects" },
    { id: "e", at: [0.555, 0, 1, 0.42], block: 10, kind: "rowhouse" },
    { id: "yards", at: [0.555, 0.47, 1, 1], block: 14, kind: "industrial" },
    { id: "sw", at: [0.03, 0.6, 0.503, 1], block: 10, kind: "dense" },
  ],
};

export interface BlockDef {
  /** Stable id, e.g. "south.projects.b1-0" (section, column-row). */
  id: string;
  zone: ZoneId;
  section: string;
  kind: BlockKind;
  col: number;
  row: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** True when the river runs through it (promenade / docks, no buildings). */
  waterfront: boolean;
}
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const RIVER = riverPath();
export function sectionRect(zone: ZoneId, s: SectionDef): Rect {
  const d = DISTRICTS[zone],
    W = d.maxX - d.minX,
    D = d.maxZ - d.minZ;
  return {
    minX: d.minX + W * s.at[0],
    maxX: d.minX + W * s.at[2],
    minZ: d.minZ + D * s.at[1],
    maxZ: d.minZ + D * s.at[3],
  };
}
/** Street centrelines, as segments, for lamps and routes. */
export interface StreetLine {
  axis: "x" | "z";
  /** The fixed coordinate (x for axis "x", z for axis "z"). */
  at: number;
  from: number;
  to: number;
}
export function districtGrid(zone: ZoneId) {
  const blocks: BlockDef[] = [];
  const lines: StreetLine[] = [];
  const sections: (SectionDef & Rect)[] = [];
  for (const s of SECTIONS[zone]) {
    const r = sectionRect(zone, s);
    sections.push({ ...s, ...r });
    const street = s.street ?? STREET;
    const W = r.maxX - r.minX - DISTRICT_INSET * 2,
      D = r.maxZ - r.minZ - DISTRICT_INSET * 2;
    const nx = Math.max(1, Math.round((W + street) / (s.block + street))),
      nz = Math.max(1, Math.round((D + street) / (s.block + street)));
    const bw = (W - (nx - 1) * street) / nx,
      bd = (D - (nz - 1) * street) / nz;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const minX = r.minX + DISTRICT_INSET + i * (bw + street),
          minZ = r.minZ + DISTRICT_INSET + j * (bd + street);
        const cx = minX + bw / 2,
          cz = minZ + bd / 2;
        blocks.push({
          id: `${zone}.${s.id}.b${i}-${j}`,
          zone,
          section: s.id,
          kind: s.kind,
          col: i,
          row: j,
          minX,
          maxX: minX + bw,
          minZ,
          maxZ: minZ + bd,
          waterfront:
            distanceToPath(RIVER, cx, cz) <
            RIVER_WIDTH / 2 + Math.max(bw, bd) * 0.42,
        });
      }
    for (let i = 1; i < nx; i++)
      lines.push({
        axis: "x",
        at: r.minX + DISTRICT_INSET + i * bw + (i - 0.5) * street,
        from: r.minZ,
        to: r.maxZ,
      });
    for (let j = 1; j < nz; j++)
      lines.push({
        axis: "z",
        at: r.minZ + DISTRICT_INSET + j * bd + (j - 0.5) * street,
        from: r.minX,
        to: r.maxX,
      });
  }
  return { blocks, sections, lines };
}
export const ALL_BLOCKS: BlockDef[] = (
  ["nawf", "reservoir", "downtown", "rio", "south"] as ZoneId[]
).flatMap((z) => districtGrid(z).blocks);
export const ALL_SECTIONS = (
  ["nawf", "reservoir", "downtown", "rio", "south"] as ZoneId[]
).flatMap((z) => districtGrid(z).sections.map((s) => ({ ...s, zone: z })));
export const blockAt = (x: number, z: number) =>
  ALL_BLOCKS.find(
    (b) =>
      x >= b.minX - 1.6 &&
      x <= b.maxX + 1.6 &&
      z >= b.minZ - 1.6 &&
      z <= b.maxZ + 1.6,
  ) ?? null;
export const blockById = (id: string) => ALL_BLOCKS.find((b) => b.id === id);
/** Board bounds: the districts plus a margin of city around them. */
export const BOARD = (() => {
  const all = ZONE_ORDER.map((z) => DISTRICTS[z]);
  return {
    minX: Math.min(...all.map((d) => d.minX)) - 12,
    maxX: Math.max(...all.map((d) => d.maxX)) + 12,
    minZ: Math.min(...all.map((d) => d.minZ)) - 12,
    maxZ: Math.max(...all.map((d) => d.maxZ)) + 12,
  };
})();

// ---- The elevated rail ---------------------------------------------------------
// The El runs over streets wide enough to carry it: the Nawf's middle street,
// the arterials between Downtown and its neighbors, and the central street
// through Downtown into Southside. Its supports stand on sidewalks; buildings
// keep clear of RAIL_CLEARANCE either side of the track.
export const RAIL_DECK = 5.2;
export const RAIL_CLEARANCE = 2.4;
export interface RailLine {
  id: string;
  name: string;
  /** Centreline, corners rounded so trains turn smoothly. */
  points: [number, number][];
  /** Older steel (the Southside branch). */
  old?: boolean;
}
export interface RailStation {
  id: string;
  name: string;
  line: string;
  point: [number, number];
  /** Direction of the track at the station (radians, atan2(dz, dx)). */
  heading: number;
  /** Sidewalk point in front of the station, where a place can stand. */
  front: [number, number];
}
const sectionAt = (zone: ZoneId, id: string) =>
  sectionRect(zone, SECTIONS[zone].find((s) => s.id === id)!);
const NAWF_RAIL_Z =
  (sectionAt("nawf", "nw").maxZ + sectionAt("nawf", "w").minZ) / 2;
const WEST_RAIL_X = (DISTRICTS.reservoir.maxX + DISTRICTS.downtown.minX) / 2;
const EAST_RAIL_X = (DISTRICTS.downtown.maxX + DISTRICTS.rio.minX) / 2;
const CENTRE_RAIL_X =
  (sectionAt("downtown", "nw").maxX + sectionAt("downtown", "ne").minX) / 2;
const HUB_Z =
  (sectionAt("downtown", "nw").maxZ + sectionAt("downtown", "civic").minZ) / 2;
const YARD_END_Z = sectionAt("south", "projects").maxZ - 2;
const EDGE_STATION_Z = -14;

function rounded(points: [number, number][], radius = 6): [number, number][] {
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, pz] = points[i - 1],
      [cx, cz] = points[i],
      [nx, nz] = points[i + 1];
    const a = Math.hypot(cx - px, cz - pz),
      b = Math.hypot(nx - cx, nz - cz);
    const r = Math.min(radius, a / 2, b / 2);
    const ax = cx + ((px - cx) / a) * r,
      az = cz + ((pz - cz) / a) * r,
      bx = cx + ((nx - cx) / b) * r,
      bz = cz + ((nz - cz) / b) * r;
    for (let t = 0; t <= 1.0001; t += 1 / 6) {
      const u = 1 - t;
      out.push([
        u * u * ax + 2 * u * t * cx + t * t * bx,
        u * u * az + 2 * u * t * cz + t * t * bz,
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
export const RAIL_LINES: RailLine[] = [
  {
    id: "el",
    name: "The El",
    points: rounded([
      [WEST_RAIL_X, EDGE_STATION_Z + 8],
      [WEST_RAIL_X, NAWF_RAIL_Z],
      [EAST_RAIL_X, NAWF_RAIL_Z],
      [EAST_RAIL_X, EDGE_STATION_Z + 8],
    ]),
  },
  {
    id: "south",
    name: "Southside Line",
    points: [
      [CENTRE_RAIL_X, NAWF_RAIL_Z],
      [CENTRE_RAIL_X, YARD_END_Z],
    ],
    old: true,
  },
];
export const distanceToRail = (x: number, z: number) =>
  Math.min(...RAIL_LINES.map((l) => distanceToPath(l.points, x, z)));
/** Sidewalk band kept free next to the El for its supports. */
export const RAIL_SETBACK = 1.2;
/**
 * The part of a block buildings may use: blocks along the El give up a strip
 * on the track side so the supports stand on open sidewalk.
 */
export function buildable<T extends Rect>(b: T): T {
  const near = (x: number, z: number) =>
    distanceToRail(x, z) < RAIL_CLEARANCE + 2.6;
  const cx = (b.minX + b.maxX) / 2,
    cz = (b.minZ + b.maxZ) / 2;
  return {
    ...b,
    minX: near(b.minX, cz) ? b.minX + RAIL_SETBACK : b.minX,
    maxX: near(b.maxX, cz) ? b.maxX - RAIL_SETBACK : b.maxX,
    minZ: near(cx, b.minZ) ? b.minZ + RAIL_SETBACK : b.minZ,
    maxZ: near(cx, b.maxZ) ? b.maxZ - RAIL_SETBACK : b.maxZ,
  };
}

function stationFront(
  [x, z]: [number, number],
  heading: number,
  prefer: 1 | -1,
): [number, number] {
  // Walk out sideways from the track until we stand inside a block.
  const nx = -Math.sin(heading),
    nz = Math.cos(heading);
  for (const side of [prefer, -prefer])
    for (let d = 3; d < 12; d += 0.5) {
      const px = x + nx * d * side,
        pz = z + nz * d * side;
      const b = ALL_BLOCKS.find(
        (b) =>
          !b.waterfront &&
          px >= b.minX + 1.2 &&
          px <= b.maxX - 1.2 &&
          pz >= b.minZ + 1.2 &&
          pz <= b.maxZ - 1.2,
      );
      if (b) return [px, pz];
    }
  return [x, z];
}
const station = (
  id: string,
  name: string,
  line: string,
  point: [number, number],
  heading: number,
  prefer: 1 | -1 = 1,
): RailStation => ({
  id,
  name,
  line,
  point,
  heading,
  front: stationFront(point, heading, prefer),
});
const NORTH = -Math.PI / 2,
  EAST = 0;
export const RAIL_STATIONS: RailStation[] = [
  station("westside", "Westside", "el", [WEST_RAIL_X, EDGE_STATION_Z], NORTH, -1),
  station("nawf-ave", "Nawf Ave", "el", [-20, NAWF_RAIL_Z], EAST, 1),
  station("rio", "Rio Gabriel", "el", [EAST_RAIL_X, EDGE_STATION_Z], NORTH, -1),
  station("central", "Stixx Central", "south", [CENTRE_RAIL_X, HUB_Z], NORTH, -1),
  station("yards", "Southside Yards", "south", [CENTRE_RAIL_X, YARD_END_Z - 4], NORTH),
];

// ---- Development lots ------------------------------------------------------------
/**
 * Named empty blocks held for future places: a new business, a hangout, a
 * story location. Give a LocationDef `lot: "<id>"` and it stands there; the
 * board shows an unclaimed lot until then. Chosen to spread new content into
 * the expanded parts of each district.
 */
export interface DevelopmentLot {
  id: string;
  block: string;
  area: string;
}
export const DEVELOPMENT_LOTS: DevelopmentLot[] = [
  { id: "nawf.lot-1", block: "nawf.ne.b3-0", area: "Mudgang side, north edge" },
  { id: "nawf.lot-2", block: "nawf.ne.b0-0", area: "Mudgang side, by the boulevard" },
  { id: "nawf.lot-3", block: "nawf.nw.b1-0", area: "Blips side, north edge" },
  { id: "reservoir.lot-1", block: "reservoir.s.b2-2", area: "South suburbs" },
  { id: "reservoir.lot-2", block: "reservoir.n.b2-0", area: "North suburbs, by the river" },
  { id: "reservoir.lot-3", block: "reservoir.s.b2-0", area: "South suburbs, by the river" },
  { id: "downtown.lot-1", block: "downtown.se.b2-0", area: "East towers" },
  { id: "downtown.lot-2", block: "downtown.ne.b2-1", area: "Northeast towers" },
  { id: "downtown.lot-3", block: "downtown.nw.b0-0", area: "Northwest towers" },
  { id: "rio.lot-1", block: "rio.n.b0-0", area: "North side, west end" },
  { id: "rio.lot-2", block: "rio.n.b3-0", area: "North side" },
  { id: "rio.lot-3", block: "rio.n.b6-0", area: "North side, east end" },
  { id: "south.lot-1", block: "south.yards.b3-1", area: "Rail yards" },
  { id: "south.lot-2", block: "south.projects.b0-1", area: "West projects" },
  { id: "south.lot-3", block: "south.yards.b1-0", area: "Rail yards, by the line" },
];
export const lotBlocks = new Set(DEVELOPMENT_LOTS.map((l) => l.block));

/**
 * Where a place stands. Places keep a relative position inside their
 * district (`at`); in the expanded city that point is snapped into the
 * nearest real block, so a place never lands in a street, a gap between
 * sections or the rail corridor. A place on the El takes its station's spot.
 */
const positionCache = new Map<string, [number, number]>();
const blockCache = new Map<string, BlockDef | null>();
type PlaceRef = Pick<LocationDef, "zone" | "at"> & {
  railStation?: string;
  lot?: string;
};
// Place definitions are long-lived objects, so most lookups hit the WeakMap and
// skip building a string key; ad-hoc refs still share the string cache.
const refKeys = new WeakMap<PlaceRef, string>();
const placeKey = (l: PlaceRef) => {
  let k = refKeys.get(l);
  if (k === undefined) {
    k = `${l.zone}:${l.at[0]}:${l.at[1]}:${l.railStation ?? ""}:${l.lot ?? ""}`;
    refKeys.set(l, k);
  }
  return k;
};
export const locationPosition = (l: PlaceRef): [number, number] => {
  // Places never move; the game asks for them thousands of times a day.
  const key = placeKey(l);
  const hit = positionCache.get(key);
  if (hit) return hit;
  const p = computePosition(l);
  positionCache.set(key, p);
  return p;
};
function computePosition(l: PlaceRef): [number, number] {
  const lot = l.lot ? DEVELOPMENT_LOTS.find((d) => d.id === l.lot) : null;
  const lb = lot ? blockById(lot.block) : null;
  if (lb) return [(lb.minX + lb.maxX) / 2, (lb.minZ + lb.maxZ) / 2];
  const st = l.railStation
    ? RAIL_STATIONS.find((r) => r.id === l.railStation)
    : null;
  if (st) return st.front;
  const d = DISTRICTS[l.zone];
  const x = d.minX + (d.maxX - d.minX) * l.at[0],
    z = d.minZ + (d.maxZ - d.minZ) * l.at[1];
  const blocks = ALL_BLOCKS.filter((b) => b.zone === l.zone && !b.waterfront);
  let best: BlockDef | null = null,
    bestD = Infinity;
  for (const b of blocks) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX),
      dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    const dist = Math.hypot(dx, dz);
    if (dist < bestD) [best, bestD] = [b, dist];
  }
  if (!best || bestD === 0) return [x, z];
  const pad = 1.2;
  return [
    Math.min(Math.max(x, best.minX + pad), best.maxX - pad),
    Math.min(Math.max(z, best.minZ + pad), best.maxZ - pad),
  ];
}
export const locationBlock = (l: PlaceRef) => {
  const key = placeKey(l);
  if (blockCache.has(key)) return blockCache.get(key)!;
  const [x, z] = locationPosition(l);
  const b = blockAt(x, z);
  blockCache.set(key, b);
  return b;
};


// ---- Walking routes --------------------------------------------------------------
// Characters walk the streets: a coarse grid marks blocks (and the river, away
// from bridges) as solid, a breadth-first search finds the way, and the path
// is straightened wherever there is a clear line of sight.
const CELL = 1;
let walkGrid: { x0: number; z0: number; nx: number; nz: number; open: Uint8Array } | null = null;
function grid() {
  if (walkGrid) return walkGrid;
  const x0 = BOARD.minX,
    z0 = BOARD.minZ;
  const nx = Math.ceil((BOARD.maxX - x0) / CELL),
    nz = Math.ceil((BOARD.maxZ - z0) / CELL);
  const open = new Uint8Array(nx * nz).fill(1);
  for (const b of ALL_BLOCKS) {
    // A cell is solid when its centre is on the block past the curb.
    const i0 = Math.ceil((b.minX + 0.25 - x0) / CELL - 0.5),
      i1 = Math.floor((b.maxX - 0.25 - x0) / CELL - 0.5),
      j0 = Math.ceil((b.minZ + 0.25 - z0) / CELL - 0.5),
      j1 = Math.floor((b.maxZ - 0.25 - z0) / CELL - 0.5);
    for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++)
      for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++)
        open[j * nx + i] = 0;
  }
  const bridges = [...AVENUES_X.map((v) => ["x", v] as const), ...AVENUES_Z.map((v) => ["z", v] as const)];
  // Only cells near a river segment can be water: visiting just each
  // segment's box keeps the first walk from stalling the phone (the full-board
  // scan took ~0.6 s on a desktop).
  const reach = RIVER_WIDTH / 2 + 0.5;
  for (let s = 0; s < RIVER.length - 1; s++) {
    const seg = [RIVER[s], RIVER[s + 1]];
    const i0 = Math.max(0, Math.floor((Math.min(seg[0][0], seg[1][0]) - reach - x0) / CELL)),
      i1 = Math.min(nx - 1, Math.ceil((Math.max(seg[0][0], seg[1][0]) + reach - x0) / CELL)),
      j0 = Math.max(0, Math.floor((Math.min(seg[0][1], seg[1][1]) - reach - z0) / CELL)),
      j1 = Math.min(nz - 1, Math.ceil((Math.max(seg[0][1], seg[1][1]) + reach - z0) / CELL));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = j * nx + i;
        if (!open[k]) continue;
        const x = x0 + (i + 0.5) * CELL,
          z = z0 + (j + 0.5) * CELL;
        if (distanceToPath(seg, x, z) > reach) continue;
        const onBridge = bridges.some(([axis, v]) =>
          Math.abs((axis === "x" ? x : z) - v) < 2.5,
        );
        if (!onBridge) open[k] = 0;
      }
  }
  walkGrid = { x0, z0, nx, nz, open };
  return walkGrid;
}
function cellOf(x: number, z: number) {
  const g = grid();
  return [
    Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / CELL))),
    Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.z0) / CELL))),
  ] as const;
}
function nearestOpen(i: number, j: number): [number, number] {
  const g = grid();
  if (g.open[j * g.nx + i]) return [i, j];
  for (let r = 1; r < 30; r++)
    for (let di = -r; di <= r; di++)
      for (const dj of [-r, r]) {
        for (const [a, b] of [
          [i + di, j + dj],
          [i + dj, j + di],
        ]) {
          if (a < 0 || b < 0 || a >= g.nx || b >= g.nz) continue;
          if (g.open[b * g.nx + a]) return [a, b];
        }
      }
  return [i, j];
}
function clear(a: [number, number], b: [number, number]) {
  const g = grid();
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const i = Math.round(a[0] + (b[0] - a[0]) * t),
      j = Math.round(a[1] + (b[1] - a[1]) * t);
    if (!g.open[j * g.nx + i]) return false;
  }
  return true;
}
/**
 * A street route between two points, as world-space waypoints (start and end
 * included). Falls back to a straight line if no route exists.
 */
export function walkRoute(
  from: [number, number],
  to: [number, number],
): [number, number][] {
  const g = grid();
  const s = nearestOpen(...cellOf(...from)),
    e = nearestOpen(...cellOf(...to));
  const prev = new Int32Array(g.nx * g.nz).fill(-1);
  const start = s[1] * g.nx + s[0],
    goal = e[1] * g.nx + e[0];
  const queue = new Int32Array(g.nx * g.nz);
  let head = 0,
    tail = 0;
  queue[tail++] = start;
  prev[start] = start;
  while (head < tail) {
    const c = queue[head++];
    if (c === goal) break;
    const ci = c % g.nx,
      cj = (c - ci) / g.nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = ci + di,
        nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
      const n = nj * g.nx + ni;
      if (prev[n] !== -1 || !g.open[n]) continue;
      prev[n] = c;
      queue[tail++] = n;
    }
  }
  if (prev[goal] === -1) return [from, to];
  const cells: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) {
    const ci = c % g.nx;
    cells.push([ci, (c - ci) / g.nx]);
    if (c === start) break;
  }
  cells.reverse();
  // Straighten: keep a waypoint only where the line of sight breaks.
  const keep: [number, number][] = [cells[0]];
  let anchor = 0;
  for (let k = 2; k < cells.length; k++)
    if (!clear(cells[anchor], cells[k])) {
      keep.push(cells[k - 1]);
      anchor = k - 1;
    }
  keep.push(cells[cells.length - 1]);
  const world = keep.map(
    ([i, j]) => [g.x0 + (i + 0.5) * CELL, g.z0 + (j + 0.5) * CELL] as [number, number],
  );
  return [from, ...world.slice(1, -1), to];
}
