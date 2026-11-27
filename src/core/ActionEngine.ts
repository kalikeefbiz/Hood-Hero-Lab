import {
  executeTimedAction,
  type ActionTiming,
  type DayEndDecision,
  type TimedActionResult,
} from "./ActionTiming";
import { gain, gainError, receivePhysical } from "../systems/Inventory";
import { completeWorkIntro } from "../systems/StreetLife";
import { awardSkill, proficiency, skillsOf } from "../systems/Skills";
import { equipmentBonus } from "../systems/Equipment";
import { openQuanny, quannyError, quannyConversation } from "../systems/Quanny";
import {
  expose,
  hospitalStay,
  streetConversation,
  streetLocation,
} from "../systems/Danger";
import { moveTo, presenceOf } from "../board/presence";
import { applyInfluence } from "../systems/Territory";
import { clearSuccessor } from "../systems/gang/Authority";
import { applyFactionConsequences } from "../systems/gang/Consequences";
import { membershipError, recordSponsorship, resolveAffiliation, resolveStanding } from "../systems/gang/Membership";
import {
  marketAccess,
  transactionError,
  transactionChance,
  transact,
} from "../systems/StreetEconomy";
import { addExposure } from "../systems/CriminalExposure";
import {
  cash,
  clamp,
  player,
  type GameState,
  type ZoneId,
  type GameEvent,
  type ID,
} from "./GameState";
import { record } from "./EventLog";
import { random } from "./Random";
import { BALANCE } from "../content/balance";
import { ITEMS, type ItemId } from "../content/economy";
import {
  change,
  remember,
  connect,
  contactError,
  introductionCandidates,
} from "../systems/Relationships";
import { earn, expense } from "../systems/Economy";
import { resolveIncident } from "../systems/Incidents";
import { syncEncounters } from "../systems/EncounterLifecycle";
import { evaluatePromises } from "../systems/Commitments";
import { requestActivity, requestError } from "../systems/CrewAgency";
import { recoverySupport } from "../systems/Crew";
import { settlePlayerProgress } from "../systems/Progression";

