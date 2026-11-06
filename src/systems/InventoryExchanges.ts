import { type GameState, player, cash } from "../core/GameState";
import { boardPeople } from "../board/people";
import { presenceOf } from "../board/presence";
import { ITEM_DEFINITIONS as D } from "../content/inventory";
import { MERCHANDISE, STREET_BALANCE } from "../content/street";
import { record } from "../core/EventLog";
import { earn, expense } from "./Economy";
import { equipError, equip, type EquipmentId } from "./Equipment";
import { skillRank } from "./Skills";
import { safeAccessError } from "./Residences";
import {
  inventoryOf,
  safeOf,
  canFit,
  quantityError,
  physicalActionError,
  addPhysical,
  removePhysical,
  syncCarried,
  logInventory,
  alreadyApplied,
  newInventoryState,
  adjustPrepOwnership,
  type ItemStack,
} from "./Inventory";
const consignmentUnit =
  MERCHANDISE.nightgoods.wholesale / MERCHANDISE.nightgoods.quantity;
export function memberExchangeError(s: GameState, member: string) {
  const where = boardPeople(s).find((n) => n.id === member)?.placeId;
  return (
    physicalActionError(s, member) ??
    (!s.crew.members.includes(member)
      ? "Not in your Set."
      : s.characters[member]?.status !== "active"
        ? "This Set member is unavailable."
        : !where || where !== presenceOf(s).location
          ? `Find ${s.characters[member].name} in the City at ${where ?? "their next available location"}.`
          : null)
  );
}
export function giveItemError(
  s: GameState,
  member: string,
  slotId: string,
  quantity: number,
) {
  const inv = inventoryOf(s),
    x = inv.slots.find((x) => x.id === slotId);
  return (
    memberExchangeError(s, member) ??
    quantityError(inv, slotId, quantity) ??
    canFit(inventoryOf(s, member), { ...x!, quantity }, "member")
  );
}
export function takeItemError(
  s: GameState,
  member: string,
  slotId: string,
  quantity: number,
) {
  const inv = inventoryOf(s, member),
    x = inv.slots.find((x) => x.id === slotId);
  return (
    memberExchangeError(s, member) ??
    quantityError(inv, slotId, quantity) ??
    (x?.kind === "merchandise" &&
    !s.street.lots.some(
      (l) => l.id === x.lotId && l.supplier === s.playerId && l.sourceLotId,
    )
      ? "Only your own consigned stock can be taken back."
      : null) ??
    canFit(inventoryOf(s), {
      ...x!,
      quantity,
      ...(x?.kind === "merchandise"
        ? { lotId: s.street.lots.find((l) => l.id === x.lotId)?.sourceLotId }
        : {}),
    })
  );
}
function transfer(
  s: GameState,
  member: string,
  slotId: string,
  quantity: number,
  giving: boolean,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = giving
    ? giveItemError(s, member, slotId, quantity)
    : takeItemError(s, member, slotId, quantity);
  if (error) return error;
  const n = structuredClone(s),
    from = giving ? n.playerId : member,
    to = giving ? member : n.playerId,
    inv = inventoryOf(n, from),
    x: ItemStack = { ...inv.slots.find((x) => x.id === slotId)!, quantity };
  removePhysical(inv, slotId, quantity);
  if (
    x.kind === "equipment" &&
    n.characters[from].equipment?.equipped === x.itemId
  )
    n.characters[from].equipment!.equipped = null;
  adjustPrepOwnership(n, x.itemId, giving ? -quantity : quantity);
  let agreementToLog: string | undefined;
  if (x.kind === "merchandise") {
    const source = n.street.lots.find((l) => l.id === x.lotId)!;
    if (giving) {
      const lotId = `lot-${n.nextId++}`,
        agreementId = `agreement-${n.nextId++}`,
        commitmentId = `commitment-${n.nextId++}`,
        amount = quantity * consignmentUnit,
        dueDay = n.day + STREET_BALANCE.deadline;
      source.remaining -= quantity;
      source.transferred = (source.transferred ?? 0) + quantity;
      if (!source.remaining) source.status = "distributed";
      n.street.lots.push({
        ...source,
        id: lotId,
        sourceLotId: source.id,
        owner: member,
        supplier: n.playerId,
        received: quantity,
        remaining: quantity,
        transferred: 0,
        lost: 0,
        cost: amount,
        owed: amount,
        paid: 0,
        collected: 0,
        losses: 0,
        crewPaid: 0,
        acquiredDay: n.day,
        dueDay,
        arrangement: "consignment",
        status: "held",
        agreementId,
      });
      n.street.agreements.push({
        id: agreementId,
        lotId,
        supplier: n.playerId,
        debtor: member,
        original: amount,
        repaid: 0,
        balance: amount,
        dueDay,
        status: "pending",
        history: [],
        commitmentId,
        setConsignment: true,
        quantity,
        returned: 0,
      });
      const zero = { trust: 0, respect: 0, grievance: 0 };
      n.commitments.push({
        id: commitmentId,
        origin: lotId,
        requester: n.playerId,
        actor: member,
        beneficiary: n.playerId,
        createdDay: n.day,
        dueDay,
        kind: "supplier-debt",
        status: "pending",
        evidence: [],
        warned: false,
        consequences: { fulfilled: zero, broken: zero, released: zero },
      });
      x.lotId = lotId;
      agreementToLog = agreementId;
    } else {
      // Returned stock goes back to its original lot. Sold units and their liability remain.
      const a = n.street.agreements.find((a) => a.lotId === source.id)!,
        parent = n.street.lots.find((l) => l.id === source.sourceLotId)!;
      const agreedUnit =
        source.cost / (source.received - (source.returned ?? 0));
      const reduction = Math.min(a.balance, Math.round(quantity * agreedUnit));
      // A pre-Set Quanny agreement may still reserve his operating cash.
      if (a.reserve) {
        a.reserve -= reduction;
        n.characters[member].wallet.illicit += reduction;
      }
      source.remaining -= quantity;
      source.returned = (source.returned ?? 0) + quantity;
      agreementToLog = a.id;
      a.returned = (a.returned ?? 0) + quantity;
      a.original -= reduction;
      a.balance -= reduction;
      source.cost -= reduction;
      source.owed -= reduction;
      if (!source.remaining)
        source.status = source.owed ? "distributed" : "settled";
      parent.remaining += quantity;
      parent.status = "held";
      parent.transferred! -= quantity;
      if (!a.balance) {
        a.status = "fulfilled";
        n.commitments.find((c) => c.id === a.commitmentId)!.status =
          "fulfilled";
      }
      x.lotId = parent.id;
    }
  }
  addPhysical(n, inventoryOf(n, to), x);
  syncCarried(n.characters[from]);
  syncCarried(n.characters[to]);
  logInventory(
    n,
    giving
      ? x.kind === "merchandise"
        ? "consigned"
        : `given to ${n.characters[member].name}`
      : "taken back",
    from,
    to,
    x,
    operationId,
  );
  if (x.kind === "merchandise") {
    const a = n.street.agreements.find((a) => a.id === agreementToLog);
    if (a) {
      a.history.push(n.inventory!.history.at(-1)!.eventId);
      n.commitments
        .find((c) => c.id === a.commitmentId)!
        .evidence.push(n.inventory!.history.at(-1)!.eventId);
    }
  }
  return n;
}
export const giveItem = (
  s: GameState,
  member: string,
  slotId: string,
  quantity: number,
  operationId?: string,
) => transfer(s, member, slotId, quantity, true, operationId);
export const takeItem = (
  s: GameState,
  member: string,
  slotId: string,
  quantity: number,
  operationId?: string,
) => transfer(s, member, slotId, quantity, false, operationId);
export function collectSetConsignmentError(s: GameState, agreementId: string) {
  const a = s.street.agreements.find((a) => a.id === agreementId);
  return !a?.setConsignment || !a.balance
    ? "No outstanding Set balance."
    : (memberExchangeError(s, a.debtor) ??
        (s.day < a.dueDay ? `Collect on day ${a.dueDay}.` : null) ??
        (cash(s.characters[a.debtor]) < a.balance
          ? "Member needs the outstanding cash before collection."
          : null));
}
export function collectSetConsignment(
  s: GameState,
  agreementId: string,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = collectSetConsignmentError(s, agreementId);
  if (error) return error;
  const n = structuredClone(s),
    a = n.street.agreements.find((a) => a.id === agreementId)!,
    l = n.street.lots.find((l) => l.id === a.lotId)!,
    amount = a.balance;
  expense(n, n.characters[a.debtor], amount, "Set consignment collection");
  earn(n, player(n), amount, "illicit", "Set consignment collected");
  a.repaid += amount;
  a.balance = l.owed = 0;
  l.paid += amount;
  a.status = "fulfilled";
  const e = record(
    n,
    "money",
    `Collected $${amount} from ${n.characters[a.debtor].name}.`,
    [n.playerId, a.debtor],
  );
  a.history.push(e.id);
  n.streetLife?.exchanges.push({
    id: e.id,
    quantity: 0,
    paid: 0,
    received: amount,
    provenance: "illicit",
  });
  n.commitments.find((c) => c.id === a.commitmentId)!.status = "fulfilled";
  if (operationId)
    (n.inventory ??= newInventoryState()).operations.push(operationId);
  return n;
}
export function discardItemError(
  s: GameState,
  slotId: string,
  quantity: number,
  location: string,
) {
  return (
    physicalActionError(s) ??
    (location !== presenceOf(s).location
      ? "Discard from your physical City presence only."
      : null) ??
    quantityError(inventoryOf(s), slotId, quantity)
  );
}
export function loseCarriedError(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
) {
  return !s.characters[actor]
    ? "Unknown character."
    : quantityError(inventoryOf(s, actor), slotId, quantity);
}
/** Also used by future theft/custody rules: touches only carried slots, never safe or overflow. */
export function loseCarried(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
  reason: string,
) {
  const error = loseCarriedError(s, actor, slotId, quantity);
  if (error) return error;
  const inv = inventoryOf(s, actor),
    x = { ...inv.slots.find((x) => x.id === slotId)!, quantity };
  removePhysical(inv, slotId, quantity);
  if (
    x.kind === "equipment" &&
    s.characters[actor].equipment?.equipped === x.itemId
  )
    s.characters[actor].equipment!.equipped = null;
  syncCarried(s.characters[actor]);
  if (actor === s.playerId) adjustPrepOwnership(s, x.itemId, -quantity);
  logInventory(s, reason, actor, "lost", x);
  if (x.kind === "merchandise") {
    const l = s.street.lots.find((l) => l.id === x.lotId)!;
    l.remaining -= quantity;
    l.lost += quantity;
    s.street.transactions.push({
      id: `transaction-${s.nextId++}`,
      day: s.day,
      lotId: l.id,
      market: l.zone,
      actor,
      sold: 0,
      lost: quantity,
      gross: 0,
      loss: 0,
      crewPaid: 0,
      crewLoss: 0,
      outcome: "goods-loss",
      eventId: s.inventory!.history.at(-1)!.eventId,
    });
  }
}
export function discardItem(
  s: GameState,
  slotId: string,
  quantity: number,
  location: string,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = discardItemError(s, slotId, quantity, location);
  if (error) return error;
  const n = structuredClone(s);
  loseCarried(n, n.playerId, slotId, quantity, "discarded");
  if (operationId) n.inventory!.operations.push(operationId);
  return n;
}
export function claimOverflowError(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
  propertyId?: string,
) {
  const inv = { slots: s.inventory?.overflow[actor] ?? [] },
    x = inv.slots.find((x) => x.id === slotId);
  return (
    physicalActionError(s) ??
    (actor !== s.playerId ? memberExchangeError(s, actor) : null) ??
    (propertyId
      ? actor !== s.playerId
        ? "Set members cannot open your safe."
        : safeAccessError(s, propertyId)
      : null) ??
    quantityError(inv, slotId, quantity) ??
    canFit(
      propertyId ? safeOf(s, propertyId)! : inventoryOf(s, actor),
      { ...x!, quantity },
      propertyId ? "safe" : actor === s.playerId ? "player" : "member",
    )
  );
}
export function claimOverflow(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
  propertyId?: string,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = claimOverflowError(s, actor, slotId, quantity, propertyId);
  if (error) return error;
  const n = structuredClone(s),
    inv = { slots: n.inventory!.overflow[actor] },
    x = { ...inv.slots.find((x) => x.id === slotId)!, quantity };
  removePhysical(inv, slotId, quantity);
  addPhysical(
    n,
    propertyId ? safeOf(n, propertyId)! : inventoryOf(n, actor),
    x,
  );
  syncCarried(n.characters[actor]);
  logInventory(
    n,
    "legacy items retrieved",
    `overflow:${actor}`,
    propertyId ?? actor,
    x,
    operationId,
  );
  return n;
}
export function equipItemError(
  s: GameState,
  actor: string,
  itemId: EquipmentId | null,
) {
  return (
    physicalActionError(s) ??
    (actor !== s.playerId ? memberExchangeError(s, actor) : null) ??
    equipError(s.characters[actor], itemId)
  );
}
export function equipItem(
  s: GameState,
  actor: string,
  itemId: EquipmentId | null,
): GameState | string {
  const error = equipItemError(s, actor, itemId);
  if (error) return error;
  const n = structuredClone(s);
  equip(n.characters[actor], itemId);
  return n;
}
export interface HeistRequirement {
  items?: Partial<Record<keyof typeof D, number>>;
  combatRank?: number;
  equipped?: EquipmentId;
}
export function heistReadiness(
  s: GameState,
  member: string,
  requirement: HeistRequirement,
): string | null {
  if (!s.crew.members.includes(member)) return "Not in your Set.";
  const c = s.characters[member];
  if (c.status !== "active") return "Member unavailable.";
  if (skillRank(c, "combat") < (requirement.combatRank ?? 1))
    return `Requires Combat rank ${requirement.combatRank}.`;
  if (
    requirement.equipped &&
    (c.equipment?.equipped !== requirement.equipped ||
      equipError(c, requirement.equipped))
  )
    return `Requires equipped ${D[requirement.equipped].name}.`;
  for (const [id, quantity] of Object.entries(requirement.items ?? {}))
    if (
      inventoryOf(s, member)
        .slots.filter((x) => x.itemId === id)
        .reduce((n, x) => n + x.quantity, 0) < quantity!
    )
      return `Member must carry ${quantity} ${D[id as keyof typeof D].name}.`;
  return null;
}
export const inviteHeistError = (
  s: GameState,
  member: string,
  requirement: HeistRequirement,
) => memberExchangeError(s, member) ?? heistReadiness(s, member, requirement);
export function inviteHeist(
  s: GameState,
  member: string,
  requirement: HeistRequirement,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = inviteHeistError(s, member, requirement);
  if (error) return error;
  const n = structuredClone(s);
  record(
    n,
    "crew",
    `${n.characters[member].name} accepted your in-person heist invitation with their own equipment. Readiness must be checked again at start.`,
    [n.playerId, member],
  );
  if (operationId)
    (n.inventory ??= newInventoryState()).operations.push(operationId);
  return n;
}
