// World layout for the Reservoir strip (metres, Y up). The street runs along X;
// storefronts and houses face +Z toward it. Lil Jay's sits on the corner.
export interface Placed { file: string; x: number; z: number; rotY?: number }
const H = "assets/strip/";
const R = "assets/reservoir/";
export const STRIP_ASSETS: Placed[] = [
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
  // Blocc Boy Boulevard, one block south down Kirkwood St. North-side storefronts
  // face the boulevard (+Z) with their fronts on z = 44.8. West to east:
  // Reservoir Barber Shop, Reservoir Liquor & Deli, Reservoir Beauty Supply,
  // Reservoir Pawn & Resale on the Kirkwood corner. Parking lot at the west end.
  { file: R + "blocc-boy-blvd.glb", x: 0, z: 0 },
  { file: R + "reservoir-barber-shop.glb", x: -22.6, z: 44.8 },
  { file: R + "reservoir-liquor-deli.glb", x: -14.6, z: 44.8 },
  { file: R + "reservoir-beauty-supply.glb", x: -7.0, z: 44.8 },
  { file: R + "reservoir-pawn.glb", x: 0.5, z: 44.8 },
];
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
];
export const START = { eye: [12.5, 2.3, 10.5], target: [-1.5, 2.4, 0.5] };
export const BOUNDS = { x0: -46, x1: 20, z0: -12, z1: 62 };
