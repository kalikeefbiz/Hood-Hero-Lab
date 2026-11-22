import { gain, gainError, receivePhysical } from "./Inventory";
import { awardSkill } from "./Skills";
import { player, cash, type GameState, type Incident } from "../core/GameState";
import { record } from "../core/EventLog";
import { boardPeople } from "../board/people";
import { LOCATIONS } from "../board/locations";
import { presenceOf } from "../board/presence";
import { hospitalStay, streetConversation, addGrievance } from "./Danger";
import { connect, change } from "./Relationships";
import { earn, expense } from "./Economy";
import { TRIO, personalBeef } from "./StreetAccess";
import { unitPrice } from "./StreetEconomy";
import { currentEncounter } from "./EncounterLifecycle";
export function atPerson(s: GameState, id: string) {
  return (
    boardPeople(s).find((n) => n.id === id)?.placeId === presenceOf(s).location
  );
}
export function safeStory(s: GameState) {
  return (
    !s.end &&
    player(s).status === "active" &&
    !hospitalStay(s) &&
    !streetConversation(s) &&
    (!s.activeSession || s.activeSession.status === "ended") &&
    (!s.activeRobbery || s.activeRobbery.status === "ended")
  );
}
export function openingDecision(
  s: GameState,
  choice: "promise" | "decline" | "delay",
) {
  const t = s.streetLife;
  if (!t || t.legacy) return;
  t.decision = choice;
  t.decisionDay ??= s.day;
  if (choice !== "delay") t.initialDecision ??= choice;
  record(
    s,
    "system",
    "Start with honest work: apply for a job, or pick up a gig at the docks, the Street market or Lil Jay’s. Jobs pay by the shift once you’re hired; gigs pay the same day.",
    [s.playerId],
    undefined,
    { title: "Honest work first", importance: "personal" },
  );
}
export function completeWorkIntro(
  s: GameState,
  eventId: string,
  activity: "apply" | "acceptJob" | "gig",
  jobId?: string,
) {
  const t = s.streetLife;
  if (!t || t.legacy || t.workEvent || t.decision === "unasked") return;
  const event = s.events.find((e) => e.id === eventId);
  const l = LOCATIONS.find((l) => l.id === presenceOf(s).location);
  if (
    !l ||
    !event ||
    (activity === "gig"
      ? !l.links.gig &&
        !(l.id === "reservoir.lil-jays" && event.actors.includes("mr-lewis"))
      : l.links.job !== jobId)
  )
    return;
  t.workEvent = eventId;
  record(
    s,
    "social",
    t.initialDecision === "promise"
      ? "Cuzzo: “Get your work straight. Flacco heard you had my back. When you have stock, meet me at the Lot.”"
      : "Cuzzo: “I’m disappointed, but family is family. Come see me on Southside. Six Pink Magic is $90 cash. Then we’ll work the Lot.”",
    ["mega", s.playerId],
    undefined,
    { title: "Meet Cuzzo at the Lot", importance: "personal" },
  );
}
export function giveFlaccoStock(s: GameState) {
  const t = s.streetLife;
  if (
    !t ||
    t.legacy ||
    t.initialDecision !== "promise" ||
    t.giftLot ||
    t.starterLot ||
    s.day < 3 ||
    !safeStory(s) ||
    gainError(s, s.playerId, gain("nightgoods", 6, "gift", "pending-lot"))
  )
    return;
  const id = `lot-${s.nextId++}`;
  s.street.lots.push({
    id,
    category: "nightgoods",
    owner: s.playerId,
    supplier: "flacco",
    zone: "south",
    received: 6,
    remaining: 6,
    lost: 0,
    cost: 0,
    expectedGross: 6 * unitPrice(s, "south"),
    collected: 0,
    owed: 0,
    paid: 0,
    losses: 0,
    crewPaid: 0,
    dueDay: s.day + 6,
    acquiredDay: s.day,
    arrangement: "cash",
    status: "held",
  });
  receivePhysical(s, s.playerId, gain("nightgoods", 6, id, id));
  t.giftLot = id;
  record(
    s,
    "money",
    "Flacco: “You know I got you, right? Don’t ask where I got it. Just use that to help Cuz, then come holla at me.” Six Pink Magic, free and clear.",
    ["flacco", s.playerId],
    undefined,
    { title: "Flacco has your back", importance: "major" },
  );
}
export function trioOutcome(
  s: GameState,
  i: Incident | undefined = s.incidents["the-chains"],
) {
  if (i?.resolution === "recovered" && i.resolvedBy === s.playerId)
    return "hostile" as const;
  if (
    i?.resolution === "buyback" &&
    i.resolvedBy === s.playerId &&
    i.reducedDemand !== undefined &&
    i.paidDemand === i.reducedDemand &&
    i.paidDemand < (i.originalDemand ?? 150)
  )
    return "discount" as const;
  if (
    i?.resolution === "buyback" &&
    i.resolvedBy === s.playerId &&
    i.cleanFullPrice
  )
    return "buster" as const;
  return "nonfactor" as const;
}
export const aftermathLines = {
  hostile:
    "Dizzy: “You took that chain back? You challenged all three of us.” Baby Canon steps in beside Joker. This is between you and the three of them now.",
  discount:
    "Joker: “We gave you that discount because the chain was too much drama. Next thing we take, it costs a whole lot more to get back.” The others nod. They move as one.",
  buster:
    "Baby Canon: “Cuz paid what we asked. Buster did what was best for him.” Dizzy shrugs. Nobody’s looking for trouble.",
  nonfactor:
    "Dizzy: “Aye dick, ain’t this that foo Megas perro?” Baby Canon and Joker laugh. To them, you were never part of it.",
};
export function settleAftermath(s: GameState) {
  const t = s.streetLife;
  if (
    !t ||
    t.aftermathEvent ||
    !s.incidents["the-chains"] || s.incidents["the-chains"].status === "active" ||
    !TRIO.some((id) => atPerson(s, id))
  )
    return;
  t.aftermath = trioOutcome(s);
  const e = record(
    s,
    "social",
    aftermathLines[t.aftermath],
    [s.playerId, ...TRIO],
    undefined,
    { title: "The crew remembers", importance: "major" },
  );
  t.aftermathEvent = e.id;
  for (const id of TRIO) {
    connect(s, s.playerId, id);
    if (t.aftermath === "hostile")
      addGrievance(
        s,
        id,
        s.playerId,
        "You challenged the crew over the chains",
        e.id,
        38,
        false,
      );
  }
}
export const RIO_TRIBUTE = 12;
export function rioIntroductionError(s: GameState, id: string) {
  if (!TRIO.includes(id) || !atPerson(s, id))
    return "Find one of them in Rio Gabriel.";
  if (!safeStory(s)) return "Finish your current activity first.";
  if (TRIO.some((member) => personalBeef(s, member)))
    return "Squash your beef with them first.";
  if ((s.characters[id].relationships[s.playerId]?.trust ?? 0) < 35)
    return "They don’t trust you enough for that yet.";
  if (s.streetLife?.rioContact)
    return "You already know their street contact.";
  if (s.ap < 1) return "You need 1 AP.";
  return null;
}
export function introduceRio(s: GameState, id: string) {
  if (rioIntroductionError(s, id) || !s.streetLife) return;
  s.ap--;
  s.streetLife.rioContact = "contact-angels";
  connect(s, s.playerId, "contact-angels");
  change(s.characters["contact-angels"], s.playerId, { trust: 12 });
  record(
    s,
    "social",
    `${s.characters[id].name}: “I can put you on with our street contact. Knowing him don’t mean you can work our turf, though. Ask him what it costs.”`,
    [s.playerId, id, "contact-angels"],
  );
}
export function tributeError(s: GameState) {
  if (!s.streetLife?.rioContact || !atPerson(s, "contact-angels"))
    return "Find the street contact you were introduced to.";
  if (!safeStory(s)) return "Finish your current activity first.";
  if (TRIO.some((id) => personalBeef(s, id)))
    return "You still have beef with the crew here.";
  if (
    player(s).affiliation &&
    s.factions.angels.enemies.includes(player(s).affiliation!)
  )
    return "They won’t deal with someone from a rival set.";
  if (s.streetLife.tribute.some((t) => t.throughDay >= s.day))
    return "You’re already paid up.";
  if (cash(player(s)) < RIO_TRIBUTE)
    return "It’s $12, cash.";
  return null;
}
export function payTribute(s: GameState) {
  if (tributeError(s)) return;
  const paid = expense(
    s,
    player(s),
    RIO_TRIBUTE,
    "Paid the Angels to work Rio Gabriel",
  )!;
  s.characters["contact-angels"].wallet.clean += paid.clean;
  s.characters["contact-angels"].wallet.illicit += paid.illicit;
  const e = record(
    s,
    "money",
    `You paid the Angels’ street contact $12 to work Rio Gabriel through day ${s.day + 2}.`,
    [s.playerId, "contact-angels"],
  );
  s.streetLife!.tribute.push({
    id: `tribute-${s.nextId++}`,
    day: s.day,
    throughDay: s.day + 2,
    contact: "contact-angels",
    amount: RIO_TRIBUTE,
    eventId: e.id,
  });
  s.streetLife!.exchanges.push({
    id: e.id,
    quantity: 0,
    paid: 12,
    received: 0,
  });
}
export const LEWIS_DELIVERY_WAGE = 38;
export function lawfulLewisError(s: GameState) {
  if (!s.streetLife || s.streetLife.scenes.lewis) return "This delivery is unavailable.";
  if (!atPerson(s, "mr-lewis")) return "Find Mr. Lewis at the market.";
  if (!safeStory(s)) return "Finish what you’re doing first.";
  return s.ap < 1 ? "You need 1 AP." : null;
}
export function lawfulLewis(s: GameState) {
  if (lawfulLewisError(s)) return;
  s.ap--;
  earn(s, player(s), LEWIS_DELIVERY_WAGE, "clean", "Delivery gig for Mr. Lewis");
  const e = record(
    s,
    "money",
    "Mr. Lewis: “A neighbor needed groceries delivered. You showed up. Here’s $38, honest pay. There’s always room for someone reliable.”",
    [s.playerId, "mr-lewis"],
  );
  change(s.characters["mr-lewis"], s.playerId, { trust: 6 });
  s.progression.jobs++;
  awardSkill(s, s.playerId, "work", 100, e.id);
  s.streetLife!.scenes.lewis = e.id;
  s.streetLife!.exchanges.push({
    id: e.id,
    quantity: 0,
    paid: 0,
    received: LEWIS_DELIVERY_WAGE,
    provenance: "clean",
  });
  completeWorkIntro(s, e.id, "gig");
}
export function canQueueLife(s: GameState) {
  return safeStory(s) && !currentEncounter(s);
}
