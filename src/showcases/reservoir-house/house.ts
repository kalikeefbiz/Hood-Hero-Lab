import * as THREE from "three";
import colorUrl from "./textures/color.webp?url";
import normalUrl from "./textures/normal.webp?url";
import ormUrl from "./textures/orm.webp?url";

type Point = [number, number, number];
type UV = [number, number, number, number];
type Frame = (u: number, y: number, depth: number) => Point;

export const tile = {
  siding: 0,
  trim: 1,
  shingle: 2,
  steel: 3,
  concrete: 4,
  brick: 5,
  soil: 6,
  cloth: 7,
};
const white = new THREE.Color(0xffffff);
const fullTile: UV = [0, 0, 1, 1];

export function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// All batches use one UV set. TEXCOORD_1 mirrors it for normal Three.js AO
// and for loaders that bind glTF occlusion to a separate coordinate set.
export class SurfaceBatch {
  private positions: number[] = [];
  private indices: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];

  quad(
    points: [Point, Point, Point, Point],
    materialTile = 0,
    tint = white,
    rect = fullTile,
  ) {
    const start = this.positions.length / 3;
    const tileX = materialTile % 4;
    const tileY = Math.floor(materialTile / 4);
    const [u0, v0, u1, v1] = rect;
    const uv = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    points.forEach(([x, y, z], i) => {
      const [u, v] = uv[i];
      this.positions.push(x, y, z);
      this.colors.push(
        Math.min(1, tint.r),
        Math.min(1, tint.g),
        Math.min(1, tint.b),
      );
      this.uvs.push(
        (tileX + (8 + 496 * u) / 512) / 4,
        1 - (tileY + (504 - 496 * v) / 512) / 2,
      );
    });
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  box(
    frame: Frame,
    u: number,
    y: number,
    depth: number,
    w: number,
    h: number,
    d: number,
    materialTile = 0,
    tint = white,
    rect = fullTile,
    verticalGrain = false,
  ) {
    const a = u - w / 2,
      b = u + w / 2,
      lo = y - h / 2,
      hi = y + h / 2;
    const back = depth - d / 2,
      front = depth + d / 2;
    const q = (points: [Point, Point, Point, Point], upright = false) => {
      if (upright && verticalGrain) points.push(points.shift()!);
      this.quad(
        points.map(([x, z, p]) => frame(x, z, p)) as typeof points,
        materialTile,
        tint,
        rect,
      );
    };
    q(
      [
        [a, lo, front],
        [b, lo, front],
        [b, hi, front],
        [a, hi, front],
      ],
      true,
    );
    q(
      [
        [b, lo, back],
        [a, lo, back],
        [a, hi, back],
        [b, hi, back],
      ],
      true,
    );
    q(
      [
        [b, lo, front],
        [b, lo, back],
        [b, hi, back],
        [b, hi, front],
      ],
      true,
    );
    q(
      [
        [a, lo, back],
        [a, lo, front],
        [a, hi, front],
        [a, hi, back],
      ],
      true,
    );
    q([
      [a, hi, front],
      [b, hi, front],
      [b, hi, back],
      [a, hi, back],
    ]);
    q([
      [a, lo, back],
      [b, lo, back],
      [b, lo, front],
      [a, lo, front],
    ]);
  }

  mesh(name: string, material: THREE.Material, castsShadow = true) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    const uv = new THREE.Float32BufferAttribute(this.uvs, 2);
    geometry.setAttribute("uv", uv);
    geometry.setAttribute("uv1", uv);
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castsShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const HALF_WIDTH = 3.175;
const LENGTH = 8.6;
const EAVE = 6.15;
const PITCH = 0.64;
const RIDGE = EAVE + HALF_WIDTH * PITCH;
const FLOOR = 0.78;
const FRONT_DECK = 1.82;
const FRONT_RISE = FLOOR / 5;
const RIGHT_ENTRY = -6.92;
const SIDE_DECK_START = -6.24;
const SIDE_X = 3.77;
const TREAD = 0.287;
const unobstructed: Frame = (x, y, z) => [x, y, z];
const walls = {
  front: unobstructed,
  rear: ((x, y, z) => [-x, y, -LENGTH - z]) as Frame,
  right: ((u, y, z) => [HALF_WIDTH + z, y, -u]) as Frame,
  left: ((u, y, z) => [-HALF_WIDTH - z, y, u - LENGTH]) as Frame,
};

export const houseEntrances = {
  front: {
    threshold: [0, FLOOR, 0.08],
    approach: [0, FLOOR, 1.28],
    facing: [0, 0, 1],
  },
  side: {
    threshold: [HALF_WIDTH + 0.08, FLOOR, RIGHT_ENTRY],
    approach: [SIDE_X, FLOOR, RIGHT_ENTRY],
    facing: [1, 0, 0],
  },
} as const;

type Slab = { x0: number; x1: number; z0: number; z1: number; top: number };
type Blocker = Slab & { bottom: number };
export interface HouseCollision {
  walkable: Slab[];
  blockers: Blocker[];
}
const slab = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  top: number,
): Slab => ({ x0, x1, z0, z1, top });

