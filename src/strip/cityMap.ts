// Walkable map of the Reservoir for gameplay wiring (Claude owns this file; Codex reads it).
// Units: metres, three.js world coords (x east, z south, y up), same as layout.ts.
// Regenerate the wall rectangles when buildings move (art/reservoir/README.md, "Map data").
// Check it visually: open strip.html?map — walls draw red, fences orange, doors green.

export interface Rect { id: string; x0: number; x1: number; z0: number; z1: number }
export interface Segment { id: string; ax: number; az: number; bx: number; bz: number }
export interface Door {
  /** Game location id from src/board/locations.ts, or null for scenery/unassigned. */
  locationId: string | null;
  label: string;
  /** Where the player stands to use it (on the sidewalk / at the gate). */
  x: number; z: number;
  /** Tap / proximity radius in metres. */
  radius: number;
  /** Direction the doorway faces, radians about +Y (0 = +Z). */
  facing: number;
}
export interface NpcSpot { characterId: string; x: number; z: number; rotY: number }

/** Building footprints (everything above 1.6 m). Solid: the player can't enter them. */
export const WALLS: Rect[] = [
  { id: "lil-jays", x0: -4.04, x1: 4.79, z0: -10.05, z1: 0.95 },  // Lil Bit Lane
  { id: "house-dark", x0: -14.05, x1: -6.2, z0: -13.75, z1: -2.0 },  // Lil Bit Lane
  { id: "house-tan", x0: -23.5, x1: -15.25, z0: -15.3, z1: -2.03 },  // Lil Bit Lane
  { id: "house-abandoned", x0: -32.3, x1: -24.55, z0: -14.5, z1: -2.08 },  // Lil Bit Lane
  { id: "house-tan", x0: -6.75, x1: 1.5, z0: 17.83, z1: 31.1 },  // Lil Bit Lane
  { id: "house-abandoned", x0: -17.45, x1: -9.7, z0: 17.88, z1: 30.3 },  // Lil Bit Lane
  { id: "house-dark", x0: -29.8, x1: -21.95, z0: 17.9, z1: 29.65 },  // Lil Bit Lane
  { id: "house-dark", x0: 17.7, x1: 25.55, z0: 17.9, z1: 29.65 },  // Lil Bit Lane
  { id: "reservoir-barber-shop", x0: -25.64, x1: -19.56, z0: 34.75, z1: 45.11 },  // Blocc Boy Boulevard
  { id: "reservoir-liquor-deli", x0: -18.36, x1: -10.84, z0: 33.55, z1: 45.55 },  // Blocc Boy Boulevard
  { id: "reservoir-beauty-supply", x0: -10.43, x1: -3.57, z0: 33.75, z1: 45.4 },  // Blocc Boy Boulevard
  { id: "reservoir-pawn", x0: -2.66, x1: 3.66, z0: 34.75, z1: 45.33 },  // Blocc Boy Boulevard
  { id: "reservoir-water-tower", x0: -74.79, x1: -61.21, z0: -42.69, z1: -29.11 },  // Big Mouth Boulevard
  { id: "boarded-house", x0: -54.27, x1: -45.44, z0: -57.45, z1: -45.75 },  // Big Mouth Boulevard
  { id: "house-dark-two-story", x0: -42.58, x1: -35.45, z0: -57.3, z1: -45.7 },  // Big Mouth Boulevard
  { id: "house-dark", x0: -33.05, x1: -25.2, z0: -57.55, z1: -45.8 },  // Big Mouth Boulevard
  { id: "reservoir-laundry", x0: -3.68, x1: 3.68, z0: -107.25, z1: -94.67 },  // Dirty Money Drive
  { id: "house-dark", x0: -14.05, x1: -6.2, z0: -108.95, z1: -97.2 },  // Dirty Money Drive
  { id: "house-dark-two-story", x0: -34.08, x1: -26.95, z0: -108.7, z1: -97.1 },  // Dirty Money Drive
  { id: "house-tan-bungalow", x0: -44.86, x1: -37.96, z0: -109.3, z1: -98.75 },  // Dirty Money Drive
  { id: "house-duplex-721", x0: -9.82, x1: -0.18, z0: -78.0, z1: -67.1 },  // Dirty Money Drive
  { id: "house-abandoned", x0: -29.95, x1: -22.2, z0: -77.62, z1: -65.2 },  // Dirty Money Drive
  { id: "house-tan-bungalow", x0: -50.54, x1: -43.64, z0: -75.85, z1: -65.3 },  // Dirty Money Drive
  { id: "westside-warehouse", x0: -44.08, x1: -31.92, z0: 66.75, z1: 89.33 },  // No Refund Road
  { id: "no-refund-auto", x0: -4.9, x1: 3.9, z0: 76.75, z1: 89.9 },  // No Refund Road
];

