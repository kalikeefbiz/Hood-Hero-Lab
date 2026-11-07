import type { ZoneId } from "../core/GameState";
import type { PhysicalItemId } from "./inventory";
/** All GOAL013 economic/risk tuning; quoted values are retail, pawn applies ONE ratio. */
export const ROBBERY_BALANCE = {
  ordinaryBonusChance: 0.3,
  pettyChainChance: 0.02,
  liquorGoodsChance: 0.55,
  rareBonusChance: 0.12,
  approachScore: 0.06,
  playerEquipmentScale: 0.01,
  partialCash: 0.6,
  sellBackNotoriety: 8,
  crewClaimDays: 5,
  sourceTrust: 45,
  stolenUnitValue: 28,
  initiativeDays: 10,
  initiativeTrust: 55,
  homeCooldown: 5,
  localCooldown: 1,
  criminalCooldown: 7,
  crewShare: 0.25,
  pawnRatio: 0.63,
  pawnHeatPenalty: 0.05,
  sellBackRatio: 0.72,
  civilianCash: [25, 75],
  homeCash: [60, 140],
  liquorCash: [125, 225],
  commercialCash: [400, 750],
  criminalCash: [90, 240],
  sourceStock: 4,
  sourceJewelry: 1,
  baseChance: 0.65,
  minimumChance: 0.15,
  maximumChance: 0.9,
  pressurePenalty: 0.035,
  crewCombatBonus: 0.035,
  crewEquipmentScale: 0.012,
  arrestRisk: 0.16,
  injuryRisk: 0.12,
  criminalRisk: 0.17,
  downtownRisk: 0.1,
  attemptHeat: 8,
  completionHeat: 10,
  searchHeat: 3,
  repeatHeat: 3,
  extortionMin: 0.1,
  extortionMax: 0.2,
  extortionFrequency: 4,
  retail: {
    phone: [40, 70],
    "plain-chain": [190, 250],
    jewelry: [240, 500],
    "high-chain": [650, 950],
    console: [170, 260],
    pc: [280, 440],
    art: [550, 1250],
    smokes: [8, 12],
    booze: [12, 18],
  },
} as const;
export type CareerKind = "strong-arm" | "home" | "liquor" | "store";
export interface RobberyTarget {
  id: string;
  kind: CareerKind;
  location: string;
  zone: ZoneId;
  name: string;
  circumstance: string;
  risk: number;
  pool: PhysicalItemId[];
  lead: boolean;
}
const street = [
  [
    "downtown",
    "downtown.designer-drop",
    "Shopping-area visitor",
    "A shopper notices the police across the strip.",
  ],
  [
    "rio",
    "rio.courtyard",
    "Courtyard visitor",
    "A courier stops to speak with a neighbor.",
  ],
  [
    "south",
    "south.court",
    "Court visitor",
    "A spectator walks away from the game.",
  ],
  [
    "reservoir",
    "reservoir.lot-court",
    "Lot-court visitor",
    "A visitor waits beside the benches.",
  ],
  [
    "nawf",
    "nawf.el-station",
    "Station visitor",
    "A commuter waits below the tracks.",
  ],
] as const;
export const ROBBERY_TARGETS: RobberyTarget[] = street.map(
  ([zone, location, name, circumstance]) => ({
    id: `street.${zone}`,
    kind: "strong-arm",
    zone,
    location,
    name,
    circumstance,
    risk: zone === "downtown" ? 0.15 : 0,
    pool: ["phone", "smokes", "booze", "plain-chain"],
    lead: false,
  }),
);
const blocks = [
  [
    "rio",
    "rio.courtyard",
    ["Blue stucco", "Corner bungalow", "Courtyard end house"],
  ],
  [
    "south",
    "south.rowhouses",
    ["Red brick stoop", "Narrow rowhouse", "End terrace"],
  ],
  [
    "reservoir",
    "reservoir.homes",
    ["Weathered porch", "Green bungalow", "Old collector’s house"],
  ],
  [
    "nawf",
    "nawf.projects",
    ["Trackside house", "Avenue duplex", "Back-lane house"],
  ],
] as const;
for (const [zone, location, names] of blocks)
  names.forEach((name, i) =>
    ROBBERY_TARGETS.push({
      id: `home.${zone}.${i + 1}`,
      kind: "home",
      zone,
      location,
      name,
      circumstance: [
        "A neighbor is still outside.",
        "The rooms hold more than you can carry.",
        "An occupant may return early.",
      ][i],
      risk: i * 0.04,
      pool:
        i === 0
          ? ["console", "phone", "jewelry"]
          : i === 1
            ? ["pc", "console", "plain-chain"]
            : ["jewelry", "pc", "art"],
      lead: true,
    }),
  );
for (const zone of ["rio", "south"] as const)
  ROBBERY_TARGETS.push({
    id: `liquor.${zone}`,
    kind: "liquor",
    zone,
    location: `${zone}.liquor`,
    name: zone === "rio" ? "Rio Gabriel Liquor" : "Back Street Liquor",
    circumstance:
      "The clerk and customers can identify you. Leave before the confrontation grows.",
    risk: 0.1,
    pool: ["smokes", "booze"],
    lead: false,
  });
ROBBERY_TARGETS.push({
  id: "commercial.designer",
  kind: "store",
  zone: "downtown",
  location: "downtown.designer-drop",
  name: "Designer Drop stock collection",
  circumstance:
    "Your partner handles the collection while you coordinate the exit. Police patrol the commercial strip.",
  risk: 0.15,
  pool: ["jewelry", "console", "high-chain"],
  lead: true,
});
export const robberyTarget = (id: string) =>
  ROBBERY_TARGETS.find((t) => t.id === id);
export const PAWN_LOCATION = "reservoir.pawn";