/** Metres, local origin at grade below the center of the front wall. */
export function createHouseCollision(): HouseCollision {
  const walkable = [
    slab(-3.18, 3.18, 0.04, FRONT_DECK, FLOOR),
    slab(3.18, 4.37, -7.61, SIDE_DECK_START, FLOOR),
  ];
  for (let step = 0; step < 5; step++) {
    const front = FRONT_DECK + TREAD * step;
    const side = SIDE_DECK_START + TREAD * step;
    const y = FLOOR - FRONT_RISE * (step + 1);
    walkable.push(slab(-0.91, 0.91, front, front + TREAD, y));
    walkable.push(slab(3.25, 4.33, side, side + TREAD, y));
  }
  const blocker = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    top: number,
    bottom = 0,
  ) => ({
    ...slab(x0, x1, z0, z1, top),
    bottom,
  });
  return {
    walkable,
    blockers: [
      blocker(-HALF_WIDTH, HALF_WIDTH, -LENGTH, 0.045, EAVE),
      blocker(-3.24, -3.11, 0.04, FRONT_DECK, 1.72),
      blocker(3.11, 3.24, 0.04, FRONT_DECK, 1.72),
      blocker(-3.18, -1.01, 1.72, 1.87, 1.72),
      blocker(1.01, 3.18, 1.72, 1.87, 1.72),
      blocker(-1.01, -0.9, FRONT_DECK, FRONT_DECK + 4.4 * TREAD, 1.62),
      blocker(0.9, 1.01, FRONT_DECK, FRONT_DECK + 4.4 * TREAD, 1.62),
      blocker(4.31, 4.44, -7.61, SIDE_DECK_START + 4.4 * TREAD, 1.69),
      blocker(3.18, 4.44, -7.67, -7.58, 1.69),
      blocker(-3.3, 3.3, 0.06, 2.06, 3.48, 2.98),
    ],
  };
}

export async function loadHouseTextures(anisotropy = 4) {
  const loader = new THREE.TextureLoader();
  const [map, normalMap, orm] = await Promise.all(
    [colorUrl, normalUrl, ormUrl].map((url) => loader.loadAsync(url)),
  );
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, orm]) texture.anisotropy = anisotropy;
  orm.channel = 1;
  // Three uses a texture's channel for every role. Both sets carry the same UVs.
  return { map, normalMap, aoMap: orm, roughnessMap: orm, metalnessMap: orm };
}

interface WindowSpec {
  u: number;
  bottom: number;
  w: number;
  h: number;
  style: "blinds" | "curtains" | "shade";
  lit?: boolean;
}
interface Opening {
  u: number;
  bottom: number;
  w: number;
  h: number;
}
const windowSpec = (
  u: number,
  bottom: number,
  w: number,
  h: number,
  style: WindowSpec["style"],
  lit = false,
): WindowSpec => ({ u, bottom, w, h, style, lit });

/**
 * A stand-alone, decoder-free Three.js building, independent of City and renderer.
 * Add its root to a lit scene. Use setNight to drive the two practical fixtures.
 */
