import type { EncounterDefinition, EncounterResponse } from "../core/Encounter";
import type { EncounterInstance, GameState } from "../core/GameState";
import {
  activityName,
  attendError,
  availability,
  cooperation,
  offerError,
  requestError,
} from "../systems/CrewAgency";
const member = (s: GameState, e: EncounterInstance) =>
  s.characters[e.participants[0]];
const offer = (s: GameState, e: EncounterInstance) =>
  s.crewOffers.find((o) => o.id === e.crewOfferId);
export const CREW_CONVERSATION: EncounterDefinition = {
  id: "crew-conversation",
  type: "request",
  participants: [],
  priority: 75,
  trigger: () => [],
  eligible: (s, e) =>
    s.crew.members.includes(e.participants[0]) &&
    !["closed", "acknowledged"].includes(e.status),
  expression: () => "strategizing",
  dialogue: (s, e) => {
    const c = member(s, e);
    return `${availability(s, c) ?? "I've got some time. What did you have in mind?"} ${c.relationships[s.playerId]?.trust >= 55 ? "We've got history. Just remember I've got my own limits." : "Let's be straight about what we're asking of each other."}`;
  },
  responses: (s, e) => {
    const c = member(s, e);
    const rows: EncounterResponse[] = [];
    for (const a of s.assignments.filter(
      (a) => a.member === c.id && a.status === "accepted",
    ))
      rows.push({
        id: `attend-${a.id}`,
        label: `Meet up as planned · day ${a.dueDay} · 1 AP`,
        effect: { type: "crew", choice: "attend", assignmentId: a.id },
        requirement: () => attendError(s, a.id),
      });
    for (const activity of [
      "work",
      "information",
      "social",
      "partner-gig",
      "partner-crime",
    ] as const) {
      const decision = cooperation(s, c, activity);
      const detail =
        activity === "work"
          ? `$12 set aside for their time · could bring in $${24 + Math.floor(c.skills.work / 6)} tomorrow if the work gets done`
          : activity === "partner-gig"
            ? "counts as your gig for the day · you both get paid"
            : activity === "partner-crime"
              ? "needs product on you · they take 15% of what sells · you both take the risk"
              : activity === "social"
                ? "time together; you both unwind"
                : "they’ll share what they know, if they want to";
      rows.push({
        id: activity,
        label: activityName[activity],
        detail: `1 AP if accepted · ${detail}`,
        effect: { type: "crew", choice: "request", activity },
        requirement: () => requestError(s, c.id, activity),
      });
      if (activity === "work" && decision.negotiate)
        rows.push({
          id: "work-negotiated",
          label: "Pay them $18 for their time · 1 AP if accepted",
          effect: {
            type: "crew",
            choice: "request",
            activity,
            compensation: 18,
          },
          requirement: () => requestError(s, c.id, activity, 18),
        });
    }
    rows.push({
      id: "leave",
      label: "Catch you later.",
      effect: { type: "crew", choice: "leave" },
    });
    return rows;
  },
  rules: { replay: "read-only", expiresWithIncident: false },
};
export const CREW_OFFER: EncounterDefinition = {
  id: "crew-offer",
  type: "request",
  participants: [],
  priority: 65,
  trigger: (s) =>
    s.crewOffers
      .filter((o) => o.status === "pending")
      .map((o) => ({ key: o.id })),
  eligible: (s, e) => {
    const o = offer(s, e);
    return (
      !!o &&
      o.status === "pending" &&
      s.day <= o.expiresDay &&
      s.day <= o.activityDay &&
      s.crew.members.includes(o.member) &&
      s.characters[o.member].status === "active"
    );
  },
  expression: () => "proposing",
  dialogue: (s, e) => {
    const o = offer(s, e)!,
      c = member(s, e),
      p = s.characters[s.playerId];
    const contact = p.known.includes(o.contact)
      ? s.characters[o.contact].name
      : "somebody I know";
    const intro =
      o.activity === "partner-gig"
        ? `Aye, ${contact} is looking for local help on day ${o.activityDay}. We could make a little bread. You tryna come?`
        : o.activity === "social"
          ? `I've had a lot on my mind. Could use some time with a friend on day ${o.activityDay}. You free?`
          : `I could introduce you to ${contact} on day ${o.activityDay}. Might be useful for both of us.`;
    return `${intro} ${e.selectedResponses.some((r) => r.id === "details") ? `${o.activity === "partner-gig" ? "It’s paid work, right here. We both get paid when it’s done." : "Ain’t about money. Just make the time."} If you can’t make it, no stress, I’ll do my own thing.` : `Let me know by day ${Math.min(o.expiresDay, o.activityDay)}.`} ${c.stress > 35 ? "I could really use the break." : "No pressure if you've got other plans."}`;
  },
  responses: (s, e) => [
    {
      id: "accept-offer",
      label: `I’m in. Day ${offer(s, e)!.activityDay}`,
      detail: `1 AP when you meet. ${offer(s, e)!.activity === "partner-gig" ? "Counts as your gig that day: you earn $38, a little more with experience, and they get $16." : "No pay; just time together."}`,
      effect: { type: "crew", choice: "accept" },
      requirement: () => offerError(s, offer(s, e)!.id),
    },
    ...(!e.selectedResponses.some((r) => r.id === "details")
      ? [
          {
            id: "details",
            label: "Tell me more about it.",
            effect: { type: "crew" as const, choice: "details" },
          },
        ]
      : []),
    {
      id: "decline-offer",
      label: "Can't make it. You go ahead.",
      detail: "No hard feelings.",
      effect: { type: "crew", choice: "decline" },
    },
  ],
  rules: { replay: "read-only", expiresWithIncident: false },
};
