import { inventorySchema } from "./InventoryTypes";
import { z } from "zod";
import { type GameState, player, cash } from "../core/GameState";
import { LOCATIONS } from "../board/locations";
import { presenceOf } from "../board/presence";
import { INVENTORY_BALANCE as B } from "../content/inventory";
import { expense } from "./Economy";
import { record } from "../core/EventLog";
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
} from "./Inventory";
export const residenceSchema = z.object({
  id: z.string(),
  owner: z.string(),
  location: z.string(),
  price: z.number().int().positive(),
  paid: z.object({
    clean: z.number().nonnegative(),
    illicit: z.number().nonnegative(),
  }),
  eventId: z.string(),
  safe: inventorySchema,
});
export type Residence = z.infer<typeof residenceSchema>;
/** Existing rest locations only; no new geometry or interference with the Chains property. */
export const RESIDENCES = LOCATIONS.filter((l) => l.links.rest).map((l) => ({
  id: l.id,
  location: l.id,
  name: l.name,
  zone: l.zone,
  price: B.residencePrice,
}));
export function buyPropertyError(s: GameState, propertyId: string) {
  const d = RESIDENCES.find((d) => d.id === propertyId);
  return (
    physicalActionError(s) ??
    (!d
      ? "This place is not a residence for sale."
      : s.residences?.[propertyId]
        ? "Residence already owned."
        : presenceOf(s).location !== d.location
          ? "Stand at this residence in the City first."
          : cash(player(s)) < d.price
            ? `Requires $${d.price}.`
            : null)
  );
}
export function buyProperty(
  s: GameState,
  propertyId: string,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = buyPropertyError(s, propertyId);
  if (error) return error;
  const n = structuredClone(s),
    d = RESIDENCES.find((d) => d.id === propertyId)!,
    paid = expense(n, player(n), d.price, `Residence purchase · ${d.name}`)!;
  const e = record(
    n,
    "money",
    `Bought ${d.name} for $${d.price}. Its safe holds 24 slots and 40 load.`,
    [n.playerId],
  );
  (n.residences ??= {})[propertyId] = {
    id: propertyId,
    location: d.location,
    owner: n.playerId,
    price: d.price,
    paid,
    eventId: e.id,
    safe: { slots: [] },
  };
  if (operationId)
    (n.inventory ??= newInventoryState()).operations.push(operationId);
  return n;
}
export function safeAccessError(s: GameState, propertyId: string) {
  const r = s.residences?.[propertyId];
  return (
    physicalActionError(s) ??
    (!r || r.owner !== s.playerId
      ? "You do not own this residence."
      : presenceOf(s).location !== r.location
        ? "Stand at this owned residence to use its safe."
        : null)
  );
}
export function depositError(
  s: GameState,
  propertyId: string,
  slotId: string,
  quantity: number,
) {
  const inv = inventoryOf(s),
    x = inv.slots.find((x) => x.id === slotId);
  return (
    safeAccessError(s, propertyId) ??
    quantityError(inv, slotId, quantity) ??
    canFit(safeOf(s, propertyId)!, { ...x!, quantity }, "safe")
  );
}
export function withdrawError(
  s: GameState,
  propertyId: string,
  slotId: string,
  quantity: number,
) {
  const inv = safeOf(s, propertyId),
    x = inv?.slots.find((x) => x.id === slotId);
  return (
    safeAccessError(s, propertyId) ??
    quantityError(inv!, slotId, quantity) ??
    canFit(inventoryOf(s), { ...x!, quantity })
  );
}
function safeMove(
  s: GameState,
  propertyId: string,
  slotId: string,
  quantity: number,
  inward: boolean,
  operationId?: string,
): GameState | string {
  if (alreadyApplied(s, operationId)) return s;
  const error = inward
    ? depositError(s, propertyId, slotId, quantity)
    : withdrawError(s, propertyId, slotId, quantity);
  if (error) return error;
  const n = structuredClone(s),
    from = inward ? inventoryOf(n) : safeOf(n, propertyId)!,
    to = inward ? safeOf(n, propertyId)! : inventoryOf(n),
    x = { ...from.slots.find((x) => x.id === slotId)!, quantity };
  removePhysical(from, slotId, quantity);
  if (
    inward &&
    x.kind === "equipment" &&
    player(n).equipment?.equipped === x.itemId
  )
    player(n).equipment!.equipped = null;
  if (
    inward &&
    x.kind === "equipment" &&
    player(n).equipment?.equipped === x.itemId
  )
    player(n).equipment!.equipped = null;
  addPhysical(n, to, x);
  syncCarried(player(n));
  logInventory(
    n,
    inward ? "deposited" : "withdrawn",
    inward ? n.playerId : propertyId,
    inward ? propertyId : n.playerId,
    x,
    operationId,
  );
  return n;
}
export const deposit = (
  s: GameState,
  propertyId: string,
  slotId: string,
  quantity: number,
  operationId?: string,
) => safeMove(s, propertyId, slotId, quantity, true, operationId);
export const withdraw = (
  s: GameState,
  propertyId: string,
  slotId: string,
  quantity: number,
  operationId?: string,
) => safeMove(s, propertyId, slotId, quantity, false, operationId);
/** Ownership can change only after the owner physically empties the safe. No silent disposal. */
export function releasePropertyError(s: GameState, propertyId: string) {
  return (
    safeAccessError(s, propertyId) ??
    (safeOf(s, propertyId)!.slots.length
      ? "Empty this safe before releasing the residence."
      : null)
  );
}
export function releaseProperty(
  s: GameState,
  propertyId: string,
): GameState | string {
  const error = releasePropertyError(s, propertyId);
  if (error) return error;
  const n = structuredClone(s);
  delete n.residences![propertyId];
  record(n, "city", `Released residence ${propertyId}; no refund.`, [
    n.playerId,
  ]);
  return n;
}
