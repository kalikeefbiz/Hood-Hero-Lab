import type { ZoneId } from "../core/GameState";
import type { BlockDef } from "../city3d/layout";
import type { Rect } from "./archetypes";

/**
 * Set pieces: generic GLB lots (gas stations, courts, parks, walk-ups…) that
 * dress the blocks no named place uses. One model is drawn as many instances,
 * so a piece costs the same graphics memory whether it appears once or twenty
 * times. Each district draws from its own pool, which is what makes Rio read
 * differently from the Nawf.
 *
 * Placement is seeded per block, so the city looks the same every session.
 */
export const SET_PIECES = {
  gasStation: "assets/models/gas-station.glb",
  basketballCourt: "assets/models/basketball-court.glb",
  pocketPark: "assets/models/pocket-park.glb",
  vacantLot: "assets/models/vacant-lot.glb",
  stripMall: "assets/models/strip-mall.glb",
  fastFood: "assets/models/fast-food.glb",
  carWash: "assets/models/car-wash.glb",
  walkup: "assets/models/walkup.glb",
  shotgunHouse: "assets/models/shotgun-house.glb",
  parkingLot: "assets/models/parking-lot.glb",
  tacoLot: "assets/models/taco-lot.glb",
  palmPark: "assets/models/palm-park.glb",
  liquorCorner: "assets/models/liquor-corner.glb",
  storefrontChurch: "assets/models/storefront-church.glb",
  parkingGarage: "assets/models/parking-garage.glb",
  transitPlaza: "assets/models/transit-plaza.glb",
  // Southside housing developments (studio art).
  southTower: "assets/models/south-tower.glb",
  southCourtyard: "assets/models/south-courtyard.glb",
  southGarden: "assets/models/south-garden.glb",
} as const;
export type SetPieceId = keyof typeof SET_PIECES;

/** Pieces that suit a whole block rather than half of one. */
const WHOLE_BLOCK = new Set<SetPieceId>(["transitPlaza", "parkingGarage"]);
/** Pieces that may only appear once in the city. */
const ONCE = new Set<SetPieceId>(["transitPlaza"]);
/**
 * Caps per district, so no neighborhood reads as the same gas station or
 * court on repeat. Once a district's pieces run out, the remaining blocks
 * keep their procedural buildings.
 */
const MAX_PER_DISTRICT: Partial<Record<SetPieceId, number>> = {
  gasStation: 2,
  fastFood: 2,
  carWash: 2,
  stripMall: 2,
  parkingGarage: 2,
  parkingLot: 2,
  storefrontChurch: 2,
  liquorCorner: 2,
  basketballCourt: 3,
  vacantLot: 3,
  tacoLot: 3,
  palmPark: 3,
  pocketPark: 2,
  walkup: 5,
  shotgunHouse: 6,
};
/** Tallest a piece may stand (world units), when its block would make it taller. */
export const MAX_HEIGHT: Partial<Record<SetPieceId, number>> = {
  southTower: 18,
};
/** Pieces painted per instance so a repeated house never looks cloned. */
export const TINTED = new Set<SetPieceId>(["shotgunHouse", "walkup"]);

const POOLS: Record<ZoneId, Partial<Record<SetPieceId, number>>> = {
  downtown: {
    parkingGarage: 3,
    parkingLot: 2,
    gasStation: 1,
    fastFood: 1,
    stripMall: 1,
    carWash: 1,
  },
  rio: {
    tacoLot: 2,
    palmPark: 2,
    gasStation: 1,
    fastFood: 1,
    carWash: 1,
    stripMall: 1,
    basketballCourt: 1,
    walkup: 1,
    shotgunHouse: 1,
    parkingLot: 1,
  },
  nawf: {
    walkup: 3,
    basketballCourt: 2,
    vacantLot: 2,
    stripMall: 1,
    fastFood: 1,
    gasStation: 1,
    pocketPark: 2,
  },
  south: {
    liquorCorner: 2,
    basketballCourt: 2,
    walkup: 2,
    shotgunHouse: 2,
    vacantLot: 2,
    gasStation: 1,
    fastFood: 1,
    stripMall: 1,
    pocketPark: 2,
    carWash: 1,
  },
  reservoir: {
    shotgunHouse: 3,
    storefrontChurch: 2,
    vacantLot: 2,
    pocketPark: 1,
    gasStation: 1,
  },
};
/** Each district's signature pieces always appear at least once. */
const SIGNATURE: Record<ZoneId, SetPieceId[]> = {
  downtown: [],
  rio: ["tacoLot", "palmPark"],
  nawf: [],
  south: ["liquorCorner"],
  reservoir: ["storefrontChurch"],
};
/** Share of empty blocks that get a set piece (the rest keep filler). */
const DENSITY: Record<ZoneId, number> = {
  downtown: 0.5,
  rio: 0.8,
  nawf: 0.8,
  south: 0.85,
  reservoir: 0.9,
};