/** Thin solid lines: chain-link fences you can see through but not walk through. */
export const FENCES: Segment[] = [
  // Lot Court: open gate in the middle of the front fence
  { id: "lot-court-front-w", ax: -27.98, az: 88.7, bx: -18.83, bz: 88.7 },
  { id: "lot-court-front-e", ax: -15.13, az: 88.7, bx: -5.98, bz: 88.7 },
  { id: "lot-court-west", ax: -27.98, az: 88.7, bx: -27.98, bz: 75.8 },
  { id: "lot-court-back", ax: -27.98, az: 75.8, bx: -5.98, bz: 75.8 },
  { id: "lot-court-east", ax: -5.98, az: 75.8, bx: -5.98, bz: 88.7 },
];

const S = Math.PI; // facing -Z (north-facing fronts on a street's south side)
/** Game locations standing in the city, at their doors. */
export const DOORS: Door[] = [
  { locationId: "reservoir.lil-jays", label: "Lil Jay's Market", x: 0.0, z: 1.9, radius: 2.2, facing: 0 },
  { locationId: "reservoir.pawn", label: "Reservoir Pawn & Resale", x: 0.52, z: 46.2, radius: 2.0, facing: 0 },
  { locationId: "reservoir.warehouse", label: "Westside Warehouse", x: -33.85, z: 91.2, radius: 2.4, facing: 0 },
  { locationId: "reservoir.lot-court", label: "Reservoir Lot Court", x: -16.98, z: 89.5, radius: 2.4, facing: 0 },
  { locationId: "reservoir.laundry", label: "Reservoir Laundry", x: 0.0, z: -94.0, radius: 2.0, facing: 0 },
  { locationId: "reservoir.boarded-house", label: "Boarded house (327)", x: -49.9, z: -43.3, radius: 2.0, facing: 0 },
  { locationId: "reservoir.water-tower", label: "Reservoir Water Tower", x: -60.2, z: -35.9, radius: 2.6, facing: Math.PI / 2 },
];

/** Storefronts that are scenery for now. Give one a locationId to make it a place. */
export const STOREFRONTS: Door[] = [
  { locationId: null, label: "Reservoir Barber Shop", x: -22.6, z: 45.9, radius: 2.0, facing: 0 },
  { locationId: null, label: "Reservoir Liquor & Deli", x: -14.6, z: 46.4, radius: 2.0, facing: 0 },
  { locationId: null, label: "Reservoir Beauty Supply", x: -6.95, z: 46.2, radius: 2.0, facing: 0 },
  { locationId: null, label: "No Refund Auto & Tires", x: -2.32, z: 90.9, radius: 2.0, facing: 0 },
];

/**
 * Reservoir Homes: the section of properties a player can case and break into.
 * Every house in the city belongs to it (`locationId` is always "reservoir.homes"); `id` says which
 * one. `targetId` links a house to an existing engine target in src/content/robberyCareer.ts
 * (home.reservoir.1..3). A null `targetId` is a real, enterable-looking house with no job attached
 * yet: Codex/content can attach new targets to it without moving anything. Other hoods follow the
 * same shape (southside.homes, eastside.homes, ...).
 */