import {
  currentEmployment,
  shiftToday,
  searchState,
  jobError,
  applyForJob,
  acceptJob,
  workShift,
  endEmployment,
  requestTimeOff,
  jobOpportunities,
} from "../systems/Employment";
export const ACTIONS = {
  quanny: {
    label: "Talk business with Quanny",
    ap: 0,
    durationMinutes: 0,
    endsDay: false,
    risk: "Social",
    description:
      "Find Quanny outside Lil Jay’s and talk business.",
    outcomes: ["A conversation he’ll remember"],
  },
  apply: {
    label: "Apply for work",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "None",
    description:
      "Talk to whoever does the hiring. Applying is unpaid; you can look over any offer before you take it.",
    outcomes: ["A job offer, if they’ll have you"],
  },
  acceptJob: {
    label: "Take the job",
    ap: 0,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description:
      "Take the job and its weekly schedule. Your first shift is after today.",
    outcomes: ["A steady job with regular shifts"],
  },
  timeOff: {
    label: "Ask for a day off",
    ap: 0,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description:
      "Ask to skip today’s shift without pay. You can do this once a week.",
    outcomes: ["Excused, unpaid"],
  },
  resign: {
    label: "Quit",
    ap: 0,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description:
      "Quit this job. You can apply elsewhere after three days, and here again after seven.",
    outcomes: ["The job ends; your boss won’t forget it"],
  },
  contact: {
    label: "Reach out",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "None",
    description: "Introduce yourself and start building trust.",
    outcomes: ["A little trust"],
  },
  inquire: {
    label: "Ask around",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "None",
    description: "Ask what they know about who’s who and what happened to Cuzzo’s chains.",
    outcomes: ["What they know, and maybe new names"],
  },
  introduce: {
    label: "Ask for an introduction",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "None",
    description: "Ask them to put you in touch with people they know.",
    outcomes: ["New people to meet"],
  },
  socialize: {
    label: "Spend time together",
    ap: 1,
    durationMinutes: 30,
    endsDay: false,
    risk: "None",
    description: "Hang out. What builds trust depends on what they care about.",
    outcomes: ["Trust, respect and a lighter mood"],
  },
  favor: {
    label: "Ask for help",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "Social",
    description: "Ask someone who trusts you to back you up over the chains.",
    outcomes: ["Someone in your corner"],
  },
  offer: {
    label: "Offer support · $20",
    amount: 20,
    ap: 1,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description: "Help them out with some money. Where it came from goes with it.",
    outcomes: ["$20 given; trust built"],
  },
  transfer: {
    label: "Give $25",
    amount: 25,
    ap: 1,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description: "Give them $25.",
    outcomes: ["$25 given"],
  },
  negotiate: {
    label: "Negotiate buyback",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "Social",
    description: "Try to talk their price down. You only get one shot.",
    outcomes: ["A lower price, or a flat no"],
  },
  settlement: {
    label: "Discuss settlement",
    ap: 1,
    durationMinutes: 30,
    endsDay: false,
    risk: "Social",
    description: "Let the people running things know their young members acted on their own.",
    outcomes: ["Leadership may step in, in their own time"],
  },
  buyback: {
    label: "Pay for the chains",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "None",
    description:
      "Pay what they’re asking and get Cuzzo’s chains back to him.",
    outcomes: ["The chains come home; they keep the cash"],
  },
  recover: {
    label: "Take the chains back",
    ap: 2,
    durationMinutes: 60,
    endsDay: false,
    risk: "High",
    description:
      "Take the chains back yourself. It might not go your way, and failing brings police and trouble with the crew.",
    outcomes: ["The chains back, or police and rival heat"],
  },
  work: {
    label: "Work a full shift",
    ap: 2,
    durationMinutes: 240,
    endsDay: false,
    risk: "None",
    description:
      "Clock in for today’s scheduled shift. Steady work builds your skills and your name.",
    outcomes: ["$96 honest pay · tiring"],
  },
  gig: {
    label: "Take a local gig",
    ap: 1,
    durationMinutes: 60,
    endsDay: false,
    risk: "None",
    description:
      "Earn $38 helping out a local business. One gig a day, no strings attached.",
    outcomes: ["$38 honest pay · a little tiring"],
  },
  crime: {
    label: "Work the street",
    ap: 1,
    durationMinutes: 30,
    endsDay: false,
    risk: "High",
    description:
      "Move the product you’re carrying. Whatever you owe your supplier is still owed.",
    outcomes: [
      "Sales or losses; your debt and the attention stay with you",
    ],
  },
  buy: {
    label: "Buy item",
    ap: 1,
    durationMinutes: 5,
    endsDay: false,
    risk: "None",
    description: "Treat yourself and take the edge off.",
    outcomes: ["Cash spent; stress relieved"],
  },
  recruit: {
    label: "Invite to your Set",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "Social",
    description: "Ask them to roll with you. They need room in your Set, trust in you, and to want it.",
    outcomes: ["A new member of your Set"],
  },
  remove: {
    label: "Remove from Set",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "Social",
    description: "Cut ties with them. They’ll remember how it ended.",
    outcomes: ["They leave; trust falls"],
  },
  assign: {
    label: "Assign a paid errand",
    ap: 1,
    durationMinutes: 15,
    endsDay: false,
    risk: "Low",
    description:
      "Send a free member on an honest errand, done by tomorrow.",
    outcomes: [
      "$24 clean and experience for them, or a job left undone",
    ],
  },
  standing: {
    label: "Build a local connection",
    ap: 1,
    durationMinutes: 30,
    endsDay: false,
    risk: "None",
    description:
      "Help out in a member’s neighborhood. People notice who shows up.",
    outcomes: ["Standing for you and the organization"],
  },
  affiliate: {
    label: "Ask to get put on",
    ap: 1,
    durationMinutes: 30,
    endsDay: false,
    risk: "Social",
    description: "Ask a member who trusts you to vouch for you.",
    outcomes: ["Membership, if they vouch for you"],
  },
  rest: {
    label: "Take a quiet afternoon",
    ap: 1,
    durationMinutes: 120,
    endsDay: false,
    risk: "None",
    description: "Slow down for a few hours. Costs nothing.",
    outcomes: ["Takes the edge off"],
  },
} as const;
export type ActionType = keyof typeof ACTIONS;
export interface Action {
  type: ActionType;
  actor: ID;
  target?: ID;
  incidentId?: ID;
  item?: ItemId;
  jobId?: ID;
  partner?: ID;
  market?: import("./GameState").ZoneId;
}
export function validateAction(s: GameState, a: Action): string | null {
  if (!ACTIONS[a.type]) return "Unknown action";
  const c = s.characters[a.actor],
    t = a.target ? s.characters[a.target] : undefined,
    i = a.incidentId ? s.incidents[a.incidentId] : undefined;
  if (!c) return "Unknown actor";
  if (
    c.id === s.playerId &&
    s.activeRobbery &&
    s.activeRobbery.status !== "ended"
  )
    return "Finish the job you’re on first.";
  if (s.end) return "This story has ended";
  if (c.id === s.playerId && hospitalStay(s))
    return "You’re still in the hospital.";
  if (c.id === s.playerId && (streetConversation(s) || quannyConversation(s)))
    return "Finish this conversation first.";
  if (c.status !== "active") return "Actor is not active";
  if (
    c.id === s.playerId
      ? s.ap < ACTIONS[a.type].ap
      : c.availableDay > s.day || c.lastActionDay >= s.day
  )
    return c.id === s.playerId ? "Not enough AP left today" : "They’re busy right now";
  if (["apply", "acceptJob"].includes(a.type)) {
    const error = jobError(s, a.actor, a.jobId);
    if (error) return error;
    const search = searchState(s, a.actor);
    if (a.type === "apply" && search.lastApplicationDay === s.day)
      return "You’ve already applied somewhere today. Look over your offer.";
    if (a.type === "acceptJob" && search.offeredJob !== a.jobId)
      return "Apply here first";
  }
  if (
    a.type === "work" &&
    (!currentEmployment(s, a.actor) || !shiftToday(s, a.actor))
  )
    return "You don’t have a shift to work today.";
  if (["resign", "timeOff"].includes(a.type) && !currentEmployment(s, a.actor))
    return "You don’t have a job";
  if (a.type === "timeOff") {
    if (!shiftToday(s, a.actor)) return "You aren’t scheduled today";
    const last = currentEmployment(s, a.actor)!.timeOffDays.at(-1);
    if (last !== undefined && s.day - last < BALANCE.employment.timeOffInterval)
      return `You can ask for time off again on day ${last + BALANCE.employment.timeOffInterval}`;
  }
  if (
    a.partner &&
    (!s.crew.members.includes(a.partner) ||
      !s.assignments.some(
        (x) =>
          x.status === "active" &&
          x.member === a.partner &&
          x.participants.includes(a.actor) &&
          x.activity === (a.type === "crime" ? "partner-crime" : "partner-gig"),
      ))
  )
    return "You haven’t agreed on this with them";
  if (a.type === "gig" && searchState(s, a.actor).lastGigDay === s.day)
    return "You’ve already done a gig today. Come back tomorrow.";
  if (a.type === "quanny")
    return a.actor === s.playerId && a.target === "quanny"
      ? quannyError(s)
      : "Player conversation only.";
  const targeted: ActionType[] = [
    "contact",
    "inquire",
    "introduce",
    "socialize",
    "favor",
    "offer",
    "transfer",
    "settlement",
    "recruit",
    "remove",
    "assign",
    "standing",
    "affiliate",
  ];
  if (targeted.includes(a.type) && (!t || t.id === c.id))
    return "Choose another person";
  if (t) {
    const storyAccess =
      a.type === "settlement" &&
      i?.status === "active" &&
      i.informed &&
      i.organization === t.affiliation;
    if (a.type !== "remove" && !storyAccess) {
      const error = contactError(s, c.id, t.id);
      if (error) return error;
      if (
        a.type === "socialize" &&
        (t.relationships[c.id]?.trust ?? 0) < 15 &&
        (t.relationships[c.id]?.affection ?? 0) < 15
      )
        return "Get to know them a little first.";
      if (
        a.type === "introduce" &&
        !introductionCandidates(s, c.id, t.id).length
      )
        return "They don’t have anyone new to introduce you to.";
    }
    if (!c.known.includes(t.id)) return "Someone needs to introduce you first";
    if (t.status !== "active" && a.type !== "remove")
      return "They’re not around";
  }
  const incidentActions: ActionType[] = [
    "negotiate",
    "settlement",
    "buyback",
    "recover",
    "favor",
  ];
  if (incidentActions.includes(a.type) && (!i || i.status !== "active"))
    return "There’s nothing to settle right now";
  if (
    ["negotiate", "buyback", "recover", "settlement", "favor"].includes(
      a.type,
    ) &&
    !i?.informed
  )
    return "Hear what happened from Cuzzo, or ask around first";
  if (a.type === "negotiate" && i?.negotiated)
    return "You already tried to talk them down";
  if (
    a.type === "settlement" &&
    (!t?.affiliation ||
      t.affiliation !== i?.organization ||
      !s.factions[t.affiliation].leaders.includes(t.id))
  )
    return "Bring this to someone who runs things";
  if (a.type === "settlement" && i?.leadershipAware)
    return "Leadership already knows";
  if (
    a.type === "favor" &&
    (i?.helpRequested || (t?.relationships[c.id]?.trust ?? 0) < 45)
  )
    return "They need to trust you more, and you can only ask once";
  if (a.type === "buyback" && cash(c) < (i?.demand ?? Infinity))
    return "You don’t have enough cash";
  if (
    (a.type === "offer" || a.type === "transfer") &&
    cash(c) < ACTIONS[a.type].amount
  )
    return "Insufficient cash";
  if (a.type === "buy" && (!a.item || !ITEMS[a.item])) return "Choose an item";
  if (a.type === "buy" && a.item && cash(c) < ITEMS[a.item].price)
    return "Insufficient cash";
  if (
    a.type === "buy" &&
    a.item &&
    ["music", "clothing"].includes(a.item) &&
    c.possessions.includes(a.item)
  )
    return "Already owned";
  if (a.type === "buy" && a.item) {
    const capacity = gainError(s, c.id, gain(a.item));
    if (capacity) return capacity;
  }
  if (a.type === "crime" && a.actor === s.playerId)
    return "Go to a spot in the City and start trapping there.";
  if (
    a.actor === s.playerId &&
    s.activeSession &&
    s.activeSession.status !== "ended"
  )
    return "Wrap up trapping first.";
  if (a.type === "crime") {
    if (a.market && !s.zones[a.market]) return "Unknown market";
    return transactionError(s, a.actor, a.market);
  }
  if (
    ["recruit", "remove", "assign", "affiliate"].includes(a.type) &&
    c.id !== s.playerId
  )
    return "Only you can manage your Set";
  if (a.type === "assign")
    return "Talk to them in person to ask for help";
  if (a.type === "recruit") {
    if (s.crew.members.includes(t!.id)) return "Already in your Set";
    if (s.crew.members.length >= s.crew.capacity)
      return "Your Set is full";
    if (
      t!.availableDay > s.day ||
      (t!.relationships[c.id]?.trust ?? 0) < BALANCE.recruitTrust ||
      t!.traits.loyalty < 35
    )
      return "They don’t trust you enough to join, or they’re busy";
    if (
      t!.affiliation &&
      c.affiliation &&
      s.factions[t!.affiliation].enemies.includes(c.affiliation)
    )
      return "Their people and yours don’t mix";
  }
  if (["remove", "assign"].includes(a.type) && !s.crew.members.includes(t!.id))
    return "They’re not in your Set";
  if (a.type === "standing" || a.type === "affiliate")
    return membershipError(a.type, c, t);
  return null;
}
// Shared with the interface so displayed odds use the resolver's exact current-state calculation.
// This does not validate eligibility or draw randomness.
export function actionSuccessChance(s: GameState, a: Action): number | null {
  const c = s.characters[a.actor];
  if (!c) return null;
  if (a.type === "negotiate")
    return clamp(
      0.35 + proficiency(c, "social") / 150 - c.stress / 500,
      0.1,
      0.85,
    );
  if (a.type === "recover") {
    const i = a.incidentId ? s.incidents[a.incidentId] : undefined;
    return i
      ? clamp(
          0.22 +
            (proficiency(c, "combat") + equipmentBonus(c).attack * 3) / 200 +
            recoverySupport(s, c.id, i.organization) -
            c.stress / 500 -
            i.escalation / 400,
          0.12,
          0.8,
        )
      : null;
  }
  if (a.type === "crime")
    return transactionChance(s, a.actor, a.market, a.partner);
  return null;
}
export function partnerContribution(s: GameState, id: string) {
  const c = s.characters[id],
    r = c.relationships[s.playerId];
  return clamp(
    (proficiency(c, "trapper") - 35) / 250 +
      (r?.trust ?? 0) / 1000 -
      c.stress / 600 -
      (r?.grievance ?? 0) / 500,
    -0.18,
    0.2,
  );
}
// Mutates only an owned simulation snapshot. UI calls performAction for transactional validation.
export function resolveAction(s: GameState, a: Action, socialZone?: ZoneId) {
  const c = s.characters[a.actor],
    t = a.target ? s.characters[a.target] : undefined,
    i = a.incidentId ? s.incidents[a.incidentId] : undefined;
  const successChance = actionSuccessChance(s, a);
  if (a.type === "quanny") {
    openQuanny(s);
    return;
  }
  if (a.type === "crime") return transact(s, a.actor, a.market, a.partner);
  if (c.id === s.playerId) s.ap -= ACTIONS[a.type].ap;
  else {
    c.lastActionDay = s.day;
    if (["gig", "crime", "work"].includes(a.type))
      c.agency.lastAssignmentDay = s.day;
  }
  let text = "";
  let category: "social" | "money" | "crew" | "incident" | "risk" = "social";
  const initialStress = c.stress;
  const socialGain = Math.max(3, 10 - Math.floor(c.stress / 25));
  switch (a.type) {
    case "apply": {
      const e = applyForJob(s, a.actor, a.jobId!);
      if (a.actor === s.playerId) completeWorkIntro(s, e.id, "apply", a.jobId);
      return e;
    }
    case "acceptJob": {
      const e = acceptJob(s, a.actor, a.jobId!);
      if (a.actor === s.playerId)
        completeWorkIntro(s, e.id, "acceptJob", a.jobId);
      return e;
    }
    case "timeOff":
      return requestTimeOff(s, a.actor);
    case "resign":
      return endEmployment(s, currentEmployment(s, a.actor)!, false);
    case "work":
      return workShift(s, a.actor);
    case "contact":
    case "socialize": {
      const values = t!.traits.lawful > 60 && c.legitimacy > 20 ? 4 : 0;
      change(t!, c.id, {
        trust: socialGain + values,
        respect: 3,
        affection: 4,
      });
      change(c, t!.id, { trust: 5, affection: 3 });
      c.stress = clamp(c.stress - 4);
      c.skills.social = clamp(c.skills.social + 1);
      c.influence += 1;
      if (i && t!.id === i.victim) i.informed = true;
      text = `${c.name} spent time with ${t!.alias ?? t!.name}. ${values ? "They respect that you earn an honest living." : "You’re getting closer."}`;
      break;
    }
    case "inquire":
    case "introduce": {
      if (a.type === "introduce")
        for (const id of introductionCandidates(s, c.id, t!.id))
          connect(s, c.id, id);
      c.known = [...new Set([...c.known, ...t!.known])].filter(
        (id) => id !== c.id,
      );
      if (i) i.informed = true;
      change(t!, c.id, { trust: 4 });
      text = `${t!.name} ${a.type === "introduce" ? "put you in touch with some people" : "told you what they know"}${i ? ". Nobody signed off on taking Cuzzo’s chains, and the crew is holding them as a group" : ""}.`;
      break;
    }
    case "favor":
      i!.helpRequested = true;
      change(t!, c.id, { trust: 3 });
      text = `${t!.name} will back you on settling this peacefully. Leadership still has to hear about it.`;
      break;
    case "offer":
    case "transfer": {
      const amount = ACTIONS[a.type].amount,
        paid = expense(s, c, amount, `Support for ${t!.name}`)!;
      t!.wallet.clean += paid.clean;
      t!.wallet.illicit += paid.illicit;
      change(t!, c.id, { trust: a.type === "offer" ? 9 : 5, affection: 3 });
      text = `${c.name} sent $${amount} to ${t!.name}.`;
      category = "money";
      break;
    }
    case "negotiate":
      i!.negotiated = true;
      if (random(s) < successChance!) {
        i!.demand = Math.max(i!.minimumDemand, i!.demand - 30);
        i!.reducedDemand = i!.demand;
        text = `The group lowered its demand to $${i!.demand}.`;
      } else {
        text = "The group refused to lower the demand.";
        i!.escalation += 4;
      }
      category = "incident";
      break;
    case "settlement":
      i!.leadershipAware = true;
      change(t!, c.id, { respect: 4 });
      text = `${t!.name} now knows the robbery wasn’t sanctioned. Leadership will decide what to do in its own time.`;
      category = "incident";
      break;
    case "buyback": {
      i!.paidDemand = i!.demand;
      i!.cleanFullPrice =
        i!.demand === (i!.originalDemand ?? 150) &&
        !i!.helpRequested &&
        !i!.leadershipAware &&
        !i!.interventions.some((x) =>
          ["failed-recovery", "settlement", "negotiate", "favor"].includes(
            x.type,
          ),
        ) &&
        !i!.negotiated;
      const paid = expense(s, c, i!.demand, "Property buyback")!;
      // Group custody and group payment are retained; no invented individual holder.
      applyFactionConsequences(s, i!.organization, { resources: paid.clean + paid.illicit });
      resolveIncident(s, i!, "buyback", c.id);
      text = `${c.name} paid $${i!.demand} to settle the demand.`;
      category = "money";
      break;
    }
    case "recover": {
      addExposure(s, c.id, c.home, 18);
      c.notoriety = clamp(c.notoriety + 12);
      c.stress = clamp(c.stress + 16);
      c.rivalThreat = clamp(c.rivalThreat + 16);
      if (random(s) < successChance!) {
        resolveIncident(s, i!, "recovered", c.id);
        text = "You got the chains back. People saw, and the crew won’t forget it.";
      } else {
        i!.escalation = clamp(i!.escalation + 18);
        change(s.characters[i!.victim], c.id, { respect: 3 });
        text =
          "It went wrong. The police are paying more attention, the crew is on edge, and the chains are still gone.";
      }
      category = "risk";
      break;
    }
    case "gig": {
      c.neighborhoodStanding[c.home] = clamp(
        c.neighborhoodStanding[c.home] + 1,
      );
      const amount = BALANCE.gigIncome;
      (s.employmentSearch[c.id] ??= { eligibleDay: 1 }).lastGigDay = s.day;
      earn(s, c, amount, "clean", "Local gig");
      c.stress = clamp(c.stress + 3);
      c.legitimacy = clamp(c.legitimacy + 1);
      c.skills.work = clamp(c.skills.work + 1);
      c.influence += 1;
      c.neighborhoodStanding[c.home] = clamp(
        c.neighborhoodStanding[c.home] + 1,
      );
      if (c.id === s.playerId) s.progression.jobs++;
      text = `${c.name} earned $${amount} from a local gig.`;
      category = "money";
      break;
    }
    case "buy": {
      const item = ITEMS[a.item!];
      expense(s, c, item.price, item.name);
      c.stress = clamp(c.stress - item.relief);
      receivePhysical(s, c.id, gain(a.item!));
      text = `${c.name} bought ${item.name.toLowerCase()} for $${item.price}.`;
      category = "money";
      break;
    }
    case "recruit":
      s.crew.members.push(t!.id);
      change(t!, c.id, { trust: 4, affection: 4 });
      text = `${t!.name} joined your Set. They still have their own people and their own past.`;
      category = "crew";
      break;
    case "remove": {
      const promised = s.assignments.some(
        (a) => a.member === t!.id && ["accepted", "active"].includes(a.status),
      );
      const closeness = t!.relationships[c.id]?.affection ?? 0;
      s.crew.members = s.crew.members.filter((id) => id !== t!.id);
      clearSuccessor(s, t!.id);
      change(t!, c.id, {
        trust: -(10 + Math.round(closeness / 10) + (promised ? 6 : 0)),
        grievance: 4 + Math.round(closeness / 10) + (promised ? 4 : 0),
      });
      text = `${t!.name} left your Set. ${closeness >= 50 ? "Being cut out by someone close hurt them. It may take time to mend." : "There’s distance between you now."}${promised ? " What you promised each other still stands." : ""}`;
      category = "crew";
      break;
    }
    case "assign":
      return; // Legacy requests are rejected by validateAction.
    case "standing":
      text = resolveStanding(s, c, t!);
      break;
    case "affiliate":
      text = resolveAffiliation(s, c, t!);
      break;
    case "rest":
      c.stress = clamp(c.stress - 14);
      text = `${c.name} took a quiet afternoon and let some stress go.`;
      break;
  }
  if (c.id === s.playerId && (a.type === "offer" || a.type === "socialize" || a.type === "gig")) {
    const descriptions = { offer: "helped someone with money", socialize: "spent time with a neighbor", gig: "worked a local gig" };
    applyInfluence(s, {
      actor: c.id,
      participants: t ? [t.id] : [],
      faction: null,
      zone: socialZone ?? t?.home ?? c.home,
      kind: a.type === "gig" ? "economic" : "community",
      magnitude: 0.3,
      cause: `${c.name} ${descriptions[a.type]}, and people noticed.`,
    });
  }
  const e = record(
    s,
    category,
    text,
    [c.id, ...(t ? [t.id] : [])],
    [c.id, ...(t ? [t.id] : [])],
    a.type === "affiliate" ? {
      factionId: c.affiliation ?? undefined,
      world: { kind: "faction-development", subjectId: c.id },
    } : undefined,
  );
  if (c.id === s.playerId && ["gig", "apply", "acceptJob"].includes(a.type))
    completeWorkIntro(
      s,
      e.id,
      a.type as "gig" | "apply" | "acceptJob",
      a.jobId,
    );
  if (a.type === "gig") awardSkill(s, c.id, "work", 100, `gig:${s.day}`);
  if (["contact", "socialize"].includes(a.type) && t) {
    const trust = t.relationships[c.id]?.trust ?? 0;
    for (const gate of [25, 50, 75])
      if (trust >= gate)
        awardSkill(s, c.id, "social", 100, `trust:${t.id}:${gate}`);
  }
  if (a.type === "introduce")
    awardSkill(s, c.id, "social", 100, `introduction:${t!.id}`);
  if (a.type === "negotiate" && i?.negotiated && text.includes("lowered"))
    awardSkill(s, c.id, "social", 200, `negotiation:${i.id}`);
  if (a.type === "buyback")
    awardSkill(s, c.id, "social", 200, `reconciliation:${i!.id}`);
  if (
    a.type === "rest" &&
    initialStress >= 14 &&
    c.stress <= 30 &&
    !skillsOf(c).awards.some((x) => x.skill === "survival" && x.day > s.day - 7)
  )
    awardSkill(s, c.id, "survival", 25, `rest:${s.day}`);
  if (
    i &&
    ["negotiate", "settlement", "buyback", "recover", "favor"].includes(a.type)
  ) {
    i.interventions.push({
      actor: c.id,
      type:
        a.type === "recover" && i.resolution !== "recovered"
          ? "failed-recovery"
          : a.type,
      eventId: e.id,
      day: s.day,
    });
  }
  // During day advancement NPC actions happen before incident progression.
  // Only evaluate deadlines after the whole incident step, never mid-turn.
  evaluatePromises(s, false);
  if (t) {
    remember(
      s,
      t.id,
      c.id,
      e.id,
      a.type === "remove"
        ? "Removed me from the Set."
        : a.type === "offer"
          ? "Helped with money."
          : ({ contact: "Introduced themselves.", inquire: "Asked me what I knew.", introduce: "Asked me for an introduction.", socialize: "We spent time together.", favor: "Asked me for help.", transfer: "Gave me some money.", standing: "Helped out around my neighborhood.", recruit: "Asked me to join their Set.", affiliate: "Asked me to vouch for them." } as Record<string, string>)[a.type] ?? "We crossed paths.",
      a.type === "remove" ? -18 : 5,
    );
    remember(s, c.id, t.id, e.id, text, 5);
  }
  return e;
}
function crewActivityFor(state: GameState, a: Action) {
  if (a.actor !== state.playerId || !a.target || !state.crew.members.includes(a.target))
    return null;
  if (a.type === "socialize") return "social";
  if (a.type === "inquire" || a.type === "introduce") return "information";
  return null;
}

