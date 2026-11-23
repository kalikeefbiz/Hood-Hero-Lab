// Isolated test state for the strip preview. It runs the real engine and Codex's real location
// API, but on a throwaway campaign that lives only in this tab's memory: nothing here reads or
// writes localStorage, the save system, or a real player's campaign.
import { newGame } from "../core/Simulation";
import { advanceDay } from "../core/TimeSystem";
import type { GameState } from "../core/GameState";
import { moveTo, presenceOf } from "../board/presence";
import {
  queryLocation,
  executeLocationAction,
  type LocationCommand,
} from "../city/LocationInteractions";
import type { CityAnchor } from "./anchors";

export type LocationQuery = ReturnType<typeof queryLocation>;
export type LocationResult = ReturnType<typeof executeLocationAction>;

export interface PresenceSource {
  /** Verified people at a game location (the strip uses Gemini's NPC simulation, living.ts). */
  peopleAt(locationId: string): string[];
}

export class PreviewSession {
  state: GameState;
  constructor(private presence: PresenceSource, seed = 2026) {
    this.state = newGame("Preview", "reservoir", seed);
  }

  get player() { return this.state.characters[this.state.playerId]; }
  get placeId() { return presenceOf(this.state).location; }

  private context(anchor: CityAnchor) {
    return {
      actorId: this.state.playerId,
      locationId: anchor.locationId!,
      propertyId: anchor.propertyId,
      peopleHere: this.presence.peopleAt(anchor.locationId!),
    };
  }

  /**
   * The player has reached an anchor. Uses the engine's normal location transition (arrival
   * hooks, encounters) on the test state. Returns false if the engine refused the move
   * (for example, a conversation is still open).
   */
  arrive(anchor: CityAnchor): boolean {
    if (!anchor.locationId) return false;
    this.state = moveTo(this.state, anchor.locationId);
    return this.placeId === anchor.locationId;
  }

  query(anchor: CityAnchor): LocationQuery {
    return queryLocation(this.state, this.context(anchor));
  }

  run(anchor: CityAnchor, command: LocationCommand): LocationResult {
    const result = executeLocationAction(this.state, this.context(anchor), command);
    if (!result.error) this.state = result.state;
    return result;
  }

  /** Text of the engine events a result created, newest last. */
  eventsOf(result: LocationResult) {
    const ids = new Set(result.changes.eventIds);
    return result.state.events.filter((e) => ids.has(e.id));
  }

  nextDay() { this.state = advanceDay(this.state); }
}
