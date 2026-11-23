import type { GameState } from "../core/GameState";
import { ITEM_DEFINITIONS as D } from "../content/inventory";
import { capacityOf, syncCarried, type ItemStack } from "../systems/Inventory";
import { RESIDENCES } from "../systems/Residences";

export function validateInventory(s: GameState) {
  if (
    !s.inventory ||
    !s.residences ||
    Object.values(s.characters).some((c) => !c.inventory)
  )
    throw new Error("Missing physical inventory.");
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
