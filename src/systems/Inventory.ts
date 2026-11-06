import { hospitalStay, streetConversation } from "./Danger";
import { currentEncounter } from "./EncounterLifecycle";
import { type GameState, type Character, player } from "../core/GameState";
import {
  ITEM_DEFINITIONS as D,
  INVENTORY_BALANCE as B,
  type PhysicalItemId,
} from "../content/inventory";
import { record } from "../core/EventLog";

export {
  inventorySchema,
  inventoryStateSchema,
  stackSchema,
} from "./InventoryTypes";
export type {
  Inventory,
  InventoryState,
  ItemGain,
  ItemStack,
} from "./InventoryTypes";
import type {
  Inventory,
  InventoryState,
  ItemGain,
  ItemStack,
} from "./InventoryTypes";
export const newInventoryState = (): InventoryState => ({
  overflow: {},
  history: [],
  operations: [],
});
export const inventoryOf = (s: GameState, actor = s.playerId): Inventory =>
  s.characters[actor]?.inventory ?? { slots: [] };
export const safeOf = (
  s: GameState,
  propertyId: string,
): Inventory | undefined => s.residences?.[propertyId]?.safe;
export const usedLoad = (inv: Inventory) =>
  inv.slots.reduce((n, x) => n + x.quantity * D[x.itemId].load, 0);
export function capacityOf(
  inv: Inventory,
  type: keyof Pick<typeof B, "player" | "member" | "safe"> = "player",
) {
  const limits = B[type];
  return {
    ...limits,
    usedSlots: inv.slots.length,
    usedLoad: usedLoad(inv),
    remainingSlots: limits.maxSlots - inv.slots.length,
    remainingLoad: limits.maxLoad - usedLoad(inv),
  };
}
export const remainingLoad = (
  inv: Inventory,
  type: "player" | "member" | "safe" = "player",
) => capacityOf(inv, type).remainingLoad;
export const characterCapacity = (s: GameState, actor = s.playerId) =>
  capacityOf(inventoryOf(s, actor), actor === s.playerId ? "player" : "member");
export function gain(
  itemId: PhysicalItemId,
  quantity = 1,
  provenance = "purchase",
  lotId?: string,
): ItemGain {
  return {
    kind: D[itemId].kind,
    itemId,
    quantity,
    provenance,
    ...(lotId ? { lotId } : {}),
  };
}
export const matching = (a: ItemGain, b: ItemGain) =>
  a.kind === b.kind &&
  a.itemId === b.itemId &&
  a.provenance === b.provenance &&
  a.lotId === b.lotId;
export function canFit(
  inv: Inventory,
  item: ItemGain,
  type: "player" | "member" | "safe" = "player",
): string | null {
  const def = D[item.itemId];
  if (
    !def ||
    def.kind !== item.kind ||
    (item.kind === "merchandise" && !item.lotId)
  )
    return "Unknown item or missing lot identity.";
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
    return "Choose a positive whole quantity.";
  const c = capacityOf(inv, type),
    needLoad = item.quantity * def.load - c.remainingLoad;
  if (needLoad > 0) return `Need ${needLoad} more load capacity.`;
  const room = inv.slots
    .filter((x) => matching(x, item))
    .reduce((n, x) => n + def.stack - x.quantity, 0);
  if (
    Math.ceil(Math.max(0, item.quantity - room) / def.stack) > c.remainingSlots
  )
    return "No free slots.";
  return null;
}
export const gainError = (s: GameState, actor: string, item: ItemGain) =>
  !s.characters[actor]
    ? "Unknown character."
    : canFit(
        inventoryOf(s, actor),
        item,
        actor === s.playerId ? "player" : "member",
      );
