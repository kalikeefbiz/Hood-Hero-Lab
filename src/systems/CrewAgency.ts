import { applyFactionConsequences } from "./gang/Consequences";
import { lessonError } from "./StreetAccess";
import { awardSkill, proficiency, skillRank } from "./Skills";
import { applyInfluence } from "./Territory";
import { saleLot, transactionChance } from "./StreetEconomy";
import {
  cash,
  clamp,
  player,
  type Character,
  type CrewActivity,
  type CrewAssignment,
  type GameState,
} from "../core/GameState";
import { record } from "../core/EventLog";
import { random } from "../core/Random";
import {
  actionSuccessChance,
  resolveAction,
  validateAction,
} from "../core/ActionEngine";
import { earn, expense } from "./Economy";
import {
  change,
  remember,
  connect,
  introductionCandidates,
} from "./Relationships";
import { currentEmployment } from "./Employment";
import { weekday } from "../content/jobs";

export const CREW_BALANCE = {
  memberCooldown: 10,
  globalCooldown: 6,
  firstOfferDay: 3,
  offerChance: 0.32,
  expiry: 1,
  compensation: 12,
  growthCap: 85,
};
export const activityName: Record<CrewActivity, string> = {
  work: "Paid local work",
  information: "Ask for information",
  social: "Spend time together",
  "partner-gig": "Partner on a local gig",
  "partner-crime": "Partner on street work",
};
export function availability(
  s: GameState,
  c: Character,
  day = s.day,
): string | null {
  if (c.status !== "active")
    return c.status === "arrested" ? "I’m locked up. I can’t help right now." : "I’m laying low. I can’t help right now.";
  if (c.availableDay > day) return `I’m tied up until day ${c.availableDay}.`;
  const job = currentEmployment(s, c.id);
  if (
    job &&
    day > job.hiredDay &&
    job.workdays.includes(weekday(day)) &&
    !job.timeOffDays.includes(day)
  )
    return "I’ve got a shift that day. I can’t miss it.";
  if (
    s.assignments.some(
      (a) =>
        a.participants.includes(c.id) &&
        ["accepted", "active"].includes(a.status) &&
        a.dueDay >= day,
    )
  )
    return "I already told somebody else I’d be there.";
  if (c.agency.lastAssignmentDay === day)
    return "I already did my part today. Ask me tomorrow.";
  return null;
}
export const knownCapabilities = (c: Character) =>
  [
    `Work: ${c.skills.work >= 55 ? "experienced" : c.skills.work >= 35 ? "practiced" : "learning"}`,
    `Connections: ${c.skills.social >= 55 ? "well connected" : c.skills.social >= 35 ? "local ties" : "limited"}`,
    `Street experience: ${skillRank(c, "trapper") >= 3 ? "seasoned" : skillRank(c, "trapper") >= 2 ? "practical" : "inexperienced"}`,
  ].join(" · ");
