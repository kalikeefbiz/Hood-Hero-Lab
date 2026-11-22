import { canonicalCharacters, residents } from "../content/characters";
import type { Character, GameState } from "../core/GameState";
import { doorNodeId, homeNodeId, npcSpotNodeId } from "./derivedNavMap";
import type { ScheduleSlot, SimNpcProfile } from "./types";

function lookupCanonical(
  id: string,
  state?: Pick<GameState, "characters">,
): Character | undefined {
  if (state?.characters[id]) return state.characters[id];
  return (
    canonicalCharacters().find((c) => c.id === id) ??
    residents().find((c) => c.id === id)
  );
}

/**
 * Returns the five independent Lil Bit Lane / Reservoir NPCs.
 * - Three canonical Reservoir characters (`quanny`, `mr-lewis`, `resident-reservoir`)
 *   sourced from engine character records.
 * - Two clearly labeled anonymous test residents (`sim-resident-lilbit-04`,
 *   `sim-resident-lilbit-06`) that do not invent permanent canon characters.
 */
export function createReservoirNpcProfiles(
  engineState?: Pick<GameState, "characters">,
): SimNpcProfile[] {
  const quanny = lookupCanonical("quanny", engineState);
  const mrLewis = lookupCanonical("mr-lewis", engineState);
  const drew = lookupCanonical("resident-reservoir", engineState);

  return [
    // 1. Quanny — canonical Blocc Boys ("blocks") figure on Lil Bit Lane.
    // Everyday presence & neighborhood rounds only; no unapproved criminal events.
    {
      id: quanny?.id ?? "quanny",
      displayName: quanny?.alias ?? quanny?.name ?? "Quanny",
      isCanonical: true,
      affiliation: quanny?.affiliation ?? "blocks",
      homeZone: quanny?.home ?? "reservoir",
      homeNodeId: homeNodeId("res-home-01"),
      homeDestinationId: "res-home-01",
      startNodeId: npcSpotNodeId("quanny"),
      walkSpeed: 1.48,
      runSpeed: 3.1,
      traits: {
        sociability: quanny?.skills.social ?? 65,
        caution: 35,
        punctuality: 55,
      },
      accentColor: "#f59e0b",
      modelId: "quanny",
      schedule: [
        {
          id: "quanny-morning-post",
          startMinute: 0,
          endMinute: 570, // 00:00 - 09:30
          targetNodeId: npcSpotNodeId("quanny"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Outside Lil Jay's Market",
          activity: "post_up",
          reason: "Watching morning foot traffic on Lil Bit Lane",
        },
        {
          id: "quanny-kirkwood-check",
          startMinute: 570,
          endMinute: 690, // 09:30 - 11:30
          targetNodeId: doorNodeId("reservoir.pawn"),
          destinationId: "reservoir.pawn",
          destinationLabel: "Reservoir Pawn & Resale",
          activity: "stroll",
          reason: "Walking down Kirkwood to check Blocc Boy Blvd",
        },
        {
          id: "quanny-midday-liljays",
          startMinute: 690,
          endMinute: 870, // 11:30 - 14:30
          targetNodeId: npcSpotNodeId("quanny"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Outside Lil Jay's Market",
          activity: "post_up",
          reason: "Back at his usual corner outside Lil Jay's",
        },
        {
          id: "quanny-lot-court",
          startMinute: 870,
          endMinute: 1020, // 14:30 - 17:00
          targetNodeId: doorNodeId("reservoir.lot-court"),
          destinationId: "reservoir.lot-court",
          destinationLabel: "Reservoir Lot Court",
          activity: "stroll",
          reason: "Heading south to see who's at the Lot Court",
        },
        {
          id: "quanny-evening-corner",
          startMinute: 1020,
          endMinute: 1320, // 17:00 - 22:00
          targetNodeId: npcSpotNodeId("quanny"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Outside Lil Jay's Market",
          activity: "post_up",
          reason: "Evening watch on Lil Bit Lane",
        },
        {
          id: "quanny-late-rest",
          startMinute: 1320,
          endMinute: 1440, // 22:00 - 24:00
          targetNodeId: homeNodeId("res-home-01"),
          destinationId: "res-home-01",
          destinationLabel: "Lil Bit Lane, dark house",
          activity: "home_rest",
          reason: "Turning in for the night",
        },
      ],
    },

    // 2. Mr. Lewis — canonical lifelong Westside resident & owner of Lil Jay's Market.
    {
      id: mrLewis?.id ?? "mr-lewis",
      displayName: mrLewis?.name ?? "Mr. Lewis",
      isCanonical: true,
      affiliation: mrLewis?.affiliation ?? null,
      homeZone: mrLewis?.home ?? "reservoir",
      homeNodeId: homeNodeId("res-home-01"),
      homeDestinationId: "res-home-01",
      startNodeId: homeNodeId("res-home-01"),
      walkSpeed: 1.22,
      runSpeed: 2.35,
      traits: {
        sociability: 78,
        caution: 82,
        punctuality: 92,
      },
      accentColor: "#38bdf8",
      schedule: [
        {
          id: "lewis-early-home",
          startMinute: 0,
          endMinute: 450, // 00:00 - 07:30
          targetNodeId: homeNodeId("res-home-01"),
          destinationId: "res-home-01",
          destinationLabel: "Lil Bit Lane, dark house",
          activity: "home_rest",
          reason: "Morning coffee before opening the market",
        },
        {
          id: "lewis-open-market",
          startMinute: 450,
          endMinute: 690, // 07:30 - 11:30
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "work_shift",
          reason: "Opening and tending Lil Jay's Market",
        },
        {
          id: "lewis-laundry-errand",
          startMinute: 690,
          endMinute: 810, // 11:30 - 13:30
          targetNodeId: doorNodeId("reservoir.laundry"),
          destinationId: "reservoir.laundry",
          destinationLabel: "Reservoir Laundry",
          activity: "shop_errand",
          reason: "Dropping off aprons at Reservoir Laundry",
        },
        {
          id: "lewis-afternoon-market",
          startMinute: 810,
          endMinute: 1140, // 13:30 - 19:00
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "work_shift",
          reason: "Afternoon counter shift at Lil Jay's",
        },
        {
          id: "lewis-evening-walk",
          startMinute: 1140,
          endMinute: 1200, // 19:00 - 20:00
          targetNodeId: homeNodeId("res-home-02"),
          destinationId: "res-home-02",
          destinationLabel: "Lil Bit Lane, tan house",
          activity: "visit_neighbor",
          reason: "Checking in on neighbors down Lil Bit Lane",
        },
        {
          id: "lewis-night-home",
          startMinute: 1200,
          endMinute: 1440, // 20:00 - 24:00
          targetNodeId: homeNodeId("res-home-01"),
          destinationId: "res-home-01",
          destinationLabel: "Lil Bit Lane, dark house",
          activity: "home_rest",
          reason: "Home for dinner and rest",
        },
      ],
    },

    // 3. Drew (`resident-reservoir`) — canonical Reservoir resident.
    {
      id: drew?.id ?? "resident-reservoir",
      displayName: drew?.name ?? "Drew",
      isCanonical: true,
      affiliation: drew?.affiliation ?? null,
      homeZone: drew?.home ?? "reservoir",
      homeNodeId: homeNodeId("res-home-02"),
      homeDestinationId: "res-home-02",
      startNodeId: homeNodeId("res-home-02"),
      walkSpeed: 1.38,
      runSpeed: 2.75,
      traits: {
        sociability: 72,
        caution: 68,
        punctuality: 75,
      },
      accentColor: "#34d399",
      schedule: [
        {
          id: "drew-morning-home",
          startMinute: 0,
          endMinute: 480, // 00:00 - 08:00
          targetNodeId: homeNodeId("res-home-02"),
          destinationId: "res-home-02",
          destinationLabel: "Lil Bit Lane, tan house",
          activity: "home_rest",
          reason: "Getting ready at home on Lil Bit Lane",
        },
        {
          id: "drew-morning-groceries",
          startMinute: 480,
          endMinute: 560, // 08:00 - 09:20
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "shop_errand",
          reason: "Picking up breakfast and groceries at Lil Jay's",
        },
        {
          id: "drew-visit-south-neighbor",
          startMinute: 560,
          endMinute: 680, // 09:20 - 11:20
          targetNodeId: homeNodeId("res-home-04"),
          destinationId: "res-home-04",
          destinationLabel: "Lil Bit Lane, tan house (south)",
          activity: "visit_neighbor",
          reason: "Crossing Lil Bit Lane to visit the neighbor across the street",
        },
        {
          id: "drew-midday-home",
          startMinute: 680,
          endMinute: 840, // 11:20 - 14:00
          targetNodeId: homeNodeId("res-home-02"),
          destinationId: "res-home-02",
          destinationLabel: "Lil Bit Lane, tan house",
          activity: "home_rest",
          reason: "Lunch and chores at home",
        },
        {
          id: "drew-afternoon-pawn",
          startMinute: 840,
          endMinute: 960, // 14:00 - 16:00
          targetNodeId: doorNodeId("reservoir.pawn"),
          destinationId: "reservoir.pawn",
          destinationLabel: "Reservoir Pawn & Resale",
          activity: "shop_errand",
          reason: "Looking for used tools on Blocc Boy Blvd",
        },
        {
          id: "drew-evening-porch",
          startMinute: 960,
          endMinute: 1110, // 16:00 - 18:30
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "stroll",
          reason: "Evening stop by Lil Jay's for cold drinks",
        },
        {
          id: "drew-night-home",
          startMinute: 1110,
          endMinute: 1440, // 18:30 - 24:00
          targetNodeId: homeNodeId("res-home-02"),
          destinationId: "res-home-02",
          destinationLabel: "Lil Bit Lane, tan house",
          activity: "home_rest",
          reason: "Winding down at home",
        },
      ],
    },

    // 4. Anonymous Test Resident A (South Side, res-home-04) — clearly labeled non-canon resident.
    {
      id: "sim-resident-lilbit-04",
      displayName: "Resident #4 (Test)",
      isCanonical: false,
      affiliation: null,
      homeZone: "reservoir",
      homeNodeId: homeNodeId("res-home-04"),
      homeDestinationId: "res-home-04",
      startNodeId: homeNodeId("res-home-04"),
      walkSpeed: 1.32,
      runSpeed: 2.6,
      traits: {
        sociability: 80,
        caution: 60,
        punctuality: 65,
      },
      accentColor: "#a78bfa",
      schedule: [
        {
          id: "res04-early-home",
          startMinute: 0,
          endMinute: 465, // 00:00 - 07:45
          targetNodeId: homeNodeId("res-home-04"),
          destinationId: "res-home-04",
          destinationLabel: "Lil Bit Lane, tan house (south)",
          activity: "home_rest",
          reason: "At home on the south side of Lil Bit Lane",
        },
        {
          id: "res04-corner-shop",
          startMinute: 465,
          endMinute: 545, // 07:45 - 09:05
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "shop_errand",
          reason: "Quick morning run across the crosswalk to Lil Jay's",
        },
        {
          id: "res04-home-host",
          startMinute: 545,
          endMinute: 700, // 09:05 - 11:40
          targetNodeId: homeNodeId("res-home-04"),
          destinationId: "res-home-04",
          destinationLabel: "Lil Bit Lane, tan house (south)",
          activity: "home_rest",
          reason: "Back on the porch hosting neighbors",
        },
        {
          id: "res04-west-stroll",
          startMinute: 700,
          endMinute: 820, // 11:40 - 13:40
          targetNodeId: homeNodeId("res-home-06"),
          destinationId: "res-home-06",
          destinationLabel: "Lil Bit Lane, dark house (south)",
          activity: "visit_neighbor",
          reason: "Walking west along Lil Bit Lane to visit #6",
        },
        {
          id: "res04-kirkwood-errand",
          startMinute: 820,
          endMinute: 990, // 13:40 - 16:30
          targetNodeId: homeNodeId("res-home-07"),
          destinationId: "res-home-07",
          destinationLabel: "Lil Bit Lane, dark house (Kirkwood)",
          activity: "stroll",
          reason: "Checking in across Kirkwood St",
        },
        {
          id: "res04-evening-home",
          startMinute: 990,
          endMinute: 1440, // 16:30 - 24:00
          targetNodeId: homeNodeId("res-home-04"),
          destinationId: "res-home-04",
          destinationLabel: "Lil Bit Lane, tan house (south)",
          activity: "home_rest",
          reason: "Home for the evening",
        },
      ],
    },

    // 5. Anonymous Test Resident B (West End, res-home-06) — clearly labeled non-canon resident.
    {
      id: "sim-resident-lilbit-06",
      displayName: "Resident #6 (Test)",
      isCanonical: false,
      affiliation: null,
      homeZone: "reservoir",
      homeNodeId: homeNodeId("res-home-06"),
      homeDestinationId: "res-home-06",
      startNodeId: homeNodeId("res-home-06"),
      walkSpeed: 1.44,
      runSpeed: 2.9,
      traits: {
        sociability: 58,
        caution: 74,
        punctuality: 70,
      },
      accentColor: "#f472b6",
      schedule: [
        {
          id: "res06-early-home",
          startMinute: 0,
          endMinute: 495, // 00:00 - 08:15
          targetNodeId: homeNodeId("res-home-06"),
          destinationId: "res-home-06",
          destinationLabel: "Lil Bit Lane, dark house (south)",
          activity: "home_rest",
          reason: "Resting at the west end of Lil Bit Lane",
        },
        {
          id: "res06-morning-walk",
          startMinute: 495,
          endMinute: 615, // 08:15 - 10:15
          targetNodeId: homeNodeId("res-home-01"),
          destinationId: "res-home-01",
          destinationLabel: "Lil Bit Lane, dark house",
          activity: "stroll",
          reason: "Morning walk east along Lil Bit Lane",
        },
        {
          id: "res06-liljays-stop",
          startMinute: 615,
          endMinute: 735, // 10:15 - 12:15
          targetNodeId: doorNodeId("reservoir.lil-jays"),
          destinationId: "reservoir.lil-jays",
          destinationLabel: "Lil Jay's Market",
          activity: "shop_errand",
          reason: "Stopping by Lil Jay's Market for lunch items",
        },
        {
          id: "res06-home-afternoon",
          startMinute: 735,
          endMinute: 900, // 12:15 - 15:00
          targetNodeId: homeNodeId("res-home-06"),
          destinationId: "res-home-06",
          destinationLabel: "Lil Bit Lane, dark house (south)",
          activity: "home_rest",
          reason: "Heading back west to drop off groceries",
        },
        {
          id: "res06-bigmouth-walk",
          startMinute: 900,
          endMinute: 1050, // 15:00 - 17:30
          targetNodeId: homeNodeId("res-home-09"),
          destinationId: "res-home-09",
          destinationLabel: "Big Mouth Blvd, dark house",
          activity: "visit_neighbor",
          reason: "Walking north up Kirkwood to Big Mouth Blvd",
        },
        {
          id: "res06-night-home",
          startMinute: 1050,
          endMinute: 1440, // 17:30 - 24:00
          targetNodeId: homeNodeId("res-home-06"),
          destinationId: "res-home-06",
          destinationLabel: "Lil Bit Lane, dark house (south)",
          activity: "home_rest",
          reason: "Returning home before dark",
        },
      ],
    },
  ];
}

export function activeSlotForMinute(
  schedule: readonly ScheduleSlot[],
  minuteOfDay: number,
): ScheduleSlot {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  for (const slot of schedule) {
    if (m >= slot.startMinute && m < slot.endMinute) return slot;
  }
  return schedule[0]!;
}
