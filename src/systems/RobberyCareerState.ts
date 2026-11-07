import { z } from "zod";
import { ITEM_DEFINITIONS } from "../content/inventory";
const n = z.number().int().nonnegative();
const item = z.enum(
  Object.keys(ITEM_DEFINITIONS) as [
    keyof typeof ITEM_DEFINITIONS,
    ...(keyof typeof ITEM_DEFINITIONS)[],
  ],
);
export const careerSessionSchema = z.object({
  visitor: z.string().optional(),
  targetId: z.string(),
  victim: z.string().optional(),
  kind: z.enum(["strong-arm", "home", "liquor", "store"]),
  pressure: n,
  revealed: n,
  cash: n,
  roll: z.number().min(0).max(1),
  riskRoll: z.number().min(0).max(1),
  participants: z.array(
    z.object({
      id: z.string(),
      share: z.number().min(0).max(0.25),
      attack: z.number(),
      combat: n,
    }),
  ),
  goods: z.array(
    z.object({
      id: z.string(),
      itemId: item,
      quantity: n.min(1),
      value: n,
      beat: n,
      locked: z.boolean(),
      takenBy: z.string().optional(),
      sourceSlot: z.string().optional(),
    }),
  ),
  dial: z.object({
    target: n.max(100),
    tries: n.max(3),
    open: z.boolean(),
    feedback: z.string(),
  }),
});
export type CareerSession = z.infer<typeof careerSessionSchema>;
export const robberyCareerSchema = z.object({
  visitors: z
    .record(
      z.string(),
      z.object({ lastDay: n, eventId: z.string(), targetId: z.string() }),
    )
    .default({}),
  cooldowns: z.record(
    z.string(),
    z.object({ day: n, nextDay: n, jobId: z.string() }),
  ),
  invitations: z.array(
    z.object({
      jobId: z.string(),
      member: z.string(),
      day: n,
      meetingLocation: z.string().optional(),
      share: z.number(),
      status: z.enum(["accepted", "participated", "expired"]),
    }),
  ),
  sources: z.record(z.string(), z.object({ stock: n, jewelry: n })),
  property: z.record(
    z.string(),
    z.object({
      itemId: item,
      owner: z.string(),
      eventId: z.string(),
      value: n,
      quantity: n.min(1),
      jobId: z.string(),
    }),
  ),
  claims: z.array(
    z.object({
      id: z.string(),
      jobId: z.string(),
      member: z.string(),
      amount: n,
      paid: n,
      dueDay: n,
      warned: z.boolean(),
    }),
  ),
  rumors: z.array(
    z.object({
      jobId: z.string(),
      eventId: z.string(),
      witness: z.string(),
      zone: z.string(),
      profit: n,
      day: n,
    }),
  ),
  extortions: z.array(
    z.object({
      id: z.string(),
      jobId: z.string(),
      npc: z.string(),
      amount: n,
      status: z.enum(["pending", "paid", "refused"]),
      eventId: z.string(),
    }),
  ),
  seizures: z.array(
    z.object({
      eventId: z.string(),
      actor: z.string(),
      day: n,
      slots: z.array(z.string()),
    }),
  ),
});
export type RobberyCareer = z.infer<typeof robberyCareerSchema>;
export const newRobberyCareer = (): RobberyCareer => ({
  visitors: {},
  cooldowns: {},
  invitations: [],
  sources: {},
  property: {},
  claims: [],
  rumors: [],
  extortions: [],
  seizures: [],
});
