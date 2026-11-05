import { describe, expect, it } from "vitest";
import {
  ALL_BLOCKS,
  ALL_SECTIONS,
  DEVELOPMENT_LOTS,
  DISTRICTS,
  RAIL_CLEARANCE,
  RAIL_LINES,
  RAIL_STATIONS,
  SVG_SCALE,
  ZONE_ORDER,
  blockById,
  buildable,
  distanceToPath,
  distanceToRail,
  locationBlock,
  locationPosition,
  walkRoute,
} from "../city3d/layout";
import { LOCATIONS } from "../board/locations";

const area = (d: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  (d.maxX - d.minX) * (d.maxZ - d.minZ);
const insideBlock = (x: number, z: number, pad = 0.7) =>
  ALL_BLOCKS.some(
    (b) =>
      x > b.minX + pad && x < b.maxX - pad && z > b.minZ + pad && z < b.maxZ - pad,
  );

describe("expanded Stixx City", () => {
  it("covers 2.5x the land of the original board", () => {
    const now = ZONE_ORDER.reduce((sum, z) => sum + area(DISTRICTS[z]), 0);
    const before = now * (0.5 / SVG_SCALE) ** 2;
    expect(now / before).toBeGreaterThan(2.45);
    expect(now / before).toBeLessThan(2.55);
  });

  it("keeps sections inside their district and apart from each other", () => {
    for (const s of ALL_SECTIONS) {
      const d = DISTRICTS[s.zone];
      expect(s.minX).toBeGreaterThanOrEqual(d.minX - 0.01);
      expect(s.maxX).toBeLessThanOrEqual(d.maxX + 0.01);
      expect(s.minZ).toBeGreaterThanOrEqual(d.minZ - 0.01);
      expect(s.maxZ).toBeLessThanOrEqual(d.maxZ + 0.01);
    }
    for (const a of ALL_SECTIONS)
      for (const b of ALL_SECTIONS) {
        if (a === b) continue;
        const overlap =
          a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
        expect(overlap, `${a.zone}.${a.id} overlaps ${b.zone}.${b.id}`).toBe(false);
      }
  });

  it("keeps every building lot clear of the El", () => {
    for (const b of ALL_BLOCKS) {
      const u = buildable(b);
      const xs = [u.minX, (u.minX + u.maxX) / 2, u.maxX],
        zs = [u.minZ, (u.minZ + u.maxZ) / 2, u.maxZ];
      for (const x of xs)
        for (const z of zs)
          expect(distanceToRail(x, z), b.id).toBeGreaterThan(RAIL_CLEARANCE);
    }
  });

  it("puts every station on its line, with a way down to the street", () => {
    for (const st of RAIL_STATIONS) {
      const line = RAIL_LINES.find((l) => l.id === st.line)!;
      expect(distanceToPath(line.points, ...st.point), st.id).toBeLessThan(0.6);
    }
    const nawfAve = RAIL_STATIONS.find((s) => s.id === "nawf-ave")!;
    const place = LOCATIONS.find((l) => l.id === "nawf.el-station")!;
    expect(locationPosition(place)).toEqual(nawfAve.front);
    expect(insideBlock(...nawfAve.front, 0)).toBe(true);
  });

  it("keeps the development lots empty and real", () => {
    const ids = new Set<string>(),
      blocks = new Set<string>();
    const taken = new Set(LOCATIONS.map((l) => locationBlock(l)!.id));
    for (const lot of DEVELOPMENT_LOTS) {
      expect(ids.has(lot.id)).toBe(false);
      expect(blocks.has(lot.block)).toBe(false);
      ids.add(lot.id);
      blocks.add(lot.block);
      const b = blockById(lot.block);
      expect(b, lot.id).toBeDefined();
      expect(b!.waterfront).toBe(false);
      expect(lot.id.startsWith(`${b!.zone}.`)).toBe(true);
      expect(taken.has(lot.block), `${lot.id} is already used`).toBe(false);
    }
    for (const z of ZONE_ORDER)
      expect(DEVELOPMENT_LOTS.filter((l) => l.id.startsWith(`${z}.`)).length).toBeGreaterThanOrEqual(2);
  });

  it("places a new location on a lot when it names one", () => {
    const lot = DEVELOPMENT_LOTS[0];
    const b = blockById(lot.block)!;
    const [x, z] = locationPosition({ zone: b.zone, at: [0, 0], lot: lot.id });
    expect(locationBlock({ zone: b.zone, at: [0, 0], lot: lot.id })?.id).toBe(b.id);
    expect(x).toBeCloseTo((b.minX + b.maxX) / 2);
    expect(z).toBeCloseTo((b.minZ + b.maxZ) / 2);
  });

  it("walks between places along streets, never through buildings", () => {
    const fronts = LOCATIONS.filter((_, i) => i % 3 === 0).map((l) => {
      const [x] = locationPosition(l);
      const b = locationBlock(l)!;
      return [x, b.maxZ + 1.3] as [number, number];
    });
    for (let i = 0; i < fronts.length; i++)
      for (let j = i + 1; j < fronts.length; j += 4) {
        const route = walkRoute(fronts[i], fronts[j]);
        for (let k = 1; k < route.length; k++) {
          const [ax, az] = route[k - 1],
            [bx, bz] = route[k];
          const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
          for (let t = 0; t <= n; t++) {
            const x = ax + ((bx - ax) * t) / n,
              z = az + ((bz - az) * t) / n;
            expect(insideBlock(x, z, 1.2), `route ${i}->${j} at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
          }
        }
      }
  });
});
