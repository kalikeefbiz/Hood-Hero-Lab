// World layout for the Reservoir (metres, Y up; x east, z south). Streets run along X;
// Kirkwood St (x 6.6..14) links them north to south. Grid: docs/RESERVOIR_LAYOUT.md.
// Tiling textures shared by many GLBs live in assets/tex/ (see sharedTextures.ts).
export interface Placed { file: string; x: number; z: number; rotY?: number }
const H = "assets/strip/";
const R = "assets/reservoir/";
/** The Reservoir is built street by street; each street loads as a group, nearest first. */
export interface Street { name: string; /** z of the road centre, for load order */ z: number; assets: Placed[] }
export const STREETS: Street[] = [
  {
    name: "Lil Bit Lane", z: 8,
    assets: [
      { file: H + "street.glb", x: 0, z: 0 },
      { file: H + "lil-jays.glb", x: 0, z: 0 },
      { file: H + "house-dark.glb", x: -10.5, z: -4.4 },
      { file: H + "house-tan.glb", x: -19.5, z: -4.8 },
      { file: H + "house-abandoned.glb", x: -28.5, z: -4.7 },
      // across the street, facing back toward the store
      { file: H + "house-tan.glb", x: -2.5, z: 20.6, rotY: Math.PI },
      { file: H + "house-abandoned.glb", x: -13.5, z: 20.5, rotY: Math.PI },
      { file: H + "house-dark.glb", x: -25.5, z: 20.3, rotY: Math.PI },
      { file: H + "house-dark.glb", x: 22.0, z: 20.3, rotY: Math.PI },
    ],
  },
  {
    // One block south down Kirkwood St. North-side storefronts face the boulevard
    // (+Z) with their fronts on z = 44.8. Parking lot at the west end.
    name: "Blocc Boy Boulevard", z: 52.7,
    assets: [
      { file: R + "blocc-boy-blvd.glb", x: 0, z: 0 },
      { file: R + "reservoir-barber-shop.glb", x: -22.6, z: 44.8 },
      { file: R + "reservoir-liquor-deli.glb", x: -14.6, z: 44.8 },
      { file: R + "reservoir-beauty-supply.glb", x: -7.0, z: 44.8 },
      { file: R + "reservoir-pawn.glb", x: 0.5, z: 44.8 },
    ],
  },
  {
    // One block north up Kirkwood St. The Reservoir Water Tower closes its west
    // end: the westernmost point of the Reservoir and the Stixx.
    name: "Big Mouth Boulevard", z: -35.9,
    assets: [
      { file: R + "big-mouth-blvd.glb", x: 0, z: 0 },
      { file: R + "reservoir-water-tower.glb", x: -68, z: -35.9, rotY: Math.PI / 2 },
      { file: R + "boarded-house.glb", x: -50, z: -48.1 },
      { file: R + "house-dark-two-story.glb", x: -39, z: -48.0 },
      { file: H + "house-dark.glb", x: -29.5, z: -48.2 },
    ],
  },
  {
    // North of Big Mouth Blvd, the Reservoir's last street. Thin on purpose: the
    // Laundry on the Kirkwood corner, a few houses, fenced empty lots between.
    name: "Dirty Money Drive", z: -87.3,
    assets: [
      { file: R + "dirty-money-drive.glb", x: 0, z: 0 },
      { file: R + "reservoir-laundry.glb", x: 0, z: -95.2 },
      { file: H + "house-dark.glb", x: -10.5, z: -99.6 },
      { file: R + "house-dark-two-story.glb", x: -30.5, z: -99.4 },
      { file: R + "house-tan-bungalow.glb", x: -41.5, z: -99.0 },
      // south side, facing north
      { file: R + "house-duplex-721.glb", x: -5.0, z: -76.4, rotY: Math.PI },
      { file: H + "house-abandoned.glb", x: -26.0, z: -75.0, rotY: Math.PI },
      { file: R + "house-tan-bungalow.glb", x: -47.0, z: -75.6, rotY: Math.PI },
    ],
  },
  {
    // One block south of Blocc Boy: the industrial edge. The Lot Court's mural is
    // on Auto & Tires' west wall.
    name: "No Refund Road", z: 96.7,
    assets: [
      { file: R + "no-refund-road.glb", x: 0, z: 0 },
      { file: R + "westside-warehouse.glb", x: -38, z: 88.8 },
      { file: R + "lot-court.glb", x: -16.98, z: 88.8 },
      { file: R + "no-refund-auto.glb", x: -0.5, z: 88.8 },
    ],
  },
];
export const STRIP_ASSETS: Placed[] = STREETS.flatMap((s) => s.assets);
export interface StripNpc {
  id: string;
  file: string;
  /** Clip file played on a loop (in-place clips share the model's skeleton). */
  clip?: string;
  x: number; z: number; rotY: number; height: number;
}
const C = "assets/models/characters/";
export const STRIP_NPCS: StripNpc[] = [
  // Quanny is usually outside Lil Jay's, posted up and watching the block.
  { id: "quanny", file: C + "quanny.glb", clip: C + "quanny-idle.glb", x: 2.7, z: 1.5, rotY: 0.35, height: 1.8 },
];
export const STREET_LAMPS: [number, number, number][] = [
  [-38, 6.1, 2.3], [-20.5, 6.1, 2.3], [-5, 6.1, 2.3], [16.5, 6.1, 2.3],
  // Blocc Boy Blvd
  [-22, 6.1, 49.4], [-6.5, 6.1, 49.4], [-12, 6.3, 56.0],
  // Big Mouth Blvd and No Refund Road
  [-34, 6.1, -39.2], [-16, 6.1, -39.2], [-30, 6.1, 93.4], [-14, 6.1, 93.4],
  // Dirty Money Drive
  [-34, 6.1, -90.6], [-16, 6.1, -90.6],
];
export const START = { eye: [12.5, 2.3, 10.5], target: [-1.5, 2.4, 0.5] };
export const BOUNDS = { x0: -64, x1: 20, z0: -104, z1: 108 };