export interface HomeProperty extends Door {
  /** Stable id for this property. Never reuse; saves may point at it. */
  id: string;
  street: string;
  /** What it looks like, for picking targets that fit ("dark", "tan", "abandoned", "two-story", "duplex", "bungalow"). */
  look: string;
  /** Engine robbery target (src/content/robberyCareer.ts) or null if none is attached yet. */
  targetId: string | null;
}
const HOME = "reservoir.homes";
export const HOUSES: HomeProperty[] = [
  // Lil Bit Lane, north side (fronts face south)
  { id: "res-home-01", street: "Lil Bit Lane", look: "dark", targetId: null, locationId: HOME, label: "Lil Bit Lane, dark house", x: -10.1, z: -1.0, radius: 1.8, facing: 0 },
  { id: "res-home-02", street: "Lil Bit Lane", look: "tan", targetId: "home.reservoir.1", locationId: HOME, label: "Lil Bit Lane, tan house", x: -19.4, z: -1.0, radius: 1.8, facing: 0 },
  { id: "res-home-03", street: "Lil Bit Lane", look: "abandoned", targetId: null, locationId: HOME, label: "Lil Bit Lane, abandoned house", x: -28.4, z: -1.0, radius: 1.8, facing: 0 },
  // Lil Bit Lane, south side (fronts face north)
  { id: "res-home-04", street: "Lil Bit Lane", look: "tan", targetId: null, locationId: HOME, label: "Lil Bit Lane, tan house (south)", x: -2.6, z: 16.9, radius: 1.8, facing: S },
  { id: "res-home-05", street: "Lil Bit Lane", look: "abandoned", targetId: null, locationId: HOME, label: "Lil Bit Lane, abandoned house (south)", x: -13.6, z: 16.9, radius: 1.8, facing: S },
  { id: "res-home-06", street: "Lil Bit Lane", look: "dark", targetId: null, locationId: HOME, label: "Lil Bit Lane, dark house (south)", x: -25.9, z: 16.9, radius: 1.8, facing: S },
  { id: "res-home-07", street: "Lil Bit Lane", look: "dark", targetId: null, locationId: HOME, label: "Lil Bit Lane, dark house (Kirkwood)", x: 21.6, z: 16.9, radius: 1.8, facing: S },
  // Big Mouth Blvd (south side; the boarded house at x -49.9 is its own place, reservoir.boarded-house)
  { id: "res-home-08", street: "Big Mouth Blvd", look: "dark two-story", targetId: "home.reservoir.3", locationId: HOME, label: "Big Mouth Blvd, dark two-story", x: -39.0, z: -43.3, radius: 1.8, facing: 0 },
  { id: "res-home-09", street: "Big Mouth Blvd", look: "dark", targetId: null, locationId: HOME, label: "Big Mouth Blvd, dark house", x: -29.1, z: -43.3, radius: 1.8, facing: 0 },
  // Dirty Money Dr, south side (fronts face south)
  { id: "res-home-10", street: "Dirty Money Dr", look: "dark", targetId: null, locationId: HOME, label: "Dirty Money Dr, dark house", x: -10.1, z: -94.7, radius: 1.8, facing: 0 },
  { id: "res-home-11", street: "Dirty Money Dr", look: "dark two-story", targetId: null, locationId: HOME, label: "Dirty Money Dr, dark two-story", x: -30.5, z: -94.7, radius: 1.8, facing: 0 },
  { id: "res-home-12", street: "Dirty Money Dr", look: "tan bungalow", targetId: "home.reservoir.2", locationId: HOME, label: "Dirty Money Dr, tan bungalow", x: -41.4, z: -94.7, radius: 1.8, facing: 0 },
  // Dirty Money Dr, north side (fronts face north)
  { id: "res-home-13", street: "Dirty Money Dr", look: "duplex 721", targetId: null, locationId: HOME, label: "Dirty Money Dr, duplex 721", x: -7.2, z: -79.9, radius: 1.6, facing: S },
  { id: "res-home-14", street: "Dirty Money Dr", look: "duplex 723", targetId: null, locationId: HOME, label: "Dirty Money Dr, duplex 723", x: -2.8, z: -79.9, radius: 1.6, facing: S },
  { id: "res-home-15", street: "Dirty Money Dr", look: "abandoned", targetId: null, locationId: HOME, label: "Dirty Money Dr, abandoned house", x: -26.1, z: -79.9, radius: 1.8, facing: S },
  { id: "res-home-16", street: "Dirty Money Dr", look: "tan bungalow", targetId: null, locationId: HOME, label: "Dirty Money Dr, tan bungalow (south)", x: -47.1, z: -79.9, radius: 1.8, facing: S },
];

/** Where people stand. Quanny posts up outside Lil Jay's. */
export const NPC_SPOTS: NpcSpot[] = [
  { characterId: "quanny", x: 2.7, z: 1.5, rotY: 0.35 },
];

/** Player spawn on Lil Bit Lane's sidewalk, by Lil Jay's. */
export const PLAYER_START = { x: 6.0, z: 2.4, rotY: -Math.PI / 2 };

/** Walkable area: everything inside this box that isn't a wall or fence. */
export const WALK_BOUNDS = { x0: -62, x1: 22, z0: -112, z1: 112 };