export function cooperation(
  s: GameState,
  c: Character,
  activity: CrewActivity,
  compensation = CREW_BALANCE.compensation,
) {
  const busy =
    availability(s, c) ||
    (activity === "work" ? availability(s, c, s.day + 1) : null);
  if (busy) return { accepted: false, reason: busy, negotiate: false };
  const p = player(s),
    r = c.relationships[p.id];
  if ((r?.trust ?? 0) < 25 || (r?.grievance ?? 0) > 55)
    return {
      accepted: false,
      reason: "We need to fix things between us before I put my word on this.",
      negotiate: false,
    };
  const risky = activity === "partner-crime";
  if (
    risky &&
    c.affiliation &&
    p.affiliation &&
    s.factions[c.affiliation].enemies.includes(p.affiliation)
  )
    return {
      accepted: false,
      reason: "That puts me against my own people. I'm not doing it.",
      negotiate: false,
    };
  if (risky && (c.traits.lawful >= 70 || c.traits.risk < 30 || c.police >= 45))
    return {
      accepted: false,
      reason:
        c.police >= 45
          ? "I've got too much attention already. I need to stay clear."
          : "That kind of risk isn't for me. Ask me about something lawful.",
      negotiate: false,
    };
  if (c.stress > (activity === "social" ? 90 : 65))
    return {
      accepted: false,
      reason: "I'm stretched too thin. I need a quiet day to myself.",
      negotiate: false,
    };
  if (
    activity === "work" &&
    compensation < 18 &&
    (c.wallet.clean < 45 || c.traits.ambition > 65)
  )
    return {
      accepted: false,
      reason: "I need $18 for my time. Can you cover that?",
      negotiate: true,
    };
  const skill =
    activity === "information" || activity === "social"
      ? c.skills.social
      : risky
        ? proficiency(c, "trapper")
        : c.skills.work;
  const score =
    (r?.trust ?? 0) * 0.45 +
    (r?.affection ?? 0) * 0.1 +
    c.traits.loyalty * 0.15 +
    skill * 0.12 +
    (c.goals.includes(activity === "social" ? "loyalty" : "income") ? 10 : 0) +
    (activity === "work" ? compensation / 2 : activity === "social" ? 8 : 4) -
    c.stress * 0.3 -
    (r?.grievance ?? 0) * 0.3 -
    (risky ? (100 - c.traits.risk) * 0.3 + c.traits.lawful * 0.2 : 0);
  return {
    accepted: score >= (risky ? 38 : 30),
    negotiate: false,
    reason:
      score >= (risky ? 38 : 30)
        ? "Alright, I’m with it. Let’s both keep our word."
        : "I don't feel ready for that with you. Let's build some trust first.",
  };
}
export function assignmentChance(
  s: GameState,
  c: Character,
  activity: CrewActivity,
) {
  const r = c.relationships[s.playerId];
  const skill =
    activity === "information" || activity === "social"
      ? c.skills.social
      : activity === "partner-crime"
        ? proficiency(c, "trapper")
        : c.skills.work;
  return clamp(
    0.36 +
      skill / 180 +
      (proficiency(player(s), "leadership") - 20) / 1500 +
      (r?.trust ?? 0) / 600 -
      c.stress / 350 -
      (r?.grievance ?? 0) / 500,
    0.15,
    0.92,
  );
}
export function requestError(
  s: GameState,
  member: string,
  activity: CrewActivity,
  compensation = CREW_BALANCE.compensation,
): string | null {
  if (s.activeSession && s.activeSession.status !== "ended") return "Wrap up trapping first.";
  if (s.end) return "Your story has ended";
  if (player(s).status !== "active")
    return "You can’t do that from a cell.";
  if (!s.crew.members.includes(member)) return "They’re not in your Set";
  if (s.ap < 1) return "You need 1 AP";
  if (
    s.assignments.some(
      (a) =>
        a.member === member &&
        a.activity === activity &&
        a.status === "refused" &&
        a.createdDay === s.day &&
        (activity !== "work" || a.compensation === compensation),
    )
  )
    return "You already asked them today. Give them some space.";
  if (activity === "work" && cash(player(s)) < compensation)
    return `You need $${compensation} to cover their time`;
  if (activity === "partner-crime") return lessonError(s) ?? (saleLot(s) ? null : "No Pink Magic on hand.");
  if (activity === "partner-gig")
    return validateAction(s, {
      actor: s.playerId,
      type: "gig",
    });
  return null;
}
function assignment(
  s: GameState,
  member: string,
  activity: CrewActivity,
  compensation: number,
): CrewAssignment {
  return {
    id: `assignment-${s.nextId++}`,
    member,
    participants: [s.playerId, member],
    activity,
    objective: activityName[activity],
    conditions: [
      "Active participants",
      "Available time and cooperation",
      "1 AP on participation",
      ...(activity === "work"
        ? ["Reserved compensation", "No conflicting shift through completion"]
        : activity === "partner-gig"
          ? ["Daily local gig not already completed"]
          : activity === "partner-crime"
            ? ["Trusted street connection", "Compatible values and loyalties"]
            : ["Member's own preferences and knowledge"]),
    ],
    relationshipEffect:
      "Keeping the agreement can build trust; failure can reduce respect; a no-show strains trust.",
    status: "proposed",
    createdDay: s.day,
    dueDay: s.day,
    apCost: 1,
    compensation:
      activity === "work"
        ? compensation
        : activity === "partner-gig"
          ? 16
          : activity === "partner-crime"
            ? 20
            : 0,
    expectedBenefit:
      activity === "work"
        ? 24 + Math.floor(s.characters[member].skills.work / 6)
        : activity === "partner-gig"
          ? 38 +
            Math.max(0, Math.floor((s.characters[member].skills.work - 25) / 8))
          : activity === "partner-crime"
            ? Math.min(saleLot(s)?.remaining ?? 0, 2) * 50
            : 0,
    skill:
      activity === "information" || activity === "social"
        ? "social"
        : activity === "partner-crime"
          ? "recovery"
          : "work",
    chance:
      activity === "partner-crime"
        ? transactionChance(s, s.playerId, undefined, member)
        : ["social", "partner-gig"].includes(activity)
          ? 1
          : assignmentChance(s, s.characters[member], activity),
    risk:
      activity === "partner-crime"
        ? "Police, rival exposure and financial loss for both"
        : activity === "work"
          ? "No pay if unreliable; compensation still owed"
          : "Time and relationship",
    experience: 0,
    eventIds: [],
  };
}
function logAssignment(
  s: GameState,
  a: CrewAssignment,
  text: string,
  weight = 3,
) {
  const e = record(s, "crew", text, a.participants, a.participants, {
    importance: "routine",
    commitmentId: a.commitmentId,
  });
  a.eventIds.push(e.id);
  for (const [who, about] of [
    [a.member, s.playerId],
    [s.playerId, a.member],
  ])
    remember(s, who, about, e.id, text, weight);
  return e;
}
function commitment(s: GameState, a: CrewAssignment) {
  const id = `commitment-${s.nextId++}`;
  s.commitments.push({
    id,
    origin: a.id,
    requester: s.playerId,
    actor: a.member,
    beneficiary: s.playerId,
    createdDay: s.day,
    dueDay: a.dueDay,
    kind: "crew-activity",
    status: "pending",
    evidence: [],
    warned: false,
    consequences: {
      fulfilled: { trust: 3, respect: 2, grievance: 0 },
      broken: { trust: -4, respect: -2, grievance: 3 },
      released: { trust: 0, respect: 0, grievance: 0 },
    },
  });
  a.commitmentId = id;
}
// Called only on a validated owned snapshot, including through encounter responses.
export function requestActivity(
  s: GameState,
  member: string,
  activity: CrewActivity,
  compensation = CREW_BALANCE.compensation,
) {
  if (requestError(s, member, activity, compensation)) return;
  const c = s.characters[member],
    a = assignment(s, member, activity, compensation),
    decision = cooperation(s, c, activity, compensation);
  s.assignments.push(a);
  if (!decision.accepted) {
    a.status = "refused";
    a.relationshipEffect =
      "Saying no doesn’t cost you anything.";
    // Refusals are free. Repeating an unreasonable request once per later day erodes trust gradually.
    const repeated =
      c.agency.lastRequestDay < s.day && c.agency.unreasonableRequests >= 2;
    if (c.agency.lastRequestDay !== s.day) c.agency.unreasonableRequests++;
    if (repeated) change(c, s.playerId, { trust: -2, grievance: 2 });
    c.agency.lastRequestDay = s.day;
    a.outcome = `${c.name}: “${decision.reason}”${repeated ? " Pushing them again put a strain on things." : ""}`;
    logAssignment(s, a, a.outcome, repeated ? -2 : 0);
    return;
  }
  if (activity !== "partner-crime") s.ap--;
  c.agency.lastAssignmentDay = s.day;
  c.agency.unreasonableRequests = Math.max(
    0,
    c.agency.unreasonableRequests - 1,
  );
  a.status = "active";
  if (activity === "work") {
    expense(s, player(s), compensation, `Money set aside for ${c.name}`);
    a.dueDay = s.day + 1;
    c.availableDay = s.day + 2;
  }
  commitment(s, a);
  logAssignment(
    s,
    a,
    `${c.name} is in: ${a.objective.toLowerCase()}. ${activity === "work" ? `You set aside $${compensation} for their time. It could bring in $${a.expectedBenefit} on day ${a.dueDay}.` : activity === "partner-crime" ? "They’ll come with you next time you trap; that costs 1 AP when you start." : "It’ll take 1 AP when you meet up."}`,
  );
  if (!["work", "partner-crime"].includes(activity)) resolveAssignment(s, a);
}
function shareInformation(s: GameState, a: CrewAssignment) {
  const c = s.characters[a.member],
    p = player(s);
  const contact = introductionCandidates(s, p.id, c.id)[0];
  if (contact) {
    connect(s, p.id, contact);
    change(s.characters[contact], p.id, { trust: 2 });
    return `${c.name} introduced you to ${s.characters[contact].name}.`;
  }
  const i = s.incidents["the-chains"];
  if (
    i?.status === "active" &&
    (c.id === i.victim ||
      c.known.includes(i.victim) ||
      c.known.some((id) => i.participants.includes(id)))
  ) {
    i.informed = true;
    return `${c.name}: “Word is that crew is holding Mega’s chain and asking $${i.demand}. I don’t know who’s actually got it.”`;
  }
  return `${c.name}: “I asked around. Nobody knows anything I can back up. Doesn’t mean there’s nothing to know.”`;
}
export function resolveAssignment(s: GameState, a: CrewAssignment) {
  if (a.status !== "active" || a.dueDay > s.day) return;
  if (a.activity === "partner-crime") {
    // Session resolver owns sales. An unattended invitation expires without invented proceeds.
    if (a.createdDay >= s.day) return;
    a.status = "resolved"; a.success = false; a.outcome = "You never made it out to the block together.";
    const promise = s.commitments.find(c => c.id === a.commitmentId);
    if (promise) promise.status = "released";
    return;
  }
  const c = s.characters[a.member],
    p = player(s);
  const knownBefore = new Set(p.known);
  const informedBefore = s.incidents["the-chains"]?.informed;
  // Membership changes do not erase promises; incapacitation can still break them.
  a.success =
    c.status === "active" &&
    p.status === "active" &&
    random(s) < assignmentChance(s, c, a.activity);
  let outcome = "";
  if (a.activity === "work") {
    c.wallet.clean += a.compensation;
    if (a.success)
      earn(s, p, a.expectedBenefit, "clean", `Errand with ${c.name}`);
    c.stress = clamp(c.stress + (a.success ? 5 : 9));
    outcome = a.success
      ? `The errand brought in $${a.expectedBenefit}. ${c.name} got the $${a.compensation} you set aside.`
      : `The work fell through. Nothing for you, but ${c.name} still got $${a.compensation} for their time.`;
  } else if (a.activity === "partner-gig") {
    const type = "gig" as const;
    const error = validateAction({ ...s, ap: s.ap + 1 }, { actor: p.id, type });
    // AP has already been paid by the assignment, so restore it only around the existing resolver.
    if (c.status !== "active" || error) {
      a.success = false;
      outcome =
        "The plan fell apart before it started. Nothing gained, nothing lost.";
    } else {
      s.ap++;
      const before = cash(p);
      resolveAction(s, { actor: p.id, type, partner: c.id });
      a.success = cash(p) > before;
      const bonus = Math.max(0, Math.floor((proficiency(c, 'work') - 25) / 8));
      earn(s, p, bonus, 'clean', "Partner's work contribution");
      c.wallet.clean += 16;
      c.stress = clamp(c.stress + 5);
      outcome = `You worked a gig with ${c.name}. You earned $${38 + bonus} and they made $16.`;
    }
  } else if (a.activity === "social") {
    a.success = true;
    const relief = c.goals.includes("loyalty") ? 10 : 6;
    c.stress = clamp(c.stress - relief);
    p.stress = clamp(p.stress - relief);
    change(c, p.id, { trust: 5, affection: 5, grievance: -3 });
    change(p, c.id, { trust: 4, affection: 4 });
    p.influence++;
    outcome = `You spent time with ${c.name} and you both unwound. ${c.goals.includes("loyalty") ? "Making time for them means a lot." : "They needed the break."}`;
  } else
    outcome = a.success
      ? shareInformation(s, a)
      : `${c.name}: “I asked around. Nothing solid yet. I’ll keep my ears open.”`;
  if (a.success) {
    const lawfulWork = a.activity === "work" || a.activity === "partner-gig";
    const faction = !lawfulWork && c.affiliation === p.affiliation ? p.affiliation : null;
    applyInfluence(s, {
      actor: c.id,
      participants: [p.id],
      faction,
      zone: c.home,
      kind: lawfulWork ? "economic" : "community",
      magnitude: 1,
      cause: `${c.name} came through on what you planned, and the neighborhood noticed.`,
    });
    if (faction) applyFactionConsequences(s, faction, { contribution: 5 });
    a.experience = Math.min(
      1,
      Math.max(0, CREW_BALANCE.growthCap - c.skills[a.skill]),
    );
    c.skills[a.skill] += a.experience;
    change(c, p.id, { trust: 2, respect: 1 });
  } else change(c, p.id, { respect: -1 });
  a.status = "resolved";
  a.relationshipEffect = a.success
    ? "Working together brought you closer."
    : "It didn’t work out, and you still owe what you agreed.";
  a.outcome = `${c.name} · ${a.objective}: ${outcome}`;
  c.agency.lastAssignmentDay = s.day;
  const e = logAssignment(s, a, a.outcome, a.success ? 5 : -2);
  if (a.success) {
    const newContact = p.known.find(id => !knownBefore.has(id));
    const meaningful = a.activity !== 'information' || !!newContact || (!informedBefore && s.incidents['the-chains']?.informed);
    const key = a.activity === 'social' ? `crew-trust:${c.id}:${Math.floor((c.relationships[p.id]?.trust ?? 0) / 25)}` : a.activity === 'information' ? `crew-information:${newContact ?? 'chains'}` : a.id;
    if (meaningful) {
      awardSkill(s, p.id, 'leadership', 100, key);
      awardSkill(s, c.id, a.activity === 'work' || a.activity === 'partner-gig' ? 'work' : 'social', 100, key);
    }
  }
  const promise = s.commitments.find((x) => x.id === a.commitmentId);
  if (promise) {
    promise.status = a.success ? "fulfilled" : "failed";
    promise.evidence.push(e.id);
  }
}
export function expireCrewOffers(s: GameState) {
  for (const o of s.crewOffers.filter((o) => o.status === "pending")) {
    if (
      s.end ||
      s.day > o.expiresDay ||
      s.day > o.activityDay ||
      !s.crew.members.includes(o.member) ||
      s.characters[o.member].status !== "active" ||
      s.characters[o.contact].status !== "active" ||
      availability(s, s.characters[o.member], o.activityDay)
    )
      o.status = "expired";
  }
}
export function processCrewActivities(s: GameState) {
  expireCrewOffers(s);
  for (const a of s.assignments) {
    if (a.status === "active") resolveAssignment(s, a);
    if (a.status === "accepted" && s.day > a.dueDay) {
      a.status = "resolved";
      a.success = false;
      a.relationshipEffect = "Didn’t show up when we agreed.";
      a.outcome = `${s.characters[a.member].name}: “You didn’t show up. I went on with my day.”`;
      change(s.characters[a.member], s.playerId, { trust: -4, grievance: 3 });
      const e = logAssignment(s, a, a.outcome, -4);
      const p = s.commitments.find((c) => c.id === a.commitmentId);
      if (p) {
        p.status = "broken";
        p.evidence.push(e.id);
      }
    }
  }
}
// A deterministic decision tie-breaker does not perturb established incident/AI random draws.
function offerRoll(s: GameState, c: Character) {
  let hash = (s.rng ^ Math.imul(s.day, 2654435761)) >>> 0;
  for (const ch of c.id)
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash / 4294967296;
}
// Called by the ordinary NPC decision engine. An offer never freezes the NPC.
export function considerCrewOffer(s: GameState, c: Character) {
  if (
    !s.crew.members.includes(c.id) ||
    s.day < CREW_BALANCE.firstOfferDay ||
    availability(s, c) ||
    availability(s, c, s.day + 1) ||
    (c.relationships[s.playerId]?.trust ?? 0) < 35 ||
    c.stress > 60 ||
    (c.agency.lastOfferDay > 0 &&
      s.day - c.agency.lastOfferDay < CREW_BALANCE.memberCooldown) ||
    s.crewOffers.some(
      (o) =>
        o.status === "pending" ||
        s.day - o.createdDay < CREW_BALANCE.globalCooldown,
    ) ||
    offerRoll(s, c) > CREW_BALANCE.offerChance
  )
    return;
  const contact = c.known.find(
    (id) => id !== s.playerId && s.characters[id]?.status === "active",
  );
  if (!contact) return;
  const activity =
    c.stress > 35 && c.goals.includes("loyalty")
      ? "social"
      : c.skills.social >= 55 &&
          c.known.some((id) => !player(s).known.includes(id))
        ? "information"
        : "partner-gig";
  if (!cooperation(s, c, activity).accepted) return;
  const o = {
    id: `offer-${s.nextId++}`,
    member: c.id,
    contact,
    activity,
    createdDay: s.day,
    expiresDay: s.day + CREW_BALANCE.expiry,
    activityDay: s.day + 1,
    status: "pending",
  } as const;
  s.crewOffers.push(o);
  c.agency.lastOfferDay = s.day;
  record(
    s,
    "crew",
    `${c.name} wants to ${activity === "partner-gig" ? "work a gig with you" : activity === "social" ? "hang out" : "introduce you to someone"} on day ${o.activityDay}. Let them know by day ${o.expiresDay}.`,
    [c.id, s.playerId],
    undefined,
    { importance: "routine" },
  );
}
export function offerError(s: GameState, offerId: string): string | null {
  const o = s.crewOffers.find((x) => x.id === offerId);
  if (
    !o ||
    o.status !== "pending" ||
    s.day > o.expiresDay ||
    s.day > o.activityDay
  )
    return "That plan has passed";
  if (!s.crew.members.includes(o.member)) return "They’re not in your Set anymore";
  return (
    availability(s, s.characters[o.member], o.activityDay) ||
    availability(s, player(s), o.activityDay)
  );
}
export function acceptCrewOffer(s: GameState, id: string) {
  if (offerError(s, id)) return;
  const o = s.crewOffers.find((x) => x.id === id)!;
  const a = assignment(s, o.member, o.activity, 0);
  a.status = "accepted";
  a.dueDay = o.activityDay;
  a.offerId = o.id;
  s.assignments.push(a);
  o.status = "accepted";
  o.assignmentId = a.id;
  commitment(s, a);
  logAssignment(
    s,
    a,
    `${s.characters[o.member].name}: “We’re on for day ${a.dueDay}. Meet me then.” It’ll take 1 AP when you meet up.`,
  );
}
export function attendError(s: GameState, id: string) {
  const a = s.assignments.find((a) => a.id === id);
  if (!a || a.status !== "accepted" || a.dueDay !== s.day)
    return "Meet them on the day you agreed";
  const otherPlans = {
    ...s,
    assignments: s.assignments.filter((x) => x.id !== a.id),
  };
  return (
    requestError(s, a.member, a.activity) ||
    availability(otherPlans, s.characters[a.member]) ||
    availability(otherPlans, player(s))
  );
}
export function attendCrewActivity(s: GameState, id: string) {
  if (attendError(s, id)) return;
  const a = s.assignments.find((a) => a.id === id)!;
  a.status = "active";
  s.ap--;
  resolveAssignment(s, a);
}
