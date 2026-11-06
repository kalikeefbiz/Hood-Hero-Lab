import {
  giveItem,
  giveItemError,
  collectSetConsignment,
} from "./InventoryExchanges";
import {
  gainError,
  gain,
  receivePhysical,
  consumeLot,
  carriedLotQuantity,
} from "./Inventory";
import { atPerson } from "./StreetLife";
import { lessonError } from "./StreetAccess";
import { skillsOf } from "./Skills";
/** Directional consignment uses the same merchandise, agreement, commitment and ledger model. */
import { type GameState, player, cash } from "../core/GameState";
import { record } from "../core/EventLog";
import { STREET_BALANCE, MERCHANDISE } from "../content/street";
import { saleLot, unitPrice } from "./StreetEconomy";
import { earn, expense } from "./Economy";
import { quannyCollectionInstruction } from "./QuannyState";
import { change } from "./Relationships";
export const receivable = (s: GameState, debtor: string) =>
  s.street.agreements.find(
    (a) =>
      a.supplier === s.playerId &&
      a.debtor === debtor &&
      a.balance > 0 &&
      a.status !== "disputed",
  );
export function consignmentTerms(s: GameState, negotiated = false) {
  const lot = saleLot(s);
  if (!lot) return null;
  // Wholesale is the floor; the distributor retains a margin on current market value.
  const unit = s.crew.members.includes("quanny")
    ? MERCHANDISE.nightgoods.wholesale / MERCHANDISE.nightgoods.quantity
    : Math.max(
        MERCHANDISE.nightgoods.wholesale / MERCHANDISE.nightgoods.quantity,
        Math.floor(unitPrice(s, "reservoir") * (negotiated ? 0.85 : 0.75)),
      );
  const carried = carriedLotQuantity(s, s.playerId, lot.id);
  const quantity = s.crew.members.includes("quanny")
    ? (s.characters[s.playerId].inventory?.slots.find(
        (x) => x.kind === "merchandise" && x.lotId === lot.id,
      )?.quantity ?? 0)
    : carried;
  return { lot, quantity, amount: Math.round(quantity * unit) };
}
export function frontMerchandiseError(
  s: GameState,
  debtor: string,
  negotiated = false,
): string | null {
  const terms = consignmentTerms(s, negotiated);
  if (!terms) return "No Pink Magic on person.";
  if (s.crew.members.includes(debtor)) {
    const x = s.characters[s.playerId].inventory?.slots.find(
      (x) => x.kind === "merchandise" && x.lotId === terms.lot.id,
    );
    return x
      ? giveItemError(s, debtor, x.id, x.quantity)
      : "No Pink Magic on person.";
  }
  if (lessonError(s)) return lessonError(s);
  if (
    (s.activeSession && s.activeSession.status !== "ended") ||
    (s.activeRobbery && s.activeRobbery.status !== "ended")
  )
    return "Finish your current session first.";
  if (!s.characters[debtor]) return "Unknown contact.";
  if (s.streetLife && !s.streetLife.legacy && !atPerson(s, debtor))
    return "Meet this contact in the City first.";
  if (receivable(s, debtor)) return "Collect the existing agreement first.";
  if (cash(s.characters[debtor]) < terms.amount)
    return "Contact operating cash is unavailable.";
  return gainError(
    s,
    debtor,
    gain("nightgoods", terms.quantity, "consignment", "pending-lot"),
  );
}
export function frontMerchandise(
  s: GameState,
  debtor: string,
  negotiated = false,
) {
  if (frontMerchandiseError(s, debtor, negotiated)) return;
  if (s.crew.members.includes(debtor)) {
    const terms = consignmentTerms(s, negotiated)!;
    const slot = s.characters[s.playerId].inventory?.slots.find(
      (x) => x.kind === "merchandise" && x.lotId === terms.lot.id,
    );
    if (!slot) return;
    const result = giveItem(s, debtor, slot.id, slot.quantity);
    if (typeof result !== "string") Object.assign(s, result);
    return;
  }
  const terms = consignmentTerms(s, negotiated)!;
  expense(s, s.characters[debtor], terms.amount, "Consignment payment reserve");
  const { lot: source, quantity, amount } = terms;
  const lotId = `lot-${s.nextId++}`,
    id = `agreement-${s.nextId++}`,
    commitmentId = `commitment-${s.nextId++}`,
    dueDay = s.day + STREET_BALANCE.deadline;
  consumeLot(s, s.playerId, source.id, quantity);
  source.remaining -= quantity;
  source.transferred = (source.transferred ?? 0) + quantity;
  source.status = "distributed";
  s.street.lots.push({
    id: lotId,
    sourceLotId: source.id,
    category: source.category,
    owner: debtor,
    supplier: s.playerId,
    zone: "reservoir",
    received: quantity,
    remaining: quantity,
    transferred: 0,
    lost: 0,
    cost: amount,
    expectedGross: quantity * unitPrice(s, "reservoir"),
    collected: 0,
    owed: amount,
    paid: 0,
    losses: 0,
    crewPaid: 0,
    dueDay,
    acquiredDay: s.day,
    arrangement: "consignment",
    status: "held",
    agreementId: id,
  });
  receivePhysical(s, debtor, gain("nightgoods", quantity, source.id, lotId));
  const e = record(
    s,
    "money",
    `Quanny: “I can make some happen but I need a front.” You transferred ${quantity} Pink Magic. Quanny owes you $${amount}, collectible day ${dueDay}. No money paid up front. ${quannyCollectionInstruction(s, dueDay)}`,
    ["quanny", s.playerId],
    undefined,
    { title: "Merchandise fronted", importance: "major", commitmentId },
  );
  s.street.agreements.push({
    id,
    lotId,
    supplier: s.playerId,
    debtor,
    original: amount,
    reserve: amount,
    repaid: 0,
    balance: amount,
    createdDay: s.day,
    quantity,
    dueDay,
    status: "pending",
    commitmentId,
    history: [e.id],
    collections: [],
  });
  const zero = { trust: 0, respect: 0, grievance: 0 };
  s.commitments.push({
    id: commitmentId,
    origin: lotId,
    requester: s.playerId,
    actor: debtor,
    beneficiary: s.playerId,
    createdDay: s.day,
    dueDay,
    kind: "supplier-debt",
    status: "pending",
    evidence: [e.id],
    warned: false,
    consequences: { fulfilled: zero, broken: zero, released: zero },
  });
}
export function collectConsignment(s: GameState, debtor: string) {
  const a = receivable(s, debtor);
  if (!a || s.day < a.dueDay || s.characters[debtor]?.status !== "active")
    return null;
  if (a.setConsignment) {
    const result = collectSetConsignment(s, a.id);
    if (typeof result === "string") return null;
    Object.assign(s, result);
    return {
      paid: true,
      eventId: s.street.agreements.find((x) => x.id === a.id)!.history.at(-1)!,
    };
  }
  const p = player(s),
    paid = p.notoriety >= 35;
  const e = record(
    s,
    "money",
    paid
      ? `Quanny paid the agreed $${a.balance}. “We square. Bring something real next time.”`
      : `Quanny: “What merchandise? You ain't give me nothing.” He refuses payment. You leave with no goods and no payout.`,
    [debtor, p.id],
    undefined,
    {
      title: paid ? "Consignment paid" : "Collection refused",
      importance: "major",
      commitmentId: a.commitmentId,
    },
  );
  const lot = s.street.lots.find((l) => l.id === a.lotId)!,
    c = s.commitments.find((c) => c.id === a.commitmentId)!;
  a.collections!.push({
    day: s.day,
    notoriety: p.notoriety,
    result: paid ? "paid" : "refused",
    eventId: e.id,
  });
  a.history.push(e.id);
  c.evidence.push(e.id);
  if (paid) {
    // His operating cash was reserved at agreement creation, never paid to the player up front.
    const n = s.characters[debtor],
      amount = a.balance;
    a.reserve = 0;
    earn(s, p, amount, "illicit", `Consignment collection · ${a.id}`);
    a.repaid += amount;
    a.balance = 0;
    a.status = "fulfilled";
    lot.paid = a.repaid;
    lot.owed = 0;
    if (!lot.remaining) lot.status = "settled";
    c.status = "fulfilled";
    change(n, p.id, { trust: 4, respect: 3 });
    const progress = skillsOf(n);
    progress.milestones.supplierPaid = 1;
    if ((p.relationships[n.id]?.trust ?? 0) >= 30)
      progress.milestones.supplierCredible = 1;
  } else {
    s.characters[debtor].wallet.illicit += a.reserve ?? 0;
    a.reserve = 0;
    a.status = "disputed";
    c.status = "broken";
    change(s.characters[debtor], p.id, {
      trust: -25,
      respect: -30,
      grievance: 15,
    });
  }
  return { paid, eventId: e.id };
}

