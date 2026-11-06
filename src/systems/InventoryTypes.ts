import { z } from "zod";
import {
  ITEM_DEFINITIONS as D,
  type PhysicalItemId,
} from "../content/inventory";
const common = {
  id: z.string().min(1),
  itemId: z.enum(Object.keys(D) as [PhysicalItemId, ...PhysicalItemId[]]),
  quantity: z.number().int().positive(),
  provenance: z.string().min(1),
};
export const stackSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("merchandise"),
    lotId: z.string().min(1),
  }),
  z.object({ ...common, kind: z.literal("equipment") }),
  z.object({ ...common, kind: z.literal("possession") }),
]);
export type ItemStack = z.infer<typeof stackSchema>;
export type ItemGain = Omit<ItemStack, "id"> & { lotId?: string };
export const inventorySchema = z.object({ slots: z.array(stackSchema) });
export type Inventory = z.infer<typeof inventorySchema>;
export const inventoryStateSchema = z.object({
  overflow: z.record(z.string(), z.array(stackSchema)),
  history: z.array(
    z.object({
      id: z.string(),
      day: z.number().int(),
      action: z.string(),
      actor: z.string(),
      from: z.string(),
      to: z.string(),
      itemId: z.enum(Object.keys(D) as [PhysicalItemId, ...PhysicalItemId[]]),
      quantity: z.number().int().nonnegative(),
      eventId: z.string(),
      lotId: z.string().optional(),
    }),
  ),
  operations: z.array(z.string()),
});
export type InventoryState = z.infer<typeof inventoryStateSchema>;
