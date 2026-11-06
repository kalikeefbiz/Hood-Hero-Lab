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
    "First steps: visit a City workplace and submit a valid application, or finish a local gig at the docks, Street market or Lil Jay’s. An application is unpaid; accepted jobs require scheduled shifts. Gigs pay now.",
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
      ? "Mega: “Get your work straight. Flacco heard you had my back. When you have stock, meet me at the Lot.”"
      : "Mega: “I’m disappointed, but family is family. Come see me on Southside. Six Pink Magic is $90 cash. Then we’ll work the Lot.”",
    ["mega", s.playerId],
    undefined,
    { title: "Meet Mega at the Lot", importance: "personal" },
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
    "Flacco: “You know I got you, right? Don’t ask where I got it. Just use that to help Cuz, then come holla at me.” Six Pink Magic received free. No debt or supplier cost.",
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
    "Dizzy: “You took that chain back? You challenged all three of us.” Baby Canon steps in beside Joker. This is personal beef with the crew, not a war with every Angel.",
  discount:
    "Joker: “We gave you that discount because the chain was too much drama. Next thing we take, it costs a whole lot more to get back.” The others nod. They work as one crew.",
  buster:
    "Baby Canon: “Cuz paid what we asked. Buster did what was best for him.” Dizzy shrugs. They leave room for ordinary business.",
  nonfactor:
    "Dizzy: “Aye dick, ain’t this that foo Megas perro?” Baby Canon and Joker laugh. To this crew you were a nonfactor in the Chains drama.",
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
        "Challenged the Chains crew",
        e.id,
        38,
        false,
      );
  }
}
export const RIO_TRIBUTE = 12;
export function rioIntroductionError(s: GameState, id: string) {
  if (!TRIO.includes(id) || !atPerson(s, id))
    return "Meet a member of the crew physically in Rio Gabriel.";
  if (!safeStory(s)) return "Finish your current activity first.";
  if (TRIO.some((member) => personalBeef(s, member)))
    return "Resolve your personal beef through an actual conversation first.";
  if ((s.characters[id].relationships[s.playerId]?.trust ?? 0) < 35)
    return "Requires 35 trust toward you from this member.";
  if (s.streetLife?.rioContact)
    return "You already know the Rio street contact.";
  if (s.ap < 1) return "Requires 1 AP.";
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
    `${s.characters[id].name}: “I can introduce you to our street contact. Knowing them isn’t permission to work our turf. Ask about the price first.”`,
    [s.playerId, id, "contact-angels"],
  );
}
export function tributeError(s: GameState) {
  if (!s.streetLife?.rioContact || !atPerson(s, "contact-angels"))
    return "Meet the introduced Rio street contact.";
  if (!safeStory(s)) return "Finish your current activity first.";
  if (TRIO.some((id) => personalBeef(s, id)))
    return "The crew’s unresolved personal beef blocks this territory agreement.";
  if (
    player(s).affiliation &&
    s.factions.angels.enemies.includes(player(s).affiliation!)
  )
    return "Rival affiliation prevents permission.";
  if (s.streetLife.tribute.some((t) => t.throughDay >= s.day))
    return "Your territory permission is already paid.";
  if (cash(player(s)) < RIO_TRIBUTE)
    return "Requires $12. No permission or bill without payment.";
  return null;
}
export function payTribute(s: GameState) {
  if (tributeError(s)) return;
  const paid = expense(
    s,
    player(s),
    RIO_TRIBUTE,
    "Angels territory permission · Rio street contact",
  )!;
  s.characters["contact-angels"].wallet.clean += paid.clean;
  s.characters["contact-angels"].wallet.illicit += paid.illicit;
  const e = record(
    s,
    "money",
    `Agreed and paid $12 to the Angels street contact for Rio Gabriel trapping permission through day ${s.day + 2}. Product costs are separate. Renew before working again.`,
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
export function lawfulLewis(s: GameState) {
  if (
    !safeStory(s) ||
    !atPerson(s, "mr-lewis") ||
    s.ap < 1 ||
    s.streetLife?.scenes.lewis
  )
    return;
  s.ap--;
  earn(s, player(s), 38, "clean", "Mr. Lewis community delivery gig");
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
    received: 38,
    provenance: "clean",
  });
  completeWorkIntro(s, e.id, "gig");
}
export function canQueueLife(s: GameState) {
  return safeStory(s) && !currentEncounter(s);
}
