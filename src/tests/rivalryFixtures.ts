import { newGame } from "../core/Simulation";
import { player } from "../core/GameState";
import { syncTerritory } from "../systems/Territory";
import { connect } from "../systems/Relationships";

// A controlled late-campaign balance, not a scripted takeover: real resolver and seven-day hold.
export function threatenedReservoir() {
  const s = newGame("Local organizer", "reservoir", 17),
    p = player(s);
  s.day = 20;
  p.affiliation = "blocks";
  p.authority = 45;
  p.wallet.clean = 20000;
  p.legitimacy = 60;
  p.neighborhoodStanding.reservoir = 10;
  connect(s, p.id, "contact-blocks");
  s.characters["contact-blocks"].relationships[p.id].trust = 60;
  const t = s.strategic.territories.reservoir;
  t.factions.angels = {
    presence: 88,
    influence: 90,
    economy: 80,
    support: 65,
    pressure: 18,
  };
  t.factions.blocks = {
    presence: 65,
    influence: 62,
    economy: 65,
    support: 60,
    pressure: 0,
  };
  syncTerritory(s, "reservoir");
  return s;
}
