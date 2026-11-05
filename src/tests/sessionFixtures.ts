import type { GameState } from "../core/GameState";
import { presenceOf } from "../board/presence";
import { LOCATIONS } from "../board/locations";
import {
  startStreetSession,
  advanceStreetSession,
  endStreetSession,
} from "../systems/StreetSessions";
import { saleMarket } from "../systems/StreetEconomy";
/** Isolate a single buyer for older economy/odds tests. Full playback/presence is covered separately.
 * The fixture explicitly positions the actor, queues one buyer, then leaves with paid AP. */
export function oneBuyer(state: GameState, zone = saleMarket(state)) {
  let s = structuredClone(state);
  const location = LOCATIONS.find((l) => l.zone === zone && l.links.street)!.id;
  s.presence = { ...presenceOf(s), location, zone };
  // Opening story dialogue is outside these isolated economy probes.
  for (const e of s.encounters) if (e.status === "active") e.status = "closed";
  const seed = s.rng;
  const result = startStreetSession(s, location);
  if (result.error) throw new Error(result.error);
  s = result.state;
  s.activeSession!.beats[0] = { kind: "buyer", seed, duration: 7200 };
  s = advanceStreetSession(s, s.activeSession!.id, 0);
  return endStreetSession(s, s.activeSession!.id);
}