/** Internal mutation helpers: callers validate the complete transaction before spending anything. */
export function addPhysical(s: GameState, inv: Inventory, item: ItemGain) {
  let left = item.quantity;
  for (const x of inv.slots.filter((x) => matching(x, item))) {
    const n = Math.min(left, D[item.itemId].stack - x.quantity);
    x.quantity += n;
    left -= n;
  }
  while (left > 0) {
    const quantity = Math.min(left, D[item.itemId].stack);
    inv.slots.push({
      ...item,
      id: `slot-${s.nextId++}`,
      quantity,
    } as ItemStack);
    left -= quantity;
  }
}
export function syncCarried(c: Character) {
  if (!c.inventory) return;
  c.possessions = c.inventory.slots
    .filter((x) => x.kind === "possession")
    .flatMap((x) => Array<string>(x.quantity).fill(x.itemId));
  const owned = [
    ...new Set(
      c.inventory.slots
        .filter((x) => x.kind === "equipment")
        .map((x) => x.itemId),
    ),
  ] as import("./Equipment").EquipmentId[];
  c.equipment ??= { owned: [], equipped: null };
  c.equipment.owned = owned;
  if (c.equipment.equipped && !owned.includes(c.equipment.equipped))
    c.equipment.equipped = null;
}
export function receivePhysical(
  s: GameState,
  actor: string,
  item: ItemGain,
): string | null {
  const error = gainError(s, actor, item);
  if (error) return error;
  const c = s.characters[actor];
  c.inventory ??= { slots: [] };
  addPhysical(s, c.inventory, item);
  syncCarried(c);
  return null;
}
export function removePhysical(
  inv: Inventory,
  slotId: string,
  quantity: number,
) {
  const x = inv.slots.find((x) => x.id === slotId)!;
  x.quantity -= quantity;
  if (!x.quantity) inv.slots.splice(inv.slots.indexOf(x), 1);
}
export const carriedLotQuantity = (
  s: GameState,
  actor: string,
  lotId: string,
) =>
  s.characters[actor]?.inventory
    ? inventoryOf(s, actor)
        .slots.filter((x) => x.kind === "merchandise" && x.lotId === lotId)
        .reduce((n, x) => n + x.quantity, 0)
    : (s.street.lots.find((l) => l.id === lotId && l.owner === actor)
        ?.remaining ?? 0);
export function consumeLot(
  s: GameState,
  actor: string,
  lotId: string,
  quantity: number,
) {
  const inv = inventoryOf(s, actor);
  for (const x of [...inv.slots])
    if (x.kind === "merchandise" && x.lotId === lotId && quantity > 0) {
      const n = Math.min(quantity, x.quantity);
      removePhysical(inv, x.id, n);
      quantity -= n;
    }
}
export function physicalActionError(s: GameState, conversationWith?: string) {
  if (s.end || player(s).status !== "active")
    return "Return safely to the City first.";
  if (
    (s.activeSession && s.activeSession.status !== "ended") ||
    (s.activeRobbery && s.activeRobbery.status !== "ended")
  )
    return "Finish your current session first.";
  const encounter = currentEncounter(s);
  if (
    hospitalStay(s) ||
    streetConversation(s) ||
    (encounter &&
      (!conversationWith || !encounter.participants.includes(conversationWith)))
  )
    return "Finish your current encounter first.";
  return null;
}
export function quantityError(
  inv: Inventory,
  slotId: string,
  quantity: number,
) {
  const x = inv.slots.find((x) => x.id === slotId);
  return !x
    ? "Item is no longer here."
    : !Number.isSafeInteger(quantity) || quantity < 1 || quantity > x.quantity
      ? "Choose an available whole quantity."
      : null;
}
export function logInventory(
  s: GameState,
  action: string,
  from: string,
  to: string,
  item: ItemGain,
  operationId?: string,
) {
  const e = record(
    s,
    "money",
    `${D[item.itemId].name} ×${item.quantity}: ${action} (${from} → ${to}).`,
    [
      s.playerId,
      ...[from, to].filter((x) => !!s.characters[x] && x !== s.playerId),
    ],
    undefined,
    { title: "Inventory exchange" },
  );
  (s.inventory ??= newInventoryState()).history.push({
    id: `inventory-${s.nextId++}`,
    day: s.day,
    action,
    actor: s.playerId,
    from,
    to,
    itemId: item.itemId,
    quantity: item.quantity,
    eventId: e.id,
    ...(item.lotId ? { lotId: item.lotId } : {}),
  });
  if (operationId) s.inventory.operations.push(operationId);
}
export const alreadyApplied = (s: GameState, operationId?: string) =>
  !!operationId && !!s.inventory?.operations.includes(operationId);