/** Includes the extra willingness check for social actions routed through your Set. */
export function actionExecutionError(state: GameState, a: Action) {
  const error = validateAction(state, a);
  if (error) return error;
  const activity = crewActivityFor(state, a);
  return activity && a.target ? requestError(state, a.target, activity) : null;
}

interface ObservedSocialContext {
  zone: ZoneId;
  locationId?: string;
  peopleHere: readonly string[];
}

/** By default the caller's state is preserved. Use inPlace only with exclusively owned state. */
export function performAction(
  state: GameState,
  a: Action,
  {
    inPlace = false,
    decision,
    afterEffects,
    observedSocialContext,
  }: {
    inPlace?: boolean;
    decision?: DayEndDecision;
    /** The caller has verified this street context against physical presence. */
    observedSocialContext?: ObservedSocialContext;
    /** Record the initiating scene's response before a duration can cross dawn. */
    afterEffects?: (state: GameState) => void;
  } = {},
): TimedActionResult {
  const error = actionExecutionError(state, a);
  if (error) return { state, error };
  const resolve = () => {
    const result = resolvePlayerOrNpcAction(
      state, a, inPlace, observedSocialContext,
    );
    afterEffects?.(result.state);
    return result;
  };
  if (a.actor !== state.playerId) return resolve();
  const timing: ActionTiming = ACTIONS[a.type];
  return executeTimedAction(
    state,
    ACTIONS[a.type].ap,
    timing,
    null,
    resolve,
    { inPlace, decision },
  );
}

