import { z } from "zod";
const count = z.number().int().nonnegative();
export const streetLifeSchema = z.object({
  rng: count.max(4294967295).default(11011),
  legacy: z.boolean(),
  decision: z.enum(["unasked", "delay", "promise", "decline"]),
  initialDecision: z.enum(["promise", "decline"]).optional(),
  decisionDay: count.optional(),
  workEvent: z.string().optional(),
  giftLot: z.string().optional(),
  starterLot: z.string().optional(),
  lesson: z.enum(["waiting", "started", "complete"]),
  aftermath: z.enum(["hostile", "discount", "buster", "nonfactor"]).optional(),
  aftermathEvent: z.string().optional(),
  rioContact: z.string().optional(),
  tribute: z.array(
    z.object({
      id: z.string(),
      day: count,
      throughDay: count,
      contact: z.string(),
      amount: count,
      eventId: z.string(),
    }),
  ),
  scenes: z.record(z.string(), z.string()),
  exchanges: z.array(
    z.object({
      id: z.string(),
      item: z.string().optional(),
      direction: z.enum(["give", "get"]).optional(),
      provenance: z.enum(["clean", "illicit", "any"]).optional(),
      quantity: count,
      paid: count,
      received: count,
    }),
  ),
});
export type StreetLifeState = z.infer<typeof streetLifeSchema>;
export const newStreetLife = (legacy = false): StreetLifeState => ({
  rng: 11011,
  legacy,
  decision: "unasked",
  lesson: legacy ? "complete" : "waiting",
  tribute: [],
  scenes: {},
  exchanges: [],
});
