// Physical destinations in the Reservoir, as one list with stable ids.
// Built only from cityMap.ts; it adds no positions of its own. The preview, the player
// controller and the NPC simulation (Gemini) all read this list, so they agree on where a
// place is and how close counts as "there".
import {
  DOORS, HOUSES, STOREFRONTS, NPC_SPOTS, GATHERING_SPOTS, HOUSEHOLDS,
  type Household,
} from "./cityMap";

export type AnchorKind = "place" | "home" | "storefront" | "gathering" | "npc";
export interface CityAnchor {
  /** Stable id. Places use their game location id; homes res-home-NN; stores res-store-*; people npc:<characterId>. */
  id: string;
  kind: AnchorKind;
  label: string;
  /** Game location id, or null for scenery with no gameplay yet. */
  locationId: string | null;
  /** HOUSES id, for a door-level home (pass to the location API as propertyId). */
  propertyId?: string;
  characterId?: string;
  household?: Household;
  /** Engine robbery target attached to this house, if any. */
  targetId?: string | null;
  street?: string;
  /** Where to stand (metres). */
  x: number; z: number;
  /** How close counts as arrived. */
  radius: number;
  /** Direction the doorway or person faces (radians about +Y, 0 = +Z). */
  facing: number;
}

const householdOf = new Map(HOUSEHOLDS.map((h) => [h.propertyId, h]));

export const CITY_ANCHORS: readonly CityAnchor[] = Object.freeze([
  ...DOORS.map((d): CityAnchor => ({
    id: d.locationId!, kind: "place", label: d.label, locationId: d.locationId,
    x: d.x, z: d.z, radius: d.radius, facing: d.facing,
  })),
  ...HOUSES.map((h): CityAnchor => ({
    id: h.id, kind: "home", label: householdOf.get(h.id) ? `${h.label} · ${householdLabel(householdOf.get(h.id)!)}` : h.label,
    locationId: h.locationId, propertyId: h.id, household: householdOf.get(h.id), targetId: h.targetId,
    street: h.street, x: h.x, z: h.z, radius: h.radius, facing: h.facing,
  })),
  ...STOREFRONTS.map((s): CityAnchor => ({
    id: s.id, kind: "storefront", label: s.label, locationId: s.locationId,
    x: s.x, z: s.z, radius: s.radius, facing: s.facing,
  })),
  ...GATHERING_SPOTS.map((g): CityAnchor => ({
    id: g.id, kind: "gathering", label: g.label, locationId: g.locationId,
    x: g.x, z: g.z, radius: g.radius, facing: 0,
  })),
  ...NPC_SPOTS.map((n): CityAnchor => ({
    id: `npc:${n.characterId}`, kind: "npc", label: n.characterId, locationId: n.locationId,
    characterId: n.characterId, x: n.x, z: n.z, radius: 1.6, facing: n.rotY,
  })),
]);

function householdLabel(h: Household) {
  if (h.id === "household.lewis") return "Mr. Lewis's home";
  if (h.id === "household.splash-gang") return "Splash Gang's bando";
  return h.kind === "bando" ? "bando" : h.kind === "family" ? "family home" : "lived in";
}

export const anchorById = (id: string) => CITY_ANCHORS.find((a) => a.id === id);

/** Anchors whose radius contains (x, z), nearest first. Cheap enough to call every frame (~35 anchors). */
export function anchorsAt(x: number, z: number, kinds?: readonly AnchorKind[]): CityAnchor[] {
  const hits: { a: CityAnchor; d: number }[] = [];
  for (const a of CITY_ANCHORS) {
    if (kinds && !kinds.includes(a.kind)) continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d <= a.radius) hits.push({ a, d });
  }
  return hits.sort((p, q) => p.d - q.d).map((h) => h.a);
}

/** Anchors that open the engine's location API (place doors and mapped homes). */
export const isInteractive = (a: CityAnchor) => (a.kind === "place" || a.kind === "home") && a.locationId !== null;
