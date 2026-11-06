import { gain, gainError, receivePhysical } from "./Inventory";
import { z } from "zod";
import type { Character } from "../core/GameState";
import { skillRank } from "./Skills";
export const EQUIPMENT = {
  "law-19": {
    name: "Law-19",
    type: "Semi-automatic handgun",
    attack: 2,
    defense: 1,
    rank: 2,
  },
  "law-19-switch": {
    name: "Law-19 Switch",
    type: "Fully automatic handgun",
    attack: 5,
    defense: 5,
    rank: 3,
  },
  arp: {
    name: "ARP",
    type: "Semi-automatic AR",
    attack: 5,
    defense: 6,
    rank: 4,
  },
} as const;
export type EquipmentId = keyof typeof EQUIPMENT;
const item = z.enum(["law-19", "law-19-switch", "arp"]);
export const equipmentSchema = z
  .object({
    owned: z.array(item).refine((v) => new Set(v).size === v.length),
    equipped: item.nullable(),
  })
  .refine((v) => v.equipped === null || v.owned.includes(v.equipped));
export type Equipment = z.infer<typeof equipmentSchema>;
export const equipmentOf = (c: Character) =>
  (c.equipment ??= { owned: [], equipped: null });
export function equipError(c: Character, id: EquipmentId | null) {
  if (id === null) return null;
  if (
    !EQUIPMENT[id] ||
    !(c.inventory
      ? c.inventory.slots.some((x) => x.kind === "equipment" && x.itemId === id)
      : equipmentOf(c).owned.includes(id))
  )
    return "Item is not owned.";
  if (skillRank(c, "combat") < EQUIPMENT[id].rank)
    return `Requires Combat rank ${EQUIPMENT[id].rank}.`;
  return null;
}
export function equip(c: Character, id: EquipmentId | null) {
  const error = equipError(c, id);
  if (!error) equipmentOf(c).equipped = id;
  return error;
}
export function equipmentBonus(c: Character) {
  const id = equipmentOf(c).equipped;
  return id && !equipError(c, id) ? EQUIPMENT[id] : { attack: 0, defense: 0 };
}

/** Retryable story-reward preflight; a rejected grant does not consume its source event. */
export function grantEquipmentError(
  s: import("../core/GameState").GameState,
  actor: string,
  id: EquipmentId,
  sourceEventId: string,
) {
  if (
    !s.characters[actor] ||
    !EQUIPMENT[id] ||
    !s.events.some((e) => e.id === sourceEventId && e.actors.includes(actor))
  )
    return "A real authored equipment reward is required.";
  if (
    s.inventory?.operations.includes(
      `equipment:${actor}:${id}:${sourceEventId}`,
    )
  )
    return "Equipment reward already claimed.";
  if (equipmentOf(s.characters[actor]).owned.includes(id))
    return "Equipment already carried.";
  return gainError(s, actor, gain(id, 1, sourceEventId));
}
/** Integration hook for an authored story/contact outcome; never a store purchase. */
export function grantEquipment(
  s: import("../core/GameState").GameState,
  actor: string,
  id: EquipmentId,
  sourceEventId: string,
) {
  if (grantEquipmentError(s, actor, id, sourceEventId)) return false;
  receivePhysical(s, actor, gain(id, 1, sourceEventId));
  (s.inventory ??= {
    overflow: {},
    history: [],
    operations: [],
  }).operations.push(`equipment:${actor}:${id}:${sourceEventId}`);
  return true;
}
