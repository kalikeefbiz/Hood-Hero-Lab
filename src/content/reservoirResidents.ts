import { character } from "./characters";
import type { Character, FactionId } from "../core/GameState";

interface ResidentDefinition {
  id: string;
  name: string;
  affiliation: FactionId | null;
  description: string;
  traits?: Partial<Character["traits"]>;
  occupation?: string;
  splash?: true;
}

const additions: readonly ResidentDefinition[] = [
  {
    id: "baby-reek",
    name: "Baby Reek",
    affiliation: "blocks",
    splash: true,
    description: "Quanny’s closest associate. Steady and loyal.",
    traits: { loyalty: 85, risk: 30 },
  },
  {
    id: "tay-savage",
    name: "Tay Savage",
    affiliation: "blocks",
    splash: true,
    description: "Impulsive and concerned with their reputation.",
    traits: { ambition: 75, risk: 60 },
  },
  {
    id: "lil-deuce",
    name: "Lil Deuce",
    affiliation: "blocks",
    splash: true,
    description: "A young member focused on money and status.",
    traits: { ambition: 70 },
  },
  {
    id: "k3",
    name: "K3",
    affiliation: "blocks",
    splash: true,
    description: "Quiet and observant.",
  },
  {
    id: "ty-ty",
    name: "Ty Ty",
    affiliation: "blocks",
    description:
      "Personable neighborhood hustler who knows everyone and can make introductions.",
  },
  {
    id: "mookie",
    name: "Mookie",
    affiliation: "blocks",
    description: "Established earner and income-first business contact.",
  },
  {
    id: "big-riq",
    name: "Big Riq",
    affiliation: "blocks",
    description: "A respected veteran whose opinion carries informal weight.",
  },
  {
    id: "dooda",
    name: "Dooda",
    affiliation: "blocks",
    description: "A young seller competing over customers and corners.",
  },
  {
    id: "j-money",
    name: "J-Money",
    affiliation: "blocks",
    description: "Focuses on boosting and reselling stolen goods.",
  },
  {
    id: "bam",
    name: "Bam",
    affiliation: "blocks",
    description: "Aggressive and inclined to take slights personally.",
    traits: { risk: 60 },
  },
  {
    id: "trell",
    name: "Trell",
    affiliation: "blocks",
    description: "A quiet and dependable neighborhood operator.",
  },
  {
    id: "boogie",
    name: "Boogie",
    affiliation: "blocks",
    description: "Outgoing and flashy, with an eye for status and spending.",
    traits: { ambition: 70 },
  },
  {
    id: "nook",
    name: "Nook",
    affiliation: "blocks",
    description: "A low-profile hustler with a small circle.",
  },
  {
    id: "miss-denise",
    name: "Miss Denise",
    affiliation: null,
    occupation: "Laundry operator",
    description:
      "Longtime local who operates the laundry and knows local families.",
  },
  {
    id: "unc-ray",
    name: "Unc Ray",
    affiliation: null,
    occupation: "Barber shop operator",
    description:
      "Runs the barber shop and knows several generations of Blocc Boys.",
  },
  {
    id: "ms-tonya",
    name: "Ms. Tonya",
    affiliation: null,
    occupation: "Beauty supply owner",
    description:
      "Financially strained and determined to keep her beauty supply business open.",
  },
  {
    id: "nell-price",
    name: "Darnell “Nell” Price",
    affiliation: null,
    occupation: "Pawn shop operator",
    description: "Business-minded and cautious with strangers.",
    traits: { risk: 25 },
  },
  {
    id: "mr-harris",
    name: "Mr. Harris",
    affiliation: null,
    occupation: "Warehouse manager",
    description: "Manages the warehouse and hires local workers when possible.",
  },
  {
    id: "reggie-auto",
    name: "Reggie",
    affiliation: null,
    occupation: "Mechanic",
    description:
      "Works with No Refund Auto & Tires and wants to keep it running.",
  },
  {
    id: "keisha-reservoir",
    name: "Keisha",
    affiliation: null,
    occupation: "Works an ordinary job",
    description:
      "A young resident with local family ties who avoids gang involvement.",
  },
  {
    id: "miss-pat",
    name: "Miss Pat",
    affiliation: null,
    description:
      "An older homeowner who remembers the Westside’s better years.",
  },
  {
    id: "shay-reservoir",
    name: "Shay",
    affiliation: null,
    description:
      "A young woman raising a child alongside relatives, with a life of her own.",
  },
];

const canon = new Map(
  additions.map((definition) => [definition.id, definition]),
);

export const isReservoirResidentAddition = (id: string) => canon.has(id);

export function missingReservoirResidents(
  characters: Readonly<Record<string, Character>>,
) {
  return additions
    .filter(({ id }) => !Object.hasOwn(characters, id))
    .map(({ id, name, affiliation, description, traits }) => {
      const resident = character(
        id,
        name,
        "reservoir",
        affiliation,
        description,
      );
      // Canon describes dispositions in words. All numeric gameplay values are provisional.
      Object.assign(resident.traits, traits);
      return resident;
    });
}

export function reservoirIdentity(
  actor: Pick<Character, "id" | "affiliation">,
) {
  const entry = canon.get(actor.id);
  return {
    internalSocialGroup:
      actor.affiliation === "blocks" && (actor.id === "quanny" || entry?.splash)
        ? ("splash-gang" as const)
        : null,
    occupation:
      entry?.occupation ??
      (actor.id === "mr-lewis" ? "Market owner and operator" : null),
    provisionalGameplayDefaults: !!entry,
  };
}
