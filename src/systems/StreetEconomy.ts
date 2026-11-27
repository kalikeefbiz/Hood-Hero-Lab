import {
  gain,
  gainError,
  receivePhysical,
  carriedLotQuantity,
  consumeLot,
} from "./Inventory";
import { equipmentBonus } from "./Equipment";
import { workIntroError, pabloError, personalBeef } from "./StreetAccess";
import { boardPeople } from "../board/people";
import { presenceOf } from "../board/presence";
import { awardBuyer, skillsOf, skillRank } from "./Skills";
import { applyInfluence, rivalControl } from "./Territory";
import { applyFactionConsequences } from "./gang/Consequences";
import { arrest } from "./Incarceration";
import {
  cash,
  clamp,
  player,
  type GameState,
  type Character,
  type ZoneId,
} from "../core/GameState";
import { ZONES } from "../content/city";
import { MERCHANDISE, STREET_BALANCE as B } from "../content/street";
import type { StreetState, MerchandiseLot } from "./StreetTypes";
import { record } from "../core/EventLog";
import { random } from "../core/Random";
import { earn, expense } from "./Economy";
import { change, remember } from "./Relationships";
import { finishCommitment } from "./Commitments";
import {
  addExposure,
  exposureScore,
  transactionArrestChance,
} from "./CriminalExposure";
import { availability, cooperation } from "./CrewAgency";
export function newStreetState(): StreetState {
  return {
    lots: [],
    agreements: [],
    transactions: [],
    exposure: {},
    custody: [
      {
        id: "custody-loco",
        character: "loco",
        arrestDay: 0,
        cause: "Preexisting canonical incarceration",
        severity: 0,
        prior: 0,
        releaseDay: null,
        status: "held",
        conditions: "Indefinite; no automatic release",
        eventId: "",
      },
    ],
    arrears: 0,
    markets: Object.fromEntries(
      Object.values(ZONES).map((z) => [
        z.id,
        {
          zone: z.id,
          demand: z.commerce,
          pressure: 10,
          competition: z.organizations.length * 12,
          activity: 0,
          actors: {},
          factions: {},
          usedDay: 0,
          used: 0,
          lastDevelopmentDay: 0,
        },
      ]),
    ) as StreetState["markets"],
  };
}
export function suppliers(s: GameState, actor = s.playerId) {
  // Reuse actual street contacts; lawful residents and Justice do not become dealers.
  return Object.values(s.characters)
    .filter(
      (c) =>
        c.id !== s.playerId &&
        (actor !== s.playerId || !pabloError(s, c.id)) &&
        !!c.affiliation &&
        c.traits.lawful < 65 &&
        c.status === "active",
    )
    .sort((a, b) => Number(a.id === "quanny") - Number(b.id === "quanny"));
}
export function marketAccess(
  s: GameState,
  actor: string,
  zone: ZoneId,
): string | null {
  const c = s.characters[actor];
  if (
    actor === s.playerId &&
    zone === "rio" &&
    c.affiliation !== "angels" &&
    !s.streetLife?.tribute.some((t) => t.day <= s.day && t.throughDay >= s.day)
  )
    return "This is Angels turf. Outsiders need an introduction and have to pay the Angels’ street contact $12 for three days.";
  if (
    actor === s.playerId &&
    zone === "rio" &&
    ["dizzy", "babycanon", "joker"].some((id) => personalBeef(s, id))
  )
    return "You still have beef with the crew here. Squash it with them first.";
  if (
    rivalControl(s, zone, c) &&
    c.neighborhoodStanding[zone] < 25
  )
    return "A rival set runs this neighborhood. You need people around here who know you before you can work it.";
  const local = suppliers(s, actor).some(
    (n) =>
      n.home === zone &&
      c.connections.includes(n.id) &&
      (n.relationships[actor]?.trust ?? 0) >= B.trust,
  );
  const connectedCrew =
    actor === s.playerId &&
    s.crew.members.some((id) => {
      const m = s.characters[id];
      const participating =
        m.status === "active" &&
        s.assignments.some(
          (a) =>
            a.status === "active" &&
            a.activity === "partner-crime" &&
            a.member === id &&
            a.participants.includes(actor),
        );
      return (
        (participating ||
          (!availability(s, m) &&
            cooperation(s, m, "partner-crime").accepted)) &&
        m.known.some(
          (n) =>
            s.characters[n]?.home === zone &&
            s.characters[n]?.affiliation &&
            c.connections.includes(n) &&
            (s.characters[n].relationships[actor]?.trust ?? 0) >= 10,
        )
      );
    });
  if (zone === "downtown")
    return c.neighborhoodStanding.downtown >= B.downtownStanding &&
      c.connections.some((id) => s.characters[id]?.home === zone) &&
      c.skills.social >= 50
      ? null
      : "To work Downtown you need a name there, someone local who knows you, and real people skills.";
  return local ||
    connectedCrew ||
    c.neighborhoodStanding[zone] >= 10 ||
    (c.affiliation &&
      s.zones[zone].organizations.includes(c.affiliation) &&
      c.organizationStanding[c.affiliation] >= 15)
    ? null
    : "You need someone local in your corner, or standing in this neighborhood.";
}
export function supplierError(
  s: GameState,
  supplier: string,
  arrangement: "cash" | "consignment",
) {
  if (s.activeRobbery && s.activeRobbery.status !== "ended")
    return "Finish the job first.";
  const intro = workIntroError(s);
  if (intro) return intro;
  if (pabloError(s, supplier)) return pabloError(s, supplier);
  if (s.streetLife && !s.streetLife.legacy) {
    const life = s.streetLife;
    const starterIds = [life.giftLot, life.starterLot].filter(Boolean);
    const replacementNeeded =
      starterIds.length > 0 &&
      !s.street.lots.some((l) => starterIds.includes(l.id) && l.remaining > 0);
    const firstPaidPack =
      life.initialDecision !== "promise" && !life.giftLot && !life.starterLot;
    if (
      life.lesson === "waiting" &&
      (supplier !== "mega" || (!firstPaidPack && !replacementNeeded))
    )
      return "Finish your first lesson with Cuzzo at the Lot before you look for other plugs.";
    if (
      boardPeople(s).find((n) => n.id === supplier)?.placeId !==
      presenceOf(s).location
    )
      return "Go see them in person.";
  }
  if (s.activeSession && s.activeSession.status !== "ended")
    return "Wrap up trapping first.";
  const p = player(s),
    n = s.characters[supplier];
  if (s.end || p.status !== "active")
    return "You can’t do that right now.";
  if (s.ap < 1) return "You need 1 AP.";
  if (
    !n ||
    !suppliers(s).some((c) => c.id === supplier) ||
    !p.connections.includes(supplier)
  )
    return "You don’t have a plug here.";
  if (n.availableDay > s.day) return "They’re busy today.";
  const mega = supplier === "mega",
    trust = n.relationships[p.id]?.trust ?? 0;
  const actualEnemy = s.danger.conflicts.some(
    (c) =>
      c.state !== "settled" &&
      c.participants.includes(supplier) &&
      c.participants.includes(p.id) &&
      (c.lethal || c.seriousness >= 35),
  );
  if (
    mega
      ? actualEnemy
      : personalBeef(s, supplier) ||
        (n.relationships[p.id]?.grievance ?? 0) > 55 ||
        trust < -10
  )
    return "There’s bad blood between you. Fix that first.";
  const cashIntro =
    s.streetLife &&
    !s.streetLife.legacy &&
    s.streetLife.lesson === "waiting" &&
    s.streetLife.initialDecision !== "promise";
  if (
    mega &&
    arrangement === "consignment" &&
    (s.streetLife?.initialDecision === "decline" || cashIntro)
  )
    return s.streetLife?.initialDecision === "decline"
      ? "Cuzzo remembers you turned him down. He’ll still sell to family, but cash only."
      : "Your first pack from Cuzzo is cash only."
  if (!mega) {
    if (trust < B.trust)
      return "They don’t know you well enough yet. Spend some time with them first.";
    if (
      p.affiliation &&
      n.affiliation &&
      s.factions[n.affiliation].enemies.includes(p.affiliation)
    )
      return "Your people and theirs don’t mix.";
    const debts = s.street.agreements.filter(
      (a) => a.debtor === p.id && a.supplier === supplier && a.balance > 0,
    );
    const balance = debts.reduce((v, a) => v + a.balance, 0);
    const paidRecently = s.street.agreements.some(
      (a) =>
        a.supplier === supplier &&
        a.debtor === p.id &&
        a.balance === 0 &&
        a.history.some((id) =>
          s.events.some((e) => e.id === id && e.day >= s.day - 12),
        ),
    );
    if (
      debts.length &&
      (trust < 45 ||
        debts.some((a) => a.status === "overdue") ||
        balance > (trust + (paidRecently ? 25 : 0) + n.traits.risk / 4) * 3)
    )
      return "“Come back when you pay me what you owe.”";
    const today = s.street.lots.filter(
      (l) =>
        l.owner === p.id && l.supplier === supplier && l.acquiredDay === s.day,
    ).length;
    if (today >= 2)
      return "They’re out for today. Come back tomorrow.";
    if (
      exposureScore(s, p.id, n.home) > B.supplierExposure ||
      n.police > B.supplierExposure
    )
      return "Too many eyes on you. They’re keeping their distance.";
    if (arrangement === "consignment" && trust < 30)
      return "They aren’t ready to front you a pack. Cash only for now.";
  }
  if (
    n.affiliation &&
    s.factions[n.affiliation].resources < MERCHANDISE.nightgoods.wholesale
  )
    return "They don’t have product to move today.";
  if (arrangement === "cash" && cash(p) < MERCHANDISE.nightgoods.wholesale)
    return "You need $90 cash.";
  return gainError(
    s,
    s.playerId,
    gain(
      "nightgoods",
      MERCHANDISE.nightgoods.quantity,
      "supplier",
      "pending-lot",
    ),
  );
}
export function acquire(
  s: GameState,
  supplier: string,
  arrangement: "cash" | "consignment",
) {
  if (supplierError(s, supplier, arrangement)) return;
  const p = player(s),
    n = s.characters[supplier],
    def = MERCHANDISE.nightgoods;
  const cost = arrangement === "cash" ? def.wholesale : def.consignment;
  s.ap--;
  const paid =
    arrangement === "cash"
      ? expense(s, p, cost, `Pink Magic purchase · ${n.alias ?? n.name}`)
      : null;
  if (paid) {
    n.wallet.clean += paid.clean;
    n.wallet.illicit += paid.illicit;
  }
  if (n.affiliation) applyFactionConsequences(s, n.affiliation, { resources: -def.wholesale });
  const lot: MerchandiseLot = {
    id: `lot-${s.nextId++}`,
    category: "nightgoods",
    owner: p.id,
    supplier,
    zone: n.home,
    received: def.quantity,
    remaining: def.quantity,
    lost: 0,
    cost,
    expectedGross: def.quantity * unitPrice(s, n.home),
    collected: 0,
    owed: arrangement === "consignment" ? cost : 0,
    paid: arrangement === "cash" ? cost : 0,
    losses: 0,
    crewPaid: 0,
    dueDay: s.day + B.deadline,
    acquiredDay: s.day,
    arrangement,
    status: "held",
  };
  s.street.lots.push(lot);
  receivePhysical(s, p.id, gain("nightgoods", lot.received, lot.id, lot.id));
  if (
    s.streetLife &&
    !s.streetLife.legacy &&
    supplier === "mega" &&
    s.streetLife.lesson === "waiting"
  )
    s.streetLife.starterLot = lot.id;
  const e = record(
    s,
    "money",
    `${n.alias ?? n.name} supplied ${def.quantity} Pink Magic. ${arrangement === "cash" ? `You paid $${cost} cash.` : `You owe $${cost} by the end of day ${lot.dueDay}.`} If it all sells, it could bring in about $${lot.expectedGross}.`,
    [p.id, n.id],
    [p.id, n.id],
    {
      importance: "major",
      title: "New pack",
      factionId: n.affiliation ?? undefined,
    },
  );
  if (arrangement === "consignment") {
    const commitmentId = `commitment-${s.nextId++}`,
      id = `agreement-${s.nextId++}`;
    lot.agreementId = id;
    s.street.agreements.push({
      id,
      lotId: lot.id,
      supplier,
      debtor: p.id,
      original: cost,
      repaid: 0,
      balance: cost,
      dueDay: lot.dueDay,
      status: "pending",
      commitmentId,
      history: [e.id],
    });
    s.commitments.push({
      id: commitmentId,
      origin: lot.id,
      requester: supplier,
      actor: p.id,
      beneficiary: supplier,
      createdDay: s.day,
      dueDay: lot.dueDay,
      kind: "supplier-debt",
      status: "pending",
      evidence: [e.id],
      warned: false,
      consequences: {
        fulfilled: { trust: 7, respect: 4, grievance: -4 },
        broken: {
          trust: -(8 + Math.floor(n.traits.ambition / 10)),
          respect: -5,
          grievance: 10 + Math.floor(n.traits.risk / 10),
        },
        released: { trust: 0, respect: 0, grievance: 0 },
      },
    });
  }
  remember(s, n.id, p.id, e.id, "Trusted me with a pack.", 0);
}
export function unitPrice(s: GameState, zone: ZoneId) {
  const m = s.street.markets[zone];
  return Math.max(
    30,
    Math.round(
      MERCHANDISE.nightgoods.unitPrice +
        (m.demand - 50) / 5 -
        m.pressure / 10 -
        m.competition / 12,
    ),
  );
}
export function saleLot(s: GameState, actor = s.playerId) {
  const selected =
    actor === s.playerId &&
    s.activeSession &&
    s.activeSession.status !== "ended"
      ? s.activeSession.lotId
      : undefined;
  return s.street.lots
    .filter(
      (l) =>
        l.owner === actor &&
        carriedLotQuantity(s, actor, l.id) > 0 &&
        (!selected || l.id === selected),
    )
    .sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id))[0];
}
export function saleMarket(s: GameState, actor = s.playerId) {
  const lot = saleLot(s, actor);
  return lot?.zone ?? s.characters[actor].home;
}
export function transactionError(
  s: GameState,
  actor = s.playerId,
  zone = saleMarket(s, actor),
) {
  const c = s.characters[actor];
  if (actor === s.playerId)
    return "Go to a spot in the City and start trapping there.";
  if (!c || c.status !== "active")
    return "You can’t do that right now.";
  if (actor === s.playerId && s.ap < 1) return "You need 1 AP.";
  if (!saleLot(s, actor))
    return "You don’t have any product. Get a pack from a plug first.";
  const access = marketAccess(s, actor, zone);
  if (access) return access;
  const m = s.street.markets[zone];
  if (m.usedDay === s.day && m.used >= B.marketDailyCapacity)
    return "Nobody else around here is buying today.";
  if (
    s.street.transactions.filter((t) => t.actor === actor && t.day === s.day)
      .length >= B.transactionLimit
  )
    return "That’s all for today. Come back tomorrow.";
  return null;
}
export function transactionChance(
  s: GameState,
  actor = s.playerId,
  zone = saleMarket(s, actor),
  partner?: string,
) {
  const c = s.characters[actor],
    m = s.street.markets[zone],
    n = partner ? s.characters[partner] : undefined;
  const support = n
    ? clamp(
        0 +
          (n.relationships[actor]?.trust ?? 0) / 1200 -
          n.stress / 650 -
          n.police / 900,
        -0.16,
        0.16,
      )
    : 0;
  const conflict =
    c.affiliation &&
    s.zones[zone].organizations.some((f) =>
      s.factions[f].enemies.includes(c.affiliation!),
    )
      ? 0.12
      : 0;
  return clamp(
    B.baseSuccess +
      (m.demand - 50) / 500 +
      support +
      (equipmentBonus(c).defense + (n ? equipmentBonus(n).defense : 0)) / 500 -
      exposureScore(s, actor, zone) / 220 -
      c.stress / 650 -
      c.rivalThreat / 1000 -
      m.pressure / 500 -
      (m.competition + (s.strategic.territories[zone].contested ? 10 : 0)) /
        900 -
      conflict,
    B.minSuccess,
    B.maxSuccess,
  );
}
function resolveTransaction(
  s: GameState,
  actor = s.playerId,
  zone = saleMarket(s, actor),
  partner?: string,
  buyer = false,
) {
  if (
    s.end ||
    (buyer ? buyerError(s, actor, zone) : transactionError(s, actor, zone))
  )
    return;
  if (
    partner &&
    (!s.crew.members.includes(partner) ||
      s.characters[partner]?.status !== "active" ||
      !s.assignments.some(
        (a) =>
          a.status === "active" &&
          a.activity === "partner-crime" &&
          a.member === partner &&
          a.participants.includes(actor),
      ))
  )
    return;
  if (actor === s.playerId && !buyer) s.ap--;
  else s.characters[actor].lastActionDay = s.day;
  const l = saleLot(s, actor)!,
    c = s.characters[actor],
    m = s.street.markets[zone];
  const policeChance = transactionArrestChance(s, actor, zone);
  const chance = transactionChance(s, actor, zone, partner),
    roll = random(s);
  if (m.usedDay !== s.day) {
    m.usedDay = s.day;
    m.used = 0;
  }
  const capacity = Math.min(
    carriedLotQuantity(s, actor, l.id),
    buyer
      ? Math.min(1 + Math.floor((skillRank(c, "trapper") - 1) / 2), l.remaining)
      : 2 + (m.demand >= 60 ? 1 : 0),
    B.marketDailyCapacity - m.used,
  );
  let sold = 0,
    lost = 0,
    loss = 0;
  let outcome: import("./StreetTypes").StreetTransaction["outcome"] = "none";
  if (roll < chance) {
    sold = roll < chance * 0.65 ? capacity : Math.max(1, capacity - 1);
    outcome = sold === capacity ? "sale" : "partial";
  } else {
    const failure = random(s);
    if (failure < 0.35) {
      lost = Math.min(carriedLotQuantity(s, actor, l.id), buyer ? 1 : 2);
      outcome = "goods-loss";
    } else if (failure < 0.65) {
      loss = Math.min(18, cash(c));
      outcome = "money-loss";
    }
  }
  const gross = sold * (unitPrice(s, zone) + (skillRank(c, "trapper") - 1) * 2),
    share = partner ? Math.floor(gross * B.crewShare) : 0;
  consumeLot(s, actor, l.id, sold + lost);
  l.remaining -= sold + lost;
  l.lost += lost;
  l.collected += gross;
  l.losses += loss;
  l.crewPaid += share;
  if (gross) earn(s, c, gross, "illicit", "Pink Magic transaction");
  if (loss) expense(s, c, loss, "Street transaction loss");
  const crewLoss =
    partner && loss ? Math.min(B.crewLoss, cash(s.characters[partner])) : 0;
  if (crewLoss)
    expense(s, s.characters[partner!], crewLoss, "Shared street loss");
  if (share) {
    const paid = expense(s, c, share, "Your Set’s cut")!;
    const member = s.characters[partner!];
    member.wallet.clean += paid.clean;
    member.wallet.illicit += paid.illicit;
  }
  if (!l.remaining)
    l.status = l.owed ? (l.lost ? "lost" : "distributed") : "settled";
  m.used += buyer ? Math.max(1, sold + lost) : capacity;
  m.activity += sold;
  m.pressure = clamp(m.pressure + 3 + lost * 2);
  m.actors[actor] = (m.actors[actor] ?? 0) + sold;
  if (c.affiliation) {
    m.factions[c.affiliation] = (m.factions[c.affiliation] ?? 0) + sold;
    applyFactionConsequences(s, c.affiliation, {
      resources: Math.floor(gross * 0.05),
      contribution: actor === s.playerId ? Math.min(3, gross * 0.01) : undefined,
    });
    if (sold)
      applyInfluence(s, {
        actor,
        faction: c.affiliation,
        zone,
        kind: "economic",
        magnitude: Math.min(1.5, sold * 0.15),
        cause: `${c.name}'s commerce contributed to ${s.factions[c.affiliation].name}'s economic presence.`,
      });
  }
  c.stress = clamp(c.stress + (buyer ? 2 : 7));
  c.rivalThreat = clamp(
    c.rivalThreat + (buyer ? 0.6 : 2) + m.competition / (buyer ? 100 : 25),
  );
  const weight = lost
    ? B.goodsLossExposure
    : loss
      ? B.moneyLossExposure
      : sold
        ? B.actionExposure
        : B.noBuyerExposure;
  addExposure(s, actor, zone, buyer ? weight / 3 : weight);
  if (actor === s.playerId || partner === s.playerId)
    s.strategic.lastCrimeDay = s.day;
  if (partner) {
    const n = s.characters[partner];
    addExposure(
      s,
      partner,
      zone,
      (weight * B.crewExposureShare) / (buyer ? 3 : 1),
      lost > 0,
    );
    n.stress = clamp(n.stress + (buyer ? 2 : 7));
    n.rivalThreat = clamp(n.rivalThreat + 3);
  }
  const text = `${c.name} · ${s.zones[zone].name}: ${sold ? `${outcome === "partial" ? "Partly sold" : "Sold"} ${sold} Pink Magic for $${gross}.` : `No sale.${lost ? ` You lost ${lost}, and you still owe for them.` : loss ? ` You lost $${loss}.` : " Nobody bit."}`} ${l.remaining} left on you.${partner ? ` ${s.characters[partner].name} worked it with you and took $${share}.` : ""}`;
  const e = record(
    s,
    "money",
    text,
    [actor, ...(partner ? [partner] : [])],
    [actor, ...(partner ? [partner] : [])],
    {
      importance: lost ? "personal" : "routine",
      factionId: c.affiliation ?? undefined,
    },
  );
  if (l.agreementId)
    s.street.agreements.find((a) => a.id === l.agreementId)!.history.push(e.id);
  if (!l.remaining && l.arrangement === "cash") {
    change(s.characters[l.supplier], actor, { trust: 2 });
    remember(s, l.supplier, actor, e.id, "Moved a whole pack they sold me.", 2);
  }
  s.street.transactions.push({
    id: `transaction-${s.nextId++}`,
    ...(buyer
      ? {
          sessionId: s.activeSession!.id,
          sessionCursor: s.activeSession!.cursor,
        }
      : {}),
    day: s.day,
    lotId: l.id,
    market: zone,
    actor,
    partner,
    sold,
    lost,
    gross,
    loss,
    crewPaid: share,
    crewLoss,
    outcome,
    eventId: e.id,
  });
  awardBuyer(s, actor, e.id, sold ? "sale" : "failed");
  if (partner) awardBuyer(s, partner, e.id, sold ? "sale" : "failed");
  const progress = skillsOf(c);
  if (sold) {
    progress.milestones[`zone:${zone}`] = 1;
    progress.milestones.commercialZones = Object.keys(
      progress.milestones,
    ).filter((k) => k.startsWith("zone:")).length;
  }
  if (
    !l.remaining &&
    sold &&
    s.street.transactions
      .filter((t) => t.lotId === l.id)
      .reduce((n, t) => n + t.sold, 0) >= Math.ceil(l.received / 2) &&
    !progress.milestones[`lot:${l.id}`]
  ) {
    progress.milestones[`lot:${l.id}`] = 1;
    progress.milestones.supplyHistory =
      (progress.milestones.supplyHistory ?? 0) + 1;
  }
  if (random(s) < policeChance)
    arrest(s, actor, "police intervention during street work", 1);
  if (partner && random(s) < transactionArrestChance(s, partner, zone))
    arrest(s, partner, "participating in street work", 1);
  return e;
}
/** Autonomous NPC activity keeps the existing economy; the player uses City sessions. */
export function transact(
  s: GameState,
  actor = s.playerId,
  zone = saleMarket(s, actor),
  partner?: string,
) {
  if (actor === s.playerId) return;
  return resolveTransaction(s, actor, zone, partner);
}
export function buyerError(s: GameState, actor: string, zone: ZoneId) {
  if (s.end || s.characters[actor]?.status !== "active")
    return "You can’t do that right now.";
  if (actor === s.playerId && workIntroError(s)) return workIntroError(s);
  if (!saleLot(s, actor)) return "You don’t have any Pink Magic on you.";
  const access = marketAccess(s, actor, zone);
  if (access) return access;
  const m = s.street.markets[zone];
  return m.usedDay === s.day && m.used >= B.marketDailyCapacity
    ? "Today's local demand is filled."
    : null;
}
/** Only a currently unpaid beat of an already paid session may settle a player buyer. */
export function resolveStreetBuyer(
  s: GameState,
  sessionId: string,
  cursor: number,
) {
  const a = s.activeSession;
  if (
    !a ||
    a.id !== sessionId ||
    a.cursor !== cursor ||
    a.status !== "active" ||
    a.settled.includes(`${a.id}:${cursor}`) ||
    a.beats[cursor]?.kind !== "buyer" ||
    s.street.transactions.some(
      (t) => t.sessionId === sessionId && t.sessionCursor === cursor,
    )
  )
    return;
  return resolveTransaction(s, s.playerId, a.zone, a.partner, true);
}
export function paymentError(
  s: GameState,
  agreementId: string,
  amount: number,
) {
  const a = s.street.agreements.find((a) => a.id === agreementId);
  if (
    s.streetLife &&
    !s.streetLife.legacy &&
    a &&
    boardPeople(s).find((n) => n.id === a.supplier)?.placeId !==
      presenceOf(s).location
  )
    return "Go see them in person to pay.";
  if (s.end || player(s).status !== "active")
    return "You can’t pay from a cell.";
  if (!a || a.debtor !== s.playerId || a.balance <= 0)
    return "You don’t owe them anything.";
  if (!s.characters[a.supplier] || s.characters[a.supplier].status !== "active")
    return "They aren’t around. You still owe it.";
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > a.balance ||
    cash(player(s)) < amount
  )
    return "Pick an amount you can cover, no more than you owe.";
  return null;
}
export function repay(s: GameState, agreementId: string, amount: number) {
  if (paymentError(s, agreementId, amount)) return;
  const a = s.street.agreements.find((a) => a.id === agreementId)!,
    l = s.street.lots.find((l) => l.id === a.lotId)!,
    n = s.characters[a.supplier];
  const paid = expense(s, player(s), amount, `Supplier repayment · ${n.alias ?? n.name}`)!;
  n.wallet.clean += paid.clean;
  n.wallet.illicit += paid.illicit;
  a.repaid += amount;
  a.balance -= amount;
  l.owed = a.balance;
  l.paid += amount;
  const e = record(
    s,
    "money",
    `Paid ${n.alias ?? n.name} $${amount}. You still owe $${a.balance}.`,
    [s.playerId, n.id],
    undefined,
    { importance: "personal", commitmentId: a.commitmentId },
  );
  a.history.push(e.id);
  if (!a.balance) {
    const overdue = a.status === "overdue";
    a.status = "fulfilled";
    const promise = s.commitments.find((c) => c.id === a.commitmentId)!;
    if (overdue) {
      change(n, s.playerId, { trust: 5, grievance: -8 });
      remember(
        s,
        n.id,
        s.playerId,
        e.id,
        "Paid me back, but late.",
        3,
      );
    } else
      finishCommitment(s, promise, "fulfilled", a.history, {
        title: "Supplier paid",
        text: `${n.alias ?? n.name}: “We're square. You kept your word.”`,
        memory: "Paid me back on time.",
        weight: 7,
      });
    if (!l.remaining) l.status = "settled";
    const p = skillsOf(player(s));
    p.milestones.supplierPaid = 1;
    if ((n.relationships[s.playerId]?.trust ?? 0) >= 30)
      p.milestones.supplierCredible = 1;
  }
}
export function advanceStreet(s: GameState) {
  for (const a of s.street.agreements) {
    // NPC debts are collected face to face; a missed player visit is not NPC refusal.
    if (
      a.debtor !== s.playerId ||
      a.status !== "pending" ||
      !a.balance ||
      s.day <= a.dueDay
    )
      continue;
    a.status = "overdue";
    const n = s.characters[a.supplier],
      p = s.characters[a.debtor];
    p.rivalThreat = clamp(p.rivalThreat + Math.min(10, n.traits.risk / 10));
    finishCommitment(
      s,
      s.commitments.find((c) => c.id === a.commitmentId)!,
      "broken",
      a.history,
      {
        title: `${n.alias ?? n.name} is still owed`,
        text: `${n.alias ?? n.name}: “Day ${a.dueDay} came and went. You still owe me $${a.balance}. Bring what you can. ${n.id === "mega" ? "You’re still family, but a deadline is a deadline." : "Get this straight before you ask me for anything else."}”`,
        memory: "Didn’t pay me back on time.",
        weight: -12,
      },
    );
  }
  for (const m of Object.values(s.street.markets)) {
    m.pressure = Math.max(0, m.pressure - 2);
    // Real local actors and organization resources drive bounded autonomous market changes.
    const local = suppliers(s, "autonomy").filter(
      (c) =>
        c.home === m.zone && c.availableDay <= s.day && c.traits.risk >= 35,
    );
    const active = local[(s.day + local.length) % Math.max(1, local.length)];
    if (
      active &&
      s.day % 3 === 0 &&
      active.affiliation &&
      s.factions[active.affiliation].resources > 20
    ) {
      m.activity++;
      m.actors[active.id] = (m.actors[active.id] ?? 0) + 1;
      m.factions[active.affiliation] =
        (m.factions[active.affiliation] ?? 0) + 1;
      m.pressure = clamp(m.pressure + 4);
      m.competition = clamp(m.competition + 1, 0, 50);
      applyFactionConsequences(s, active.affiliation, { resources: 2 });
      m.demand = clamp(
        m.demand +
          (s.factions[active.affiliation].priority === "commerce" ? 1 : -1),
        25,
        95,
      );
      if (
        s.day - m.lastDevelopmentDay >= 9 &&
        player(s).known.includes(active.id) &&
        marketAccess(s, s.playerId, m.zone) === null
      ) {
        m.lastDevelopmentDay = s.day;
        record(
          s,
          "city",
          `${active.name} has been selling in ${s.zones[m.zone].name}. There’s more competition for buyers now.`,
          [active.id],
          [s.playerId],
          {
            importance: "personal",
            factionId: active.affiliation,
            title: "Local market shifted",
          },
        );
      }
    }
  }
}
export function lotProfit(l: MerchandiseLot) {
  return l.collected - l.cost - l.losses - l.crewPaid;
}
