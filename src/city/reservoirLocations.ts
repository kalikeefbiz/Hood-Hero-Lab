import { locationById } from "../board/locations";
import { DOORS, HOUSES } from "../strip/cityMap";

export const RESERVOIR_LOCATION_IDS = Object.freeze([
  ...new Set(
    [...DOORS, ...HOUSES].flatMap(({ locationId }) =>
      locationId ? [locationId] : [],
    ),
  ),
]);

/** The map supplies IDs and property assignments. The legacy registry supplies gameplay links. */
export function resolveReservoirLocation(id: string) {
  const location = RESERVOIR_LOCATION_IDS.includes(id) && locationById(id);
  if (!location || location.zone !== "reservoir") return null;
  return {
    id: location.id,
    name: location.name,
    zone: location.zone,
    links: structuredClone(location.links),
    properties: HOUSES.filter((home) => home.locationId === id).map(
      ({ id, label, street, targetId }) => ({ id, label, street, targetId }),
    ),
  };
}