export function validateConsignments(s: GameState) {
  for (const a of s.street.agreements.filter(
    (a) => a.createdDay !== undefined,
  )) {
    const lot = s.street.lots.find((l) => l.id === a.lotId);
    const source = s.street.lots.find((l) => l.id === lot?.sourceLotId);
    const collections = a.collections ?? [];
    const result = collections[0];
    const returnedInFull =
      a.status === "fulfilled" &&
      a.original === 0 &&
      a.repaid === 0 &&
      lot?.returned === a.quantity;
    if (
      !lot ||
      !source ||
      source.id === lot.id ||
      source.owner !== a.supplier ||
      a.supplier === a.debtor ||
      a.supplier !== s.playerId ||
      !a.quantity ||
      collections.length > 1 ||
      (a.status === "pending" && collections.length !== 0) ||
      (a.status !== "pending" && !result && !returnedInFull) ||
      (result &&
        (result.day < a.dueDay ||
          !a.history.includes(result.eventId) ||
          (result.result === "paid") !== result.notoriety >= 35 ||
          (!returnedInFull &&
            ((result.result === "paid") !== (a.status === "fulfilled") ||
              (result.result === "refused") !== (a.status === "disputed")))))
    )
      throw new Error(
        "Save contains invalid consignment transfer or collection history.",
      );
  }
  for (const lot of s.street.lots.filter((l) => l.sourceLotId))
    if (
      !s.street.agreements.some(
        (a) =>
          a.lotId === lot.id &&
          (a.createdDay !== undefined || a.setConsignment),
      )
    )
      throw new Error(
        "Save contains a transfer without a consignment agreement.",
      );
}