export interface SetPiecePlacement {
  piece: SetPieceId;
  block: string;
  rect: Rect;
  /** 0 faces south (+Z); PI faces north. */
  yaw: number;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Choose set pieces for a district's empty blocks (their buildable area).
 * Stixx Central's transit plaza is placed by the renderer, beside the hub.
 */
export function planSetPieces(
  zone: ZoneId,
  blocks: BlockDef[],
): SetPiecePlacement[] {
  const r = seeded(hashString(`set-pieces:${zone}`));
  const bag: SetPieceId[] = [];
  for (const [id, w] of Object.entries(POOLS[zone]) as [SetPieceId, number][])
    for (let i = 0; i < w; i++) bag.push(id);
  // Deterministic shuffle, then walk the bag so repeats are spread out.
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  for (const sig of [...SIGNATURE[zone]].reverse()) {
    bag.splice(bag.indexOf(sig), 1);
    bag.unshift(sig);
  }
  let cursor = 0;
  const used = new Set<SetPieceId>();
  const counts = new Map<SetPieceId, number>();
  const room = (id: SetPieceId) =>
    (counts.get(id) ?? 0) < (MAX_PER_DISTRICT[id] ?? Infinity);
  const next = (whole: boolean): SetPieceId | null => {
    for (let tries = 0; tries < bag.length; tries++) {
      const id = bag[cursor++ % bag.length];
      if (ONCE.has(id) && used.has(id)) continue;
      if (!room(id)) continue;
      if (WHOLE_BLOCK.has(id) !== whole && WHOLE_BLOCK.has(id)) continue;
      used.add(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return id;
    }
    return null;
  };
  const out: SetPiecePlacement[] = [];
  // Southside's housing developments take its project blocks whole, and
  // every other block of the dense south-west: they replace the generic slabs.
  if (zone === "south") {
    const housing: SetPieceId[] = ["southTower", "southCourtyard", "southGarden"];
    let h = 0;
    const rest: BlockDef[] = [];
    blocks.forEach((b, i) => {
      const take =
        b.kind === "projects" || (b.section === "sw" && i % 2 === 0);
      if (!take) return rest.push(b);
      const piece =
        b.kind === "projects"
          ? housing[h++ % housing.length]
          : housing[1 + (h++ % 2)];
      out.push({
        piece,
        block: b.id,
        rect: {
          minX: b.minX + 0.3,
          maxX: b.maxX - 0.3,
          minZ: b.minZ + 0.3,
          maxZ: b.maxZ - 0.3,
        },
        yaw: 0,
      });
    });
    blocks = rest;
  }
  for (const b of blocks) {
    const cz = (b.minZ + b.maxZ) / 2;
    const inset = 0.3;
    const full: Rect = {
      minX: b.minX + inset,
      maxX: b.maxX - inset,
      minZ: b.minZ + inset,
      maxZ: b.maxZ - inset,
    };
    if (r() > DENSITY[zone]) continue;
    // Downtown sometimes gives a whole block to a garage or the transit plaza.
    if (zone === "downtown" && r() < 0.35) {
      const id = bag.find(
        (p) => WHOLE_BLOCK.has(p) && !(ONCE.has(p) && used.has(p)) && room(p),
      );
      if (id) {
        used.add(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
        out.push({ piece: id, block: b.id, rect: full, yaw: 0 });
        continue;
      }
    }
    const south = r() < 0.6;
    const halves: [boolean, number][] =
      r() < 0.25 ? [[true, 0], [false, Math.PI]] : [[south, south ? 0 : Math.PI]];
    for (const [isSouth, yaw] of halves) {
      const piece = next(false);
      if (!piece || WHOLE_BLOCK.has(piece)) continue;
      out.push({
        piece,
        block: b.id,
        rect: isSouth
          ? { ...full, minZ: cz + 0.15 }
          : { ...full, maxZ: cz - 0.15 },
        yaw,
      });
    }
  }
  return out;
}
