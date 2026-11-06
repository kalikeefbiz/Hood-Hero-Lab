import type { GameState } from "../core/GameState";
import {
  ITEM_DEFINITIONS as D,
  type PhysicalItemId,
} from "../content/inventory";
import {
  inventoryOf,
  capacityOf,
  gain,
  canFit,
  addPhysical,
  newInventoryState,
  syncCarried,
  type ItemGain,
  type ItemStack,
} from "../systems/Inventory";
import { RESIDENCES } from "../systems/Residences";
/** Explicit v8-v10 -> v11 migration. Only migration may create legacy overflow. */
export function migrateInventory(s: GameState) {
  s.inventory = newInventoryState();
  s.residences = {};
  for (const c of Object.values(s.characters)) {
    const equipped = c.equipment?.equipped ?? null;
    const equipment = [...(c.equipment?.owned ?? [])].sort(
      (a, b) => Number(b === equipped) - Number(a === equipped),
    );
    const possessions = [...c.possessions];
    c.inventory = { slots: [] };
    const items: ItemGain[] = [
      ...equipment.map((id) => gain(id, 1, "legacy-equipment")),
      ...possessions.map((id) => {
        if (!(id in D))
          throw new Error(
            `Unknown legacy item: ${id}. Original save has not been changed.`,
          );
        return gain(id as PhysicalItemId, 1, "legacy-possession");
      }),
      ...s.street.lots
        .filter((l) => l.owner === c.id && l.remaining > 0)
        .map((l) =>
          gain(
            l.category as PhysicalItemId,
            l.remaining,
            l.sourceLotId ?? l.id,
            l.id,
          ),
        ),
      ...(c.id === s.playerId
        ? Object.entries(s.robberies?.items ?? {})
            .filter(([, q]) => q > 0)
            .map(([id, q]) =>
              gain(id as PhysicalItemId, q, "legacy-preparation"),
            )
        : []),
    ];
    for (const item of items) {
      // Unit-wise placement deliberately keeps the largest fitting portion of a stack.
      let overflow = 0;
      for (let i = 0; i < item.quantity; i++) {
        const one = { ...item, quantity: 1 };
        if (canFit(c.inventory, one, c.id === s.playerId ? "player" : "member"))
          overflow++;
        else addPhysical(s, c.inventory, one);
      }
      if (overflow) {
        const inv = { slots: (s.inventory.overflow[c.id] ??= []) };
        addPhysical(s, inv, { ...item, quantity: overflow });
      }
    }
    syncCarried(c);
  }
  s.version = 11;
}
export function validateInventory(s: GameState) {
  if (
    !s.inventory ||
    !s.residences ||
    Object.values(s.characters).some((c) => !c.inventory)
  )
    throw new Error("Missing v11 physical inventory.");
  const all: { owner: string; stack: ItemStack }[] = [];
  function check(
    owner: string,
    slots: ItemStack[],
    type: "player" | "member" | "safe" | "overflow",
  ) {
    if (!s.characters[owner])
      throw new Error("Inventory has an unknown owner.");
    if (type !== "overflow") {
      const c = capacityOf({ slots }, type);
      if (c.remainingLoad < 0 || c.remainingSlots < 0)
        throw new Error("Inventory capacity exceeded.");
    }
    for (const x of slots) {
      if (x.kind !== D[x.itemId].kind || x.quantity > D[x.itemId].stack)
        throw new Error("Invalid physical stack or stack limit.");
      all.push({ owner, stack: x });
    }
  }
  for (const c of Object.values(s.characters)) {
    check(c.id, c.inventory!.slots, c.id === s.playerId ? "player" : "member");
    const copy = structuredClone(c);
    syncCarried(copy);
    if (
      JSON.stringify(copy.possessions) !== JSON.stringify(c.possessions) ||
      JSON.stringify(copy.equipment) !== JSON.stringify(c.equipment)
    )
      throw new Error("Inventory and carried equipment/possessions disagree.");
  }
  for (const r of Object.values(s.residences)) {
    if (
      r.owner !== s.playerId ||
      !RESIDENCES.some(
        (d) =>
          d.id === r.id && d.location === r.location && d.price === r.price,
      ) ||
      r.paid.clean + r.paid.illicit !== r.price ||
      !s.events.some((e) => e.id === r.eventId)
    )
      throw new Error("Invalid residence ownership or purchase.");
    check(r.owner, r.safe.slots, "safe");
  }
  for (const [actor, slots] of Object.entries(s.inventory.overflow))
    check(actor, slots, "overflow");
  if (new Set(all.map((x) => x.stack.id)).size !== all.length)
    throw new Error("Duplicate physical slot ID.");
  for (const l of s.street.lots) {
    const stacks = all.filter(
      (x) => x.stack.kind === "merchandise" && x.stack.lotId === l.id,
    );
    if (
      stacks.some((x) => x.owner !== l.owner) ||
      stacks.reduce((n, x) => n + x.stack.quantity, 0) !== l.remaining
    )
      throw new Error(
        "Physical stock does not reconcile with its street economy lot.",
      );
  }
  if (
    all.some(
      ({ stack: x }) =>
        x.kind === "merchandise" &&
        !s.street.lots.some((l) => l.id === x.lotId && l.category === x.itemId),
    )
  )
    throw new Error("Unknown merchandise lot.");
  if (
    new Set(s.inventory.operations).size !== s.inventory.operations.length ||
    new Set(s.inventory.history.map((h) => h.id)).size !==
      s.inventory.history.length ||
    s.inventory.history.some(
      (h) => h.day > s.day || !s.events.some((e) => e.id === h.eventId),
    )
  )
    throw new Error("Invalid inventory exchange history.");
}
