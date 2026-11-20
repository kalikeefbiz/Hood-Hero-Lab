// World layout for the Reservoir strip (metres, Y up). The street runs along X;
// storefronts and houses face +Z toward it. Lil Jay's sits on the corner.
export interface Placed { file: string; x: number; z: number; rotY?: number }
const H = "assets/strip/";
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
];
export const STRIP_NPCS = [
  // Quanny is usually outside Lil Jay's.
  { file: "assets/models/characters/quanny.glb", x: 2.7, z: 1.5, rotY: -0.6, height: 1.8 },
];
export const STREET_LAMPS: [number, number, number][] = [
  [-38, 6.1, 2.3], [-20.5, 6.1, 2.3], [-5, 6.1, 2.3], [16.5, 6.1, 2.3],
];
export const START = { eye: [12.5, 2.3, 10.5], target: [-1.5, 2.4, 0.5] };
export const BOUNDS = { x0: -46, x1: 20, z0: -12, z1: 18 };