function resolvePlayerOrNpcAction(
  state: GameState,
  a: Action,
  inPlace: boolean,
  observedSocialContext?: ObservedSocialContext,
): {
  state: GameState;
  error: string | null;
  event?: GameEvent;
} {
  const previousAP = state.ap;
  const next = inPlace ? state : structuredClone(state);
  const exposeActivity = () => {
    const location = observedSocialContext
      ? observedSocialContext.locationId
      : presenceOf(next).location;
    if (location)
      expose(next, location, "activity", String(previousAP), observedSocialContext?.peopleHere);
  };
  const crewActivity = crewActivityFor(state, a);
  if (a.target && crewActivity) {
    requestActivity(next, a.target, crewActivity);
    exposeActivity();
    settlePlayerProgress(next);
    syncEncounters(next);
    return { state: next, error: null, event: next.events.at(-1) };
  }
  const previousAccess = Object.values(state.zones)
    .filter((z) => !marketAccess(state, state.playerId, z.id))
    .map((z) => z.id);
  const event = resolveAction(next, a, observedSocialContext?.zone);
  for (const z of Object.values(next.zones))
    if (
      !previousAccess.includes(z.id) &&
      !marketAccess(next, next.playerId, z.id)
    )
      record(
        next,
        "city",
        `People you know in ${z.name} will let you work the street there now.`,
        [next.playerId],
        [next.playerId],
        { importance: "personal", title: "New market access" },
      );
  if (a.actor === next.playerId) {
    const location = presenceOf(next).location;
    if (a.type === "affiliate" && a.target && event)
      recordSponsorship(next, a.target, a.actor, event.id, location);
    if (a.type === "crime") {
      const zone = next.street.transactions.at(-1)?.market ?? player(next).home;
      const actual = streetLocation(zone);
      const previous = presenceOf(next);
      if (actual)
        next.presence = {
          ...previous,
          location: actual,
          zone,
          arrivedDay: next.day,
          trail:
            previous.location === actual
              ? previous.trail
              : [
                  ...previous.trail,
                  { location: previous.location, day: previous.arrivedDay },
                ].slice(-12),
        };
    }
    exposeActivity();
    settlePlayerProgress(next);
  }
  syncEncounters(next);
  return { state: next, error: null, event };
}
export function availableActions(s: GameState): Action[] {
  const p = player(s),
    incident = Object.values(s.incidents).find((i) => i.status === "active");
  const incidentId = incident?.id;
  const list: Action[] = (["work", "gig", "rest", "crime"] as ActionType[]).map(
    (type) => ({ type, actor: p.id }),
  );
  if (s.quanny.met)
    list.unshift({ type: "quanny", actor: p.id, target: "quanny" });
  if (currentEmployment(s)) {
    list.push(
      { type: "timeOff", actor: p.id },
      { type: "resign", actor: p.id },
    );
  } else {
    for (const job of jobOpportunities(s))
      list.push({ type: "apply", actor: p.id, jobId: job.id });
    const offered = searchState(s, p.id).offeredJob;
    if (offered) list.push({ type: "acceptJob", actor: p.id, jobId: offered });
  }
  for (const item of Object.keys(ITEMS) as ItemId[])
    list.push({ type: "buy", actor: p.id, item });
  for (const target of p.known.filter((id) => id !== p.id && s.characters[id]))
    for (const type of [
      "contact",
      "inquire",
      "introduce",
      "socialize",
      "offer",
      "transfer",
      "standing",
      "affiliate",
      "recruit",
      "remove",
      "settlement",
      "favor",
    ] as ActionType[]) {
      if (!incident && (type === "settlement" || type === "favor")) continue;
      list.push({ type, actor: p.id, target, incidentId });
    }
  if (incident)
    for (const type of ["negotiate", "buyback", "recover"] as ActionType[])
      list.push({ type, actor: p.id, incidentId });
  const priority = (a: Action) =>
    a.type === "acceptJob" ? 2 : a.type === "apply" ? 1 : 0;
  return list.sort((a, b) => priority(b) - priority(a));
}

/** The board travels before resolving an action; an arrival encounter can interrupt it. */
export function performActionAt(state: GameState, a: Action, location: string) {
  const error = validateAction(state, a);
  if (error) return { state, error };
  const arrived = moveTo(state, location);
  if (presenceOf(arrived).location !== location)
    return { state: arrived, error: "You can’t get there right now." };
  return performAction(arrived, a);
}