export function createReservoirHouse(
  textures: Awaited<ReturnType<typeof loadHouseTextures>>,
) {
  const root = new THREE.Group();
  root.name = "Reservoir weathered two-story house";
  const structure = new SurfaceBatch(),
    hardware = new SurfaceBatch(),
    glass = new SurfaceBatch();
  const interior = new SurfaceBatch(),
    warmInterior = new SurfaceBatch(),
    lamps = new SurfaceBatch();
  const random = randomSource(24681);
  const tint = (hex: number) => new THREE.Color(hex);
  const weather = (min = 0.74, max = 1) =>
    white.clone().multiplyScalar(min + random() * (max - min));
  const material = new THREE.MeshStandardMaterial({
    ...textures,
    name: "Weathered exterior PBR",
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    normalScale: new THREE.Vector2(0.95, 0.95),
    aoMapIntensity: 0.75,
  });
  const metal = new THREE.MeshStandardMaterial({
    name: "Painted and oxidized hardware",
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.28,
  });
  const panes = new THREE.MeshStandardMaterial({
    name: "Weathered window glass",
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.17,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
    envMapIntensity: 0.85,
  });
  const recess = new THREE.MeshStandardMaterial({
    ...textures,
    name: "Unlit window treatments",
    vertexColors: true,
    roughness: 1,
  });
  const warm = recess.clone();
  warm.name = "Warm window treatments";
  warm.emissive.set(0xd48a44);
  warm.emissiveMap = textures.map;
  const bulb = new THREE.MeshStandardMaterial({
    name: "Porch and service lamp lenses",
    color: 0xffd88b,
    emissive: 0xffae44,
    roughness: 0.45,
  });
  const grain: UV = [0.05, 0.28, 0.96, 0.49];
  const trim = (
    frame: Frame,
    u: number,
    y: number,
    d: number,
    w: number,
    h: number,
    thick: number,
    color = white,
    vertical = false,
  ) =>
    structure.box(
      frame,
      u,
      y,
      d,
      w,
      h,
      thick,
      tile.trim,
      color,
      grain,
      vertical,
    );
  const darkTrim = tint(0x9a7a61),
    paleTrim = tint(0xd5ba9d);
  const black = tint(0x302622);

  function openingLiner(frame: Frame, { u, bottom, w, h }: Opening) {
    const liner = tint(0x74614e);
    trim(
      frame,
      u - w / 2 + 0.023,
      bottom + h / 2,
      -0.075,
      0.046,
      h,
      0.22,
      liner,
      true,
    );
    trim(
      frame,
      u + w / 2 - 0.023,
      bottom + h / 2,
      -0.075,
      0.046,
      h,
      0.22,
      liner,
      true,
    );
    trim(frame, u, bottom + h - 0.02, -0.075, w, 0.04, 0.22, liner);
    trim(frame, u, bottom + 0.023, -0.075, w, 0.046, 0.22, liner);
  }

  function window(frame: Frame, spec: WindowSpec) {
    const { u, bottom, w, h, style, lit } = spec;
    const center = bottom + h / 2,
      left = u - w / 2,
      right = u + w / 2;
    openingLiner(frame, spec);
    for (const side of [-1, 1]) {
      trim(
        frame,
        u + side * (w / 2 + 0.039),
        center,
        0.057,
        0.109,
        h + 0.16,
        0.085,
        paleTrim,
        true,
      );
      trim(
        frame,
        u + side * (w / 2 - 0.073),
        center,
        -0.066,
        0.055,
        h - 0.06,
        0.065,
        darkTrim,
        true,
      );
      const screw = u + side * (w / 2 + 0.044);
      for (const y of [bottom + 0.12, bottom + h - 0.14]) {
        hardware.quad(
          [
            frame(screw - 0.008, y - 0.008, 0.101),
            frame(screw + 0.008, y - 0.008, 0.101),
            frame(screw + 0.008, y + 0.008, 0.101),
            frame(screw - 0.008, y + 0.008, 0.101),
          ],
          0,
          black,
        );
      }
    }
    trim(frame, u, bottom + h + 0.061, 0.07, w + 0.23, 0.113, 0.124, paleTrim);
    trim(frame, u, bottom - 0.045, 0.103, w + 0.255, 0.112, 0.215, paleTrim);
    trim(frame, u, center + 0.01, -0.04, w - 0.092, 0.078, 0.094, darkTrim);
    trim(frame, u, bottom + 0.063, -0.07, w - 0.085, 0.055, 0.05, darkTrim);
    trim(frame, u, bottom + h - 0.064, -0.07, w - 0.085, 0.048, 0.05, darkTrim);
    const bg = lit ? warmInterior : interior;
    const treatment = style === "shade" ? tint(0x4a4241) : tint(0xb3845f);
    const q = (
      y0: number,
      y1: number,
      d: number,
    ): [Point, Point, Point, Point] => [
      frame(left + 0.058, y0, d),
      frame(right - 0.058, y0, d),
      frame(right - 0.058, y1, d),
      frame(left + 0.058, y1, d),
    ];
    const backing = q(bottom + 0.033, bottom + h - 0.033, -0.2);
    bg.quad(
      backing,
      tile.cloth,
      style === "blinds" ? tint(0x443a35) : treatment,
    );
    if (style === "blinds") {
      // A slightly racked bank of slats and two cords behind the upper sash.
      for (let n = 0; n < 18; n++) {
        const y = bottom + h - 0.09 - n * h * 0.043;
        const drop = n > 13 ? (n - 13) * 0.012 : 0.008;
        bg.quad(
          [
            frame(left + 0.06, y - 0.027, -0.158),
            frame(right - 0.06, y - 0.027 - drop, -0.158),
            frame(right - 0.06, y - drop, -0.179),
            frame(left + 0.06, y, -0.179),
          ],
          tile.trim,
          tint(n % 4 === 0 ? 0xa98251 : 0x977348),
          grain,
        );
      }
      for (const offset of [-0.31, 0.31])
        trim(
          frame,
          u + w * offset,
          center + 0.1,
          -0.151,
          0.012,
          h * 0.78,
          0.012,
          darkTrim,
          true,
        );
    }
    if (style === "curtains") {
      const pleats = 16;
      for (let n = 0; n < pleats; n++) {
        const x0 = left + 0.06 + ((w - 0.12) * n) / pleats;
        const x1 = left + 0.06 + ((w - 0.12) * (n + 1)) / pleats;
        const depth = (i: number) => -0.178 + 0.044 * (i % 2);
        const hem = (i: number) =>
          bottom + 0.075 + 0.053 * (1 - Math.cos(i * 2.2));
        bg.quad(
          [
            frame(x0, hem(n), depth(n)),
            frame(x1, hem(n + 1), depth(n + 1)),
            frame(x1, bottom + h - 0.05, depth(n + 1) - 0.012),
            frame(x0, bottom + h - 0.05, depth(n) - 0.012),
          ],
          tile.cloth,
          tint(n % 2 ? 0xc39872 : 0xe2ba93),
          [n / pleats, 0, (n + 1) / pleats, 1],
        );
      }
    }
    for (const [lo, hi] of [
      [bottom + 0.066, center - 0.033],
      [center + 0.053, bottom + h - 0.059],
    ]) {
      glass.quad(q(lo, hi, -0.045), 0, tint(0x929eaa));
    }
  }

  function door(frame: Frame, u: number, width: number) {
    const h = 2.07,
      bottom = FLOOR,
      y = bottom + h / 2;
    openingLiner(frame, { u, bottom, w: width, h });
    const painted = tint(0xbeb0a0),
      panel = tint(0x988473);
    trim(frame, u, y, -0.143, width - 0.09, h - 0.055, 0.075, painted, true);
    for (const sign of [-1, 1]) {
      trim(
        frame,
        u + sign * (width / 2 + 0.04),
        y,
        0.064,
        0.108,
        h + 0.15,
        0.107,
        paleTrim,
        true,
      );
      for (const [row, height] of [
        [0.38, 0.4],
        [1.02, 0.63],
        [1.7, 0.23],
      ]) {
        const p = u + sign * width * 0.208,
          w = width * 0.3;
        trim(
          frame,
          p,
          bottom + row,
          -0.099,
          w + 0.023,
          height + 0.024,
          0.019,
          panel,
          true,
        );
        trim(
          frame,
          p,
          bottom + row,
          -0.084,
          w - 0.033,
          height - 0.034,
          0.014,
          painted,
          true,
        );
      }
    }
    trim(
      frame,
      u,
      bottom + h + 0.051,
      0.073,
      width + 0.221,
      0.105,
      0.122,
      paleTrim,
    );
    trim(frame, u, bottom + 0.023, 0.045, width + 0.04, 0.047, 0.28, darkTrim);
    hardware.box(
      frame,
      u - width * 0.38,
      bottom + 1.02,
      -0.074,
      0.071,
      0.166,
      0.046,
      0,
      black,
    );
    hardware.box(
      frame,
      u - width * 0.38,
      bottom + 1.02,
      -0.027,
      0.048,
      0.048,
      0.062,
      0,
      tint(0x886b40),
    );
    hardware.box(
      frame,
      u - width * 0.38,
      bottom + 1.19,
      -0.083,
      0.031,
      0.034,
      0.029,
      0,
      tint(0x7d6039),
    );
  }

  function course(
    frame: Frame,
    left: number,
    right: number,
    y: number,
    top: number,
    inset: number,
    tone: THREE.Color,
  ) {
    const span = right - left;
    if (span < 0.014) return;
    const start = random() * 0.26;
    const strip = Math.floor(random() * 6) / 6;
    // Account for the eight-pixel atlas margins in SurfaceBatch.
    const v = (strip * 512 - 3) / 496;
    const uv: UV = [
      start,
      Math.max(0, v),
      Math.min(0.99, start + span / 4.8),
      Math.min(1, v + 0.155),
    ];
    structure.quad(
      [
        frame(left, y, 0.04),
        frame(right, y, 0.04),
        frame(right - inset, top, 0.009),
        frame(left + inset, top, 0.009),
      ],
      tile.siding,
      tone,
      uv,
    );
    structure.quad(
      [
        frame(left, y, -0.005),
        frame(right, y, -0.005),
        frame(right, y, 0.04),
        frame(left, y, 0.04),
      ],
      tile.trim,
      tone.clone().multiplyScalar(0.38),
      [0, 0.22, 0.93, 0.244],
    );
  }

  function clad(
    frame: Frame,
    min: number,
    max: number,
    openings: Opening[],
    tone: number,
    gable = false,
  ) {
    const cuts = [...openings].sort((a, b) => a.u - b.u);
    const draw = (
      left: number,
      right: number,
      bottom: number,
      top: number,
      inset = 0,
    ) => {
      if (right - left < 0.014) return;
      const board = weather(tone * 0.88, tone * 1.12);
      if (inset || right - left < 3.2) {
        course(frame, left, right, bottom, top, inset, board);
        return;
      }
      const count = Math.ceil((right - left) / 2.85);
      const width = (right - left) / count;
      let start = left;
      for (let i = 1; i <= count; i++) {
        const end =
          i === count
            ? right
            : left + i * width + (random() - 0.5) * width * 0.48;
        course(
          frame,
          start,
          end,
          bottom,
          top,
          0,
          board.clone().multiplyScalar(0.89 + random() * 0.16),
        );
        start = end;
      }
    };
    const bands = new Set<number>([FLOOR, EAVE]);
    for (let y = FLOOR + 0.191; y < EAVE; y += 0.191) bands.add(y);
    for (const opening of cuts) {
      if (opening.bottom > FLOOR && opening.bottom < EAVE)
        bands.add(opening.bottom);
      if (opening.bottom + opening.h < EAVE)
        bands.add(opening.bottom + opening.h);
    }
    const sorted = [...bands].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const bottom = sorted[i - 1],
        top = sorted[i],
        center = (bottom + top) / 2;
      let u = min;
      for (const o of cuts) {
        if (center <= o.bottom || center >= o.bottom + o.h) continue;
        draw(u, o.u - o.w / 2, bottom, top);
        u = o.u + o.w / 2;
      }
      draw(u, max, bottom, top);
    }
    if (gable) {
      for (let y = EAVE; y < RIDGE - 0.012; y += 0.189) {
        const top = Math.min(RIDGE - 0.003, y + 0.189),
          w = (RIDGE - y) / PITCH;
        draw(-w, w, y, top, (top - y) / PITCH);
      }
    }
  }

  const front = [
    windowSpec(-1.76, 1.73, 1.02, 1.29, "blinds"),
    windowSpec(1.72, 1.69, 1.02, 1.32, "curtains", true),
    windowSpec(-1.32, 4.22, 1.0, 1.39, "blinds"),
    windowSpec(1.3, 4.19, 1.05, 1.45, "curtains", true),
  ];
  const right = [
    windowSpec(3.56, 1.58, 0.84, 1.37, "shade"),
    windowSpec(3.12, 4.22, 0.82, 1.4, "shade"),
  ];
  const rear = [
    windowSpec(-1.44, 1.61, 1.02, 1.26, "shade"),
    windowSpec(-1.47, 4.24, 0.95, 1.34, "curtains"),
    windowSpec(1.34, 4.18, 0.94, 1.37, "blinds"),
  ];
  const left = [
    windowSpec(2.1, 1.69, 0.92, 1.29, "shade"),
    windowSpec(4.88, 4.21, 0.86, 1.39, "shade"),
    windowSpec(7.12, 1.72, 0.78, 1.2, "shade"),
  ];
  const frontDoor = { u: 0, bottom: FLOOR, w: 0.92, h: 2.07 };
  const sideDoor = { u: -RIGHT_ENTRY, bottom: FLOOR, w: 0.89, h: 2.07 };
  clad(walls.front, -HALF_WIDTH, HALF_WIDTH, [...front, frontDoor], 0.9, true);
  clad(walls.right, 0, LENGTH, [...right, sideDoor], 0.78);
  clad(walls.rear, -HALF_WIDTH, HALF_WIDTH, rear, 0.86, true);
  clad(walls.left, 0, LENGTH, left, 0.88);
  for (const [side, windows] of [
    [walls.front, front],
    [walls.right, right],
    [walls.rear, rear],
    [walls.left, left],
  ] as const) {
    for (const spec of windows) window(side, spec);
  }
  door(walls.front, frontDoor.u, frontDoor.w);
  door(walls.right, sideDoor.u, sideDoor.w);
  for (const frame of [walls.front, walls.rear]) {
    trim(frame, 0, EAVE - 0.025, 0.067, 6.39, 0.15, 0.084, paleTrim);
    for (const x of [-3.147, 3.147])
      trim(
        frame,
        x,
        (EAVE + FLOOR) / 2,
        0.062,
        0.146,
        EAVE - FLOOR,
        0.096,
        paleTrim,
        true,
      );
    trim(frame, 0, 7.21, 0.065, 0.66, 0.73, 0.088, paleTrim);
    hardware.box(frame, 0, 7.21, 0.115, 0.48, 0.539, 0.036, 0, black);
    for (let slat = 0; slat < 6; slat++) {
      const y = 6.983 + 0.084 * slat;
      structure.quad(
        [
          frame(-0.24, y, 0.173),
          frame(0.24, y, 0.173),
          frame(0.24, y + 0.061, 0.125),
          frame(-0.24, y + 0.061, 0.125),
        ],
        tile.trim,
        darkTrim,
        grain,
      );
    }
    trim(frame, 0, 6.855, 0.117, 0.73, 0.075, 0.132, paleTrim);
  }
  for (const frame of [walls.right, walls.left]) {
    for (const u of [0.03, LENGTH - 0.03])
      trim(
        frame,
        u,
        (EAVE + FLOOR) / 2,
        0.056,
        0.122,
        EAVE - FLOOR,
        0.09,
        darkTrim,
        true,
      );
  }

  function foundation(frame: Frame, from: number, to: number) {
    const sections = Math.ceil((to - from) / 1.7);
    for (let s = 0; s < sections; s++) {
      const x0 = THREE.MathUtils.lerp(from, to, s / sections);
      const x1 = THREE.MathUtils.lerp(from, to, (s + 1) / sections);
      structure.quad(
        [
          frame(x0, -0.055, 0.019),
          frame(x1, -0.055, 0.019),
          frame(x1, FLOOR, 0.019),
          frame(x0, FLOOR, 0.019),
        ],
        tile.concrete,
        weather(0.65, 0.9),
      );
    }
  }
  foundation(walls.front, -3.19, 3.19);
  foundation(walls.rear, -3.19, 3.19);
  foundation(walls.right, 0, LENGTH);
  foundation(walls.left, 0, LENGTH);
  for (const [frame, u] of [
    [walls.right, 2.05],
    [walls.rear, 0.7],
  ] as const) {
    structure.box(
      frame,
      u,
      0.31,
      0.027,
      0.66,
      0.354,
      0.055,
      tile.concrete,
      darkTrim,
    );
    hardware.box(frame, u, 0.31, 0.06, 0.55, 0.265, 0.028, 0, black);
    for (const du of [-0.125, 0, 0.125])
      hardware.box(
        frame,
        u + du,
        0.31,
        0.079,
        0.014,
        0.265,
        0.018,
        0,
        tint(0x504c47),
      );
    hardware.box(frame, u, 0.31, 0.079, 0.55, 0.015, 0.018, 0, tint(0x504c47));
  }

  // Main shingle roof. Left and right slopes share a ridge running front to rear.
  const overhang = 3.54,
    roofFront = 0.34,
    roofBack = -LENGTH - 0.32;
  for (const sign of [-1, 1]) {
    const roof: Frame =
      sign > 0
        ? (u, y, d) => [u, RIDGE - u * PITCH + y, d]
        : (u, y, d) => [-u, RIDGE - u * PITCH + y, -LENGTH - d];
    structure.box(
      roof,
      overhang / 2,
      -0.057,
      -LENGTH / 2,
      overhang,
      0.112,
      LENGTH + 0.65,
      tile.shingle,
      darkTrim,
    );
    const courses = 15,
      coverage = overhang / courses;
    for (let row = 0; row < courses; row++) {
      let start = roofBack;
      while (start < roofFront - 0.003) {
        const end = Math.min(
          roofFront,
          start +
            (start === roofBack && row % 2 ? 0.34 : 0.58 + random() * 0.23),
        );
        const inner = row * coverage,
          outer = (row + 1) * coverage + 0.015;
        const tilt = (random() - 0.5) * 0.018;
        const edge = 0.016 + (random() < 0.065 ? 0.03 : 0);
        const xy: UV = [random() * 0.3, random() * 0.7, 0.965, 0.91];
        const tone = weather(random() < 0.045 ? 0.41 : 0.64, 1.18);
        const a = roof(inner, 0.037, end),
          b = roof(outer, edge + tilt, end);
        const c = roof(outer, edge - tilt, start),
          d = roof(inner, 0.037, start);
        structure.quad([a, b, c, d], tile.shingle, tone, xy);
        structure.quad(
          [b, roof(outer, -0.004, end), roof(outer, -0.004, start), c],
          tile.shingle,
          tone.clone().multiplyScalar(0.5),
          xy,
        );
        start = end + 0.015;
      }
    }
    for (const z of [roofFront + 0.008, roofBack - 0.008]) {
      const frame: Frame = (u, y, d) => [u, RIDGE - sign * u * PITCH + y, d];
      trim(
        frame,
        (sign * overhang) / 2,
        -0.062,
        z,
        overhang,
        0.195,
        0.11,
        paleTrim,
      );
      trim(
        frame,
        (sign * overhang) / 2,
        0.036,
        z,
        overhang,
        0.044,
        0.124,
        darkTrim,
      );
    }
    trim(
      unobstructed,
      sign * overhang,
      RIDGE - overhang * PITCH - 0.094,
      -LENGTH / 2,
      0.132,
      0.19,
      LENGTH + 0.73,
      paleTrim,
    );
    structure.box(
      unobstructed,
      sign * (overhang + 0.077),
      RIDGE - overhang * PITCH - 0.128,
      -LENGTH / 2,
      0.108,
      0.137,
      LENGTH + 0.7,
      tile.steel,
      tint(0x9d8270),
    );
  }
  for (let z = roofBack; z < roofFront; z += 0.39) {
    const length = Math.min(0.42, roofFront - z + 0.04);
    structure.box(
      unobstructed,
      0,
      RIDGE + 0.026,
      z + length / 2,
      0.211,
      0.058,
      length,
      tile.shingle,
      weather(0.68, 1.07),
    );
  }
  // A masonry stack with counterflashing, brick corbel and rain cap.
  structure.box(
    unobstructed,
    1.09,
    7.66,
    -3.12,
    0.9,
    0.13,
    0.85,
    tile.steel,
    darkTrim,
  );
  structure.box(
    unobstructed,
    1.09,
    8.15,
    -3.12,
    0.69,
    1.53,
    0.59,
    tile.brick,
    weather(0.83, 0.94),
    [0, 0, 0.59, 1],
  );
  structure.box(
    unobstructed,
    1.09,
    8.91,
    -3.12,
    0.79,
    0.163,
    0.7,
    tile.brick,
    weather(0.88, 0.98),
    [0, 0.19, 0.7, 0.3],
  );
  structure.box(
    unobstructed,
    1.09,
    9.03,
    -3.12,
    0.35,
    0.099,
    0.34,
    tile.concrete,
    darkTrim,
  );
  structure.box(
    unobstructed,
    1.09,
    9.124,
    -3.12,
    0.44,
    0.045,
    0.42,
    tile.steel,
    darkTrim,
  );

  // Raised timber porch on a visible block plinth.
  for (const x of [-2.38, -0.79, 0.79, 2.38]) {
    structure.box(
      unobstructed,
      x,
      0.35,
      0.954,
      1.59,
      0.7,
      1.7,
      tile.concrete,
      weather(0.63, 0.88),
    );
  }
  for (let x = -3.13; x <= 3.1; x += 0.185) {
    trim(
      unobstructed,
      x,
      0.746,
      0.949,
      0.181,
      0.068,
      1.73,
      weather(0.75, 1.03),
    );
  }
  trim(unobstructed, 0, 0.704, 1.81, 6.42, 0.143, 0.161, paleTrim);
  const porchRoof: Frame = (x, y, z) => [x, 3.46 - (z - 0.03) * 0.218 + y, z];
  const porchDepth = 2.08,
    porchWidth = 6.76;
  structure.box(
    porchRoof,
    0,
    -0.061,
    1.04,
    porchWidth,
    0.129,
    porchDepth,
    tile.trim,
    darkTrim,
  );
  for (let panel = 0; panel < 14; panel++) {
    const x = -porchWidth / 2 + ((panel + 0.5) * porchWidth) / 14;
    const rect: UV = [
      random() * 0.58,
      random() * 0.29,
      0.7 + random() * 0.29,
      0.69 + random() * 0.29,
    ];
    structure.box(
      porchRoof,
      x,
      0.022,
      1.04,
      porchWidth / 14 - 0.012,
      0.049,
      porchDepth,
      tile.steel,
      weather(0.79, 1.12),
      rect,
    );
    structure.box(
      porchRoof,
      x + 0.22,
      0.048,
      1.045,
      0.023,
      0.022,
      porchDepth,
      tile.steel,
      weather(0.66, 0.97),
      rect,
    );
    for (const z of [0.2, 1.11, 1.94]) {
      hardware.quad(
        [
          porchRoof(x - 0.188, 0.048, z + 0.008),
          porchRoof(x - 0.172, 0.048, z + 0.008),
          porchRoof(x - 0.172, 0.048, z - 0.008),
          porchRoof(x - 0.188, 0.048, z - 0.008),
        ],
        0,
        black,
      );
    }
  }
  trim(
    unobstructed,
    0,
    2.975,
    2.045,
    porchWidth + 0.04,
    0.112,
    0.135,
    paleTrim,
  );
  trim(unobstructed, 0, 2.887, 1.775, 6.44, 0.201, 0.171, darkTrim);
  for (const x of [-3.03, -1.04, 1.04, 3.03]) {
    trim(unobstructed, x, 1.85, 1.727, 0.169, 2.16, 0.188, paleTrim, true);
    trim(unobstructed, x, 0.839, 1.727, 0.249, 0.124, 0.249, darkTrim);
    trim(unobstructed, x, 2.821, 1.727, 0.225, 0.155, 0.229, darkTrim);
  }

  function rail(
    start: Point,
    end: Point,
    count: number,
    color: THREE.Color,
    stair = false,
  ) {
    const [dx, dy, dz] = end.map((value, i) => value - start[i]);
    const length = Math.hypot(dx, dz);
    const railFrame: Frame = (u, y, d) => [
      start[0] + (u * dx - d * dz) / length,
      start[1] + (dy * u) / length + y,
      start[2] + (u * dz + d * dx) / length,
    ];
    trim(railFrame, length / 2, 0.887, 0, length + 0.065, 0.085, 0.122, color);
    trim(
      railFrame,
      length / 2,
      0.103,
      0,
      length,
      0.068,
      0.064,
      color.clone().multiplyScalar(0.76),
    );
    for (let n = 0; n <= count; n++) {
      const endPost = n === 0 || n === count,
        u = (length * n) / count;
      const thickness = endPost ? 0.117 : 0.043;
      // Posts remain vertical even when the stringers slope.
      const [x, y, z] = railFrame(u, 0, 0);
      trim(
        unobstructed,
        x,
        y + (endPost ? 0.423 : 0.475),
        z,
        thickness,
        endPost ? 0.93 : 0.76,
        thickness,
        color,
        true,
      );
      if (endPost && stair)
        trim(unobstructed, x, y + 0.934, z, 0.151, 0.044, 0.151, color);
    }
  }
  for (const sign of [-1, 1]) {
    rail([sign * 1.02, FLOOR, 1.74], [sign * 3.04, FLOOR, 1.74], 11, paleTrim);
    rail([sign * 3.06, FLOOR, 1.7], [sign * 3.06, FLOOR, 0.1], 8, darkTrim);
    rail(
      [sign * 0.966, 0.02, FRONT_DECK + 4.72 * TREAD],
      [sign * 1.02, FLOOR, FRONT_DECK - 0.06],
      7,
      paleTrim,
      true,
    );
  }
  for (let step = 0; step < 5; step++) {
    const y = FLOOR - FRONT_RISE * (step + 1);
    const frontZ = FRONT_DECK + (step + 0.5) * TREAD;
    const sideZ = SIDE_DECK_START + (step + 0.5) * TREAD;
    structure.box(
      unobstructed,
      0,
      (y - 0.067) / 2,
      frontZ,
      1.82,
      y + 0.067,
      TREAD + 0.014,
      tile.concrete,
      weather(0.77, 1.09),
      [0.037, 0.034, 0.215, 0.209],
    );
    trim(
      unobstructed,
      SIDE_X,
      y - 0.039,
      sideZ,
      1.12,
      0.078,
      TREAD + 0.02,
      darkTrim,
    );
  }
  for (const x of [3.32, 4.21]) {
    const stringer: Frame = (u, y, z) => [
      u,
      FLOOR + y - ((z - SIDE_DECK_START) * FRONT_RISE) / TREAD,
      z,
    ];
    trim(
      stringer,
      x,
      -0.122,
      SIDE_DECK_START + 0.65,
      0.115,
      0.208,
      1.44,
      darkTrim,
    );
    trim(unobstructed, x, 0.348, -7.45, 0.119, 0.696, 0.127, darkTrim, true);
    trim(unobstructed, x, 0.348, -6.32, 0.119, 0.696, 0.127, darkTrim, true);
  }
  for (let z = -7.54; z < SIDE_DECK_START; z += 0.19)
    trim(
      unobstructed,
      SIDE_X,
      0.732,
      z,
      1.19,
      0.096,
      0.185,
      weather(0.57, 0.79),
    );
  rail(
    [4.36, FLOOR, -7.57],
    [4.36, FLOOR, SIDE_DECK_START - 0.02],
    7,
    darkTrim,
  );
  rail([3.22, FLOOR, -7.59], [4.36, FLOOR, -7.59], 6, darkTrim);
  rail(
    [4.36, 0.03, SIDE_DECK_START + 4.7 * TREAD],
    [4.36, FLOOR, SIDE_DECK_START - 0.02],
    6,
    darkTrim,
    true,
  );
  const sideAwning: Frame = (u, y, d) => walls.right(u, 3.3 + y - 0.35 * d, d);
  structure.box(
    sideAwning,
    -RIGHT_ENTRY,
    0,
    0.54,
    1.73,
    0.12,
    1.14,
    tile.shingle,
    weather(0.84, 1.1),
  );
  trim(sideAwning, -RIGHT_ENTRY, -0.041, 1.12, 1.79, 0.116, 0.085, darkTrim);
  for (const u of [-RIGHT_ENTRY - 0.83, -RIGHT_ENTRY + 0.83])
    trim(sideAwning, u, -0.085, 0.54, 0.084, 0.146, 1.14, darkTrim);

  // Gutters, downspouts, service line and two front-facing practical lights.
  for (const frame of [walls.front, walls.rear]) {
    for (const x of [-3.32, 3.32]) {
      structure.box(
        frame,
        x,
        3.159,
        0.016,
        0.075,
        5.73,
        0.081,
        tile.steel,
        darkTrim,
      );
      structure.box(
        frame,
        x * 1.053,
        5.8,
        0.021,
        0.324,
        0.093,
        0.093,
        tile.steel,
        darkTrim,
      );
      structure.box(
        frame,
        x + (x > 0 ? 0.096 : -0.096),
        0.258,
        0.016,
        0.209,
        0.077,
        0.083,
        tile.steel,
        darkTrim,
      );
    }
  }
  const service = walls.right;
  structure.box(
    service,
    0.7,
    1.75,
    0.083,
    0.314,
    0.405,
    0.119,
    tile.steel,
    paleTrim,
  );
  hardware.box(
    service,
    0.7,
    0.96,
    0.099,
    0.044,
    1.27,
    0.049,
    0,
    tint(0x544a3f),
  );
  hardware.box(
    service,
    6.09,
    2.05,
    0.069,
    0.034,
    2.68,
    0.039,
    0,
    tint(0x6e5441),
  );
  const meter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.084, 12),
    metal.clone(),
  );
  meter.material.vertexColors = false;
  meter.material.color.set(0x77746c);
  meter.rotation.z = Math.PI / 2;
  meter.position.set(HALF_WIDTH + 0.176, 1.8, -0.7);
  meter.name = "Electrical meter";
  meter.castShadow = true;
  root.add(meter);
  hardware.box(service, 6.91, 3.038, 0.251, 0.269, 0.119, 0.248, 0, black);
  hardware.box(service, 6.91, 3.102, 0.136, 0.055, 0.046, 0.298, 0, black);
  lamps.box(service, 6.91, 2.976, 0.25, 0.187, 0.021, 0.195);
  hardware.box(walls.front, 0, 2.94, 0.52, 0.26, 0.086, 0.226, 0, black);
  lamps.box(walls.front, 0, 2.893, 0.52, 0.196, 0.025, 0.164);

  root.add(
    structure.mesh("Batched siding, shingles, masonry and trim", material),
    hardware.mesh("Fasteners, fixtures and service hardware", metal),
    interior.mesh("Recessed blinds and shades", recess, false),
    warmInterior.mesh("Recessed curtain fabric", warm, false),
    glass.mesh("Inset glass panes", panes, false),
    lamps.mesh("Porch and side entrance lamp lenses", bulb, false),
  );
  const lightPositions: Point[] = [
    [0, 2.86, 0.55],
    [3.46, 2.94, RIGHT_ENTRY],
  ];
  const practicals = lightPositions.map((position) => {
    const light = new THREE.PointLight(0xffb063, 0, 4.2, 2);
    light.position.set(...position);
    root.add(light);
    return light;
  });
  const setNight = (night: boolean) => {
    warm.emissiveIntensity = night ? 1.56 : 0;
    bulb.emissiveIntensity = night ? 2.1 : 0.07;
    practicals.forEach((light) => {
      light.visible = night;
      light.intensity = night ? 13 : 0;
    });
  };
  setNight(false);
  return {
    root,
    setNight,
    collision: createHouseCollision(),
    entrances: houseEntrances,
  };
}
