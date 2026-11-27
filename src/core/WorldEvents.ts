import { locationById } from "../board/locations";
import type { FactionId, GameState, ID, ZoneId } from "./GameState";

export interface WorldEventDetails {
  kind:
    | "crime"
    | "disturbance"
    | "violence"
    | "injury"
    | "death"
    | "arrest"
    | "release"
    | "faction-development"
    | "territory-change";
  zone?: ZoneId;
  locationId?: ID;
  subjectId?: ID;
  sourceEventId?: ID;
  transition?:
    | "hospital-admission"
    | "hospital-discharge"
    | "custody-start"
    | "custody-end";
  previousController?: FactionId | null;
  controller?: FactionId | null;
}

export function eventPlace(
  locationId?: string,
): Pick<WorldEventDetails, "zone" | "locationId"> {
  const location =
    locationId === undefined ? undefined : locationById(locationId);
  return location ? { locationId: location.id, zone: location.zone } : {};
}

export function eventCause(s: GameState, sourceEventId: string) {
  const source = s.events.find((event) => event.id === sourceEventId);
  if (!source) return {};
  const { zone, locationId } = source.world ?? {};
  return {
    sourceEventId,
    ...(zone ? { zone } : {}),
    ...(locationId ? { locationId } : {}),
  };
}