export function splitStackError(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
) {
  const inv = inventoryOf(s, actor),
    x = inv.slots.find((x) => x.id === slotId);
  return (
    physicalActionError(s) ??
    (actor !== s.playerId
      ? "Rearrange only your own carried inventory."
      : null) ??
    quantityError(inv, slotId, quantity) ??
    (quantity === x?.quantity
      ? "Leave at least one unit in the original stack."
      : null) ??
    (characterCapacity(s, actor).remainingSlots < 1 ? "No free slots." : null)
  );
}
export function splitStack(
  s: GameState,
  actor: string,
  slotId: string,
  quantity: number,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = splitStackError(s, actor, slotId, quantity);
  if (error) return error;
  const n = structuredClone(s),
    inv = inventoryOf(n, actor),
    x = inv.slots.find((x) => x.id === slotId)!;
  x.quantity -= quantity;
  inv.slots.push({ ...x, id: `slot-${n.nextId++}`, quantity });
  syncCarried(n.characters[actor]);
  logInventory(n, "split", actor, actor, { ...x, quantity }, operationId);
  return n;
}
export function mergeStackError(
  s: GameState,
  actor: string,
  from: string,
  to: string,
) {
  const inv = inventoryOf(s, actor),
    a = inv.slots.find((x) => x.id === from),
    b = inv.slots.find((x) => x.id === to);
  return (
    physicalActionError(s) ??
    (actor !== s.playerId
      ? "Rearrange only your own carried inventory."
      : null) ??
    (!a || !b || from === to
      ? "Choose two different stacks."
      : !matching(a, b)
        ? "Different items, lots or provenance cannot merge."
        : a.quantity + b.quantity > D[a.itemId].stack
          ? "Stack limit reached."
          : null)
  );
}
export function mergeStack(
  s: GameState,
  actor: string,
  from: string,
  to: string,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = mergeStackError(s, actor, from, to);
  if (error) return error;
  const n = structuredClone(s),
    inv = inventoryOf(n, actor),
    a = inv.slots.find((x) => x.id === from)!,
    b = inv.slots.find((x) => x.id === to)!;
  b.quantity += a.quantity;
  removePhysical(inv, from, a.quantity);
  syncCarried(n.characters[actor]);
  logInventory(n, "merge", actor, actor, a, operationId);
  return n;
}
export function moveSlotError(
  s: GameState,
  actor: string,
  slotId: string,
  index: number,
) {
  return (
    physicalActionError(s) ??
    (actor !== s.playerId
      ? "Rearrange only your own carried inventory."
      : null) ??
    quantityError(inventoryOf(s, actor), slotId, 1) ??
    (!Number.isInteger(index) ||
    index < 0 ||
    index >= inventoryOf(s, actor).slots.length
      ? "Choose an occupied slot to swap."
      : null)
  );
}
export function moveSlot(
  s: GameState,
  actor: string,
  slotId: string,
  index: number,
): GameState | string {
  const error = moveSlotError(s, actor, slotId, index);
  if (error) return error;
  const n = structuredClone(s),
    slots = inventoryOf(n, actor).slots,
    i = slots.findIndex((x) => x.id === slotId);
  [slots[i], slots[index]] = [slots[index], slots[i]];
  syncCarried(n.characters[actor]);
  return n;
}

/** Prep ledger tracks player-owned units across person, safe and overflow. */
export function adjustPrepOwnership(
  s: GameState,
  itemId: PhysicalItemId,
  delta: number,
) {
  if (!["gloves", "mask", "duffle", "pattern-token"].includes(itemId)) return;
  s.robberies ??= {
    items: { gloves: 0, mask: 0, duffle: 0, "pattern-token": 0 },
    purchases: [],
    jobs: [],
    history: [],
  };
  s.robberies.items[itemId as keyof typeof s.robberies.items] += delta;
}
