import { newRobberyCareer } from "../systems/RobberyCareerState";
import { newInventoryState } from "../systems/Inventory";
import { newStreetLife } from "../systems/StreetLifeState";
import { skillsOf } from "../systems/Skills";
import { equipmentOf } from "../systems/Equipment";
import { beginQuanny } from "../systems/Quanny";
import { presenceOf } from "../board/presence";
import { newQuannyState } from "../systems/QuannyState";
import { newDangerState } from "../systems/DangerState";
import { syncTerritory, newStrategy } from "../systems/Territory";
import { newStreetState } from "../systems/StreetEconomy";
import { GAME_SAVE_VERSION, player, type GameState, type ZoneId } from "./GameState";
import { ZONES } from "../content/city";
import { FACTIONS } from "../content/factions";
import {
  character,
  canonicalCharacters,
  residents,
} from "../content/characters";
import { initializeRelationships, initializeResidentRelationships } from "../systems/Relationships";
import { missingReservoirResidents } from "../content/reservoirResidents";
import { openingIncident } from "../content/openingIncident";
import { syncEncounters } from "../systems/EncounterLifecycle";
import { BALANCE } from "../content/balance";
export function newGame(
  name: string,
  home: ZoneId,
  seed = 2026,
  { openCity = false } = {},
): GameState {
  if (!ZONES[home]) throw new Error("Unknown neighborhood");
  const p = character(
    "player",
    name.trim().slice(0, 28) || "Resident",
    home,
    null,
    "Unaffiliated. Make a living, build trust, find your place.",
    {
      influence: 0,
      wallet: { clean: BALANCE.startingCash, illicit: 0 },
      skills: { social: 45, work: 45, recovery: 35 },
    },
  );
  const s: GameState = {
    version: GAME_SAVE_VERSION,
    robberyCareer: newRobberyCareer(),
    inventory: newInventoryState(),
    residences: {},
    streetLife: newStreetLife(openCity),
    quanny: newQuannyState(),
    danger: newDangerState(seed),
    strategic: newStrategy({ zones: ZONES, factions: FACTIONS }),
    street: newStreetState(),
    day: 1,
    ap: BALANCE.dailyAP,
    cycleElapsedMs: 0,
    skipEndDayWarning: false,
    rng: seed >>> 0,
    nextId: 1,
    playerId: "player",
    characters: Object.fromEntries(
      [
        p,
        ...canonicalCharacters().filter(
          (c) => !["quanny", "mr-lewis"].includes(c.id),
        ),
        ...residents(),
        ...canonicalCharacters().filter((c) =>
          ["quanny", "mr-lewis"].includes(c.id),
        ),
      ].map((c) => [c.id, c]),
    ),
    zones: structuredClone(ZONES),
    factions: structuredClone(FACTIONS),
    properties: {},
    incidents: {},
    events: [],
    commitments: [],
    assignments: [],
    crewOffers: [],
    encounters: [],
    acknowledgedEvents: [],
    crew: { members: ["flacco"], capacity: 1, successor: null },
    employment: [],
    employmentSearch: { player: { eligibleDay: 1 } },
    assets: [],
    ledger: [],
    progression: { cleanEarned: 0, illicitEarned: 0, jobs: 0, retired: false },
    end: null,
  };
  for (const z of Object.values(s.zones)) syncTerritory(s, z.id);
  for (const c of Object.values(s.characters)) { skillsOf(c); equipmentOf(c); c.inventory = {slots: []}; }
  initializeRelationships(s);
  registerReservoirResidents(s);
  if (!openCity) openingIncident(s);
  syncEncounters(s);
  return s;
}

/** The player has entered/resumed gameplay. World construction and board inspection stay read-only. */
export function enterGameplay(state: GameState): GameState {
  if (
    state.quanny.met ||
    state.end ||
    player(state).status !== "active" ||
    presenceOf(state).zone !== "reservoir"
  )
    return state;
  const s = structuredClone(state);
  if (!beginQuanny(s, presenceOf(s).location, "gameplay")) return state;
  syncEncounters(s);
  return s;
}

/** Add missing canonical identities to new campaigns and compatible pre-roster saves. */
export function registerReservoirResidents(s: GameState) {
  const added = new Set<string>();
  for (const resident of missingReservoirResidents(s.characters)) {
    skillsOf(resident);
    equipmentOf(resident);
    resident.inventory = { slots: [] };
    s.characters[resident.id] = resident;
    added.add(resident.id);
  }
  initializeResidentRelationships(s, added);
}
