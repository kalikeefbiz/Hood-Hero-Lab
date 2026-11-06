import { gain, gainError } from "../systems/Inventory";
import type { EncounterDefinition } from "../core/Encounter";
import { player } from "../core/GameState";
import {
  atPerson,
  safeStory,
  canQueueLife,
  trioOutcome,
  aftermathLines,
} from "../systems/StreetLife";
import { TRIO } from "../systems/StreetAccess";
const rules = { replay: "read-only" as const, expiresWithIncident: false };
export const FLACCO_GIFT: EncounterDefinition = {
  id: "flacco-six",
  type: "request",
  participants: ["flacco"],
  priority: 85,
  trigger: (s) =>
    s.streetLife &&
    !s.streetLife.legacy &&
    s.streetLife.initialDecision === "promise" &&
    !s.streetLife.giftLot &&
    s.day >= 3 &&
    !gainError(s, s.playerId, gain("nightgoods", 6, "gift", "pending-lot")) &&
    canQueueLife(s)
      ? [{ key: "once" }]
      : [],
  eligible: (
    s: import("../core/GameState").GameState,
    e: import("../core/GameState").EncounterInstance,
  ) => !["closed", "acknowledged"].includes(e.status),
  dialogue: () =>
    "Flacco catches you outside: “You know I got you, right? I heard you gave Cuz your word. Six Pink Magic. Don’t ask where I got it. Just use that to help Cuz, then come holla at me.” Free, no debt. Honest-work introduction still comes first.",
  responses: () => [
    {
      id: "receive",
      label: "Take Flacco’s six Pink Magic",
      effect: { type: "life", choice: "gift" },
      requirement: (s) =>
        safeStory(s)
          ? gainError(s, s.playerId, gain("nightgoods", 6, "gift", "pending-lot"))
          : "Flacco will wait until you are safely back in the City.",
    },
  ],
  rules,
};
export const TRIO_AFTERMATH: EncounterDefinition = {
  id: "trio-aftermath",
  type: "reaction",
  participants: TRIO,
  priority: 70,
  trigger: (s) =>
    s.streetLife &&
    !!s.streetLife.aftermathEvent &&
    s.incidents["the-chains"]?.status !== "active" &&
    TRIO.some((id) => atPerson(s, id)) &&
    canQueueLife(s)
      ? [{ key: "crew", eventId: s.streetLife.aftermathEvent }]
      : [],
  eligible: (_, e) => !["closed", "acknowledged"].includes(e.status),
  dialogue: (s) => aftermathLines[s.streetLife?.aftermath ?? trioOutcome(s)],
  responses: () => [
    {
      id: "hear",
      label: "Hear the crew out",
      effect: { type: "life", choice: "aftermath" },
      requirement: (s) =>
        safeStory(s) && TRIO.some((id) => atPerson(s, id))
          ? null
          : "Return to the crew in Rio Gabriel.",
    },
  ],
  rules,
};
// Quiet optional conversations. Each is attached to a real person, contextual and once per run.
export const LIFE_TALKS = [
  {
    key: "family",
    person: "mega",
    when: (s: Parameters<typeof safeStory>[0]) => !!s.streetLife?.workEvent,
    text: "“You got that work handled. Good. A shift is a promise too. Meet me at the Lot when your stock is ready.”",
  },
  {
    key: "lesson",
    person: "mega",
    when: (s: Parameters<typeof safeStory>[0]) =>
      s.streetLife?.lesson === "complete",
    text: "“That’s the rhythm. Buyers come, buyers leave. Carry yourself like a boss and make me proud. Don’t count money you haven’t made.”",
  },
  {
    key: "loss",
    person: "mega",
    when: (s: Parameters<typeof safeStory>[0]) =>
      s.incidents["the-chains"]?.resolution === "sold",
    text: "“Chain’s gone. I’m hurt, but you’re still my cousin. Every next move matters. Don’t write a check with your word you can’t cover.”",
  },
  {
    key: "reliable",
    person: "mega",
    when: (s: Parameters<typeof safeStory>[0]) =>
      s.street.agreements.some(
        (a) =>
          a.supplier === "mega" &&
          a.debtor === s.playerId &&
          a.status === "fulfilled",
      ),
    text: "“You paid that pack. I noticed. Each new pack keeps its own clock. Family doesn’t mean the numbers disappear.”",
  },
  {
    key: "pressure",
    person: "mega",
    when: (s: Parameters<typeof safeStory>[0]) => player(s).police >= 25,
    text: "“Too many eyes on you. I’ll still supply family, but slow your feet and watch that pressure. A boss knows when to sit.”",
  },
  {
    key: "flacco-follow",
    person: "flacco",
    when: (s: Parameters<typeof safeStory>[0]) =>
      !!s.streetLife?.giftLot &&
      s.street.transactions.some((t) => t.actor === s.playerId && t.sold > 0),
    text: "“You put it to work? Good. I ride with my Set and I ride with Cuz. Keep your word. That six wasn’t a bill.”",
  },
  {
    key: "rio-business",
    person: "contact-angels",
    when: (s: Parameters<typeof safeStory>[0]) => !!s.streetLife?.rioContact,
    text: "“Product, territory, reputation: three different things. Twelve dollars buys three days here. That doesn’t buy my trust or Pablo’s time.”",
  },
  {
    key: "quanny-continuity",
    person: "quanny",
    when: (s: Parameters<typeof safeStory>[0]) => s.quanny.business === "open",
    text: "“Don’t mix up who owes who. If I take your stock, I owe you. Your plugs are your business. Earn trust before you ask me for something dangerous.”",
  },
  {
    key: "lewis-neighbors",
    person: "mr-lewis",
    when: () => true,
    text: "“People still need groceries and a paycheck. Help a neighbor if you want. You don’t owe the street your whole life.”",
  },
  {
    key: "flacco-set",
    person: "flacco",
    when: (s: Parameters<typeof safeStory>[0]) => s.day >= 5,
    text: "“My Set means something to me. Moving product isn’t the problem. Forgetting who stands beside you is.”",
  },
];
export const LIFE_ENCOUNTERS: EncounterDefinition[] = [
  FLACCO_GIFT,
  TRIO_AFTERMATH,
  ...LIFE_TALKS.map((t) => ({
    id: `life-${t.key}`,
    type: "request" as const,
    participants: [t.person],
    priority: 50,
    trigger: () => [],
    eligible: (
      s: import("../core/GameState").GameState,
      e: import("../core/GameState").EncounterInstance,
    ) =>
      !["closed", "acknowledged"].includes(e.status) && atPerson(s, t.person),
    dialogue: () => t.text,
    responses: () => [
      {
        id: "hear",
        label: "I hear you. Back to City.",
        effect: { type: "acknowledge" as const },
      },
    ],
    rules,
  })),
];
