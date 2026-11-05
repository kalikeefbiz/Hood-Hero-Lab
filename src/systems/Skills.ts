import { z } from "zod";
import type { Character, GameState } from "../core/GameState";
import { record } from "../core/EventLog";

export const SKILLS = {
  combat: {
    name: "Combat",
    ranks: ["Uncertified", "Certified", "Stepper", "Gravedigger"],
    gates: [0, 0, 1500, 6000],
  },
  robbery: {
    name: "Robbery",
    ranks: ["Strong-Arm", "Home Invasion", "Armed Stickup", "Major Score"],
    gates: [0, 900, 3500, 9000],
  },
  trapper: {
    name: "Trapper",
    ranks: ["Peon", "Corner Boy", "Local Plug", "Big Dog"],
    gates: [0, 3500, 13000, 40000],
  },
  survival: {
    name: "Survival",
    ranks: ["Green", "Alert", "Hardened", "Survivor"],
    gates: [0, 1200, 4500, 11000],
  },
  social: {
    name: "Social",
    ranks: ["Familiar", "Connected", "Influential", "Power Broker"],
    gates: [0, 2000, 6500, 16000],
  },
  leadership: {
    name: "Leadership",
    ranks: ["Unproven", "Reliable", "Organizer", "Shot Caller"],
    gates: [0, 1200, 4200, 10500],
  },
  work: {
    name: "Work",
    ranks: ["Entry-Level", "Reliable", "Skilled", "Professional"],
    gates: [0, 2500, 8000, 19000],
  },
  business: {
    name: "Business",
    ranks: ["Beginner", "Operator", "Proprietor", "Entrepreneur"],
    gates: [0, 2000, 7000, 18000],
  },
} as const;
export type Skill = keyof typeof SKILLS;
export const skillIds = Object.keys(SKILLS) as Skill[];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const skillProgressSchema = z.object({
  xp: z.object({
    combat: count,
    robbery: count,
    trapper: count,
    survival: count,
    social: count,
    leadership: count,
    work: count,
    business: count,
  }),
  milestones: z.record(z.string(), count),
  awards: z.array(
    z.object({
      id: z.string(),
      skill: z.enum(skillIds as [Skill, ...Skill[]]),
      amount: count,
      day: count,
    }),
  ),
});
export type SkillProgress = z.infer<typeof skillProgressSchema>;

/** Legacy scores remain compatibility attributes, never mastery percentages or crime training. */
export function skillsOf(c: Character): SkillProgress {
  if (c.skillProgress) return c.skillProgress;
  const p: SkillProgress = {
    xp: Object.fromEntries(skillIds.map((k) => [k, 0])) as SkillProgress["xp"],
    milestones: {},
    awards: [],
  };
  if (c.id !== "player") {
    p.xp.social = Math.max(0, Math.floor((c.skills.social - 35) * 100));
    p.xp.work = Math.max(0, Math.floor((c.skills.work - 30) * 100));
    p.xp.survival = Math.max(0, Math.floor((c.skills.recovery - 30) * 80));
    if (["quanny", "mega"].includes(c.id)) {
      p.milestones.certified = 1;
      p.milestones.violentSuccess = c.id === "mega" ? 12 : 5;
      p.xp.combat = c.id === "mega" ? 6000 : 2500;
      p.xp.trapper = c.id === "quanny" ? 6500 : 3500;
    }
    p.xp.leadership = Math.max(0, Math.floor((c.authority - 30) * 70));
  }
  return (c.skillProgress = p);
}
export function missingMilestones(
  c: Character,
  skill: Skill,
  rank: number,
): string[] {
  const p = skillsOf(c),
    m = p.milestones,
    missing: string[] = [];
  if (skill === "combat") {
    if (rank >= 2 && !m.certified)
      missing.push("Story certification — not yet available in the game");
    const need = rank === 4 ? 12 : rank === 3 ? 3 : 0;
    if ((m.violentSuccess ?? 0) < need)
      missing.push(
        `${m.violentSuccess ?? 0}/${need} successful violent operations`,
      );
  }
  if (skill === "robbery" && rank >= 2) {
    const need = [0, 0, 3, 9, 18][rank];
    if ((m.robberySuccess ?? 0) < need)
      missing.push(`${m.robberySuccess ?? 0}/${need} successful robberies`);
    if (skillRank(c, "combat") < (rank === 4 ? 4 : 2))
      missing.push(rank === 4 ? "Gravedigger Combat" : "Certified Combat");
    if (!m[`robberyAccess${rank}`])
      missing.push(
        "Appropriate activity/story access — not yet available in the game",
      );
  }
  if (skill === "trapper" && rank >= 3) {
    if (!m.supplierCredible) missing.push("Credible supplier relationship");
    if (!m.supplierPaid) missing.push("Completed supplier obligation");
    if (rank === 4) {
      if ((m.supplyHistory ?? 0) < 12)
        missing.push(
          `${m.supplyHistory ?? 0}/12 meaningful completed supply lots`,
        );
      if ((m.commercialZones ?? 0) < 2)
        missing.push("Successful commerce in at least two zones");
    }
  }
  return missing;
}
export function skillRank(c: Character, skill: Skill): number {
  const p = skillsOf(c);
  let rank = 1;
  for (let r = 2; r <= 4; r++) {
    if (
      p.xp[skill] < SKILLS[skill].gates[r - 1] ||
      missingMilestones(c, skill, r).length
    )
      break;
    rank = r;
  }
  return rank;
}
export function proficiency(c: Character, skill: Skill): number {
  const legacy =
    skill === "social"
      ? c.skills.social
      : skill === "work"
        ? c.skills.work
        : skill === "survival"
          ? c.skills.recovery
          : 20;
  return Math.min(
    100,
    Math.max(
      legacy,
      20 +
        (skillRank(c, skill) - 1) * 20 +
        Math.min(20, skillsOf(c).xp[skill] / 500),
    ),
  );
}
/** A command's durable outcome id, plus category, is the idempotency key. */
export function awardSkill(
  s: GameState,
  actor: string,
  skill: Skill,
  amount: number,
  id: string,
  milestone?: string,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !s.characters[actor])
    return false;
  const c = s.characters[actor],
    p = skillsOf(c),
    key = `${skill}:${id}`;
  if (p.awards.some((a) => a.id === key) || !Number.isSafeInteger(p.xp[skill] + amount)) return false;
  p.awards.push({ id: key, skill, amount, day: s.day });
  p.xp[skill] += amount;
  if (milestone) p.milestones[milestone] = (p.milestones[milestone] ?? 0) + 1;
  record(
    s,
    "system",
    `${c.name}: +${(amount / 100).toFixed(2)} ${SKILLS[skill].name} XP · ${SKILLS[skill].ranks[skillRank(c, skill) - 1]}.`,
    [actor],
    [actor],
  );
  return true;
}
export function awardBuyer(
  s: GameState,
  actor: string,
  id: string,
  outcome: "sale" | "failed" | "pass",
  tier = 1,
) {
  if (outcome === "pass") return false;
  const p = skillsOf(s.characters[actor]);
  // Failed exposure cannot be farmed indefinitely, even by future high-capacity products.
  if (
    outcome === "failed" &&
    p.awards.filter(
      (a) => a.skill === "trapper" && a.day === s.day && a.amount === 20,
    ).length >= 6
  )
    return false;
  return awardSkill(
    s,
    actor,
    "trapper",
    outcome === "sale"
      ? [50, 75, 100, 125][Math.max(0, Math.min(3, tier - 1))]
      : 20,
    id,
  );
}
export function awardCombat(
  s: GameState,
  actor: string,
  id: string,
  outcome: "success" | "failed" | "defense",
) {
  return awardSkill(
    s,
    actor,
    "combat",
    outcome === "success" ? 500 : outcome === "failed" ? 100 : 200,
    id,
    outcome === "success" ? "violentSuccess" : undefined,
  );
}
export function awardRobbery(
  s: GameState,
  actor: string,
  id: string,
  kind: "strong-arm" | "home" | "store" | "bank",
  success: boolean,
) {
  const rewards = {
    "strong-arm": [300, 50],
    home: [500, 100],
    store: [700, 100],
    bank: [1200, 200],
  };
  return awardSkill(
    s,
    actor,
    "robbery",
    rewards[kind][success ? 0 : 1],
    id,
    success ? "robberySuccess" : undefined,
  );
}
export function bankEligible(c: Character) {
  return (
    skillRank(c, "combat") === 4 &&
    c.equipment?.equipped === "arp" &&
    c.equipment.owned.includes("arp")
  );
}
export function drillEligible(s: GameState) {
  return (
    skillRank(s.characters[s.playerId], "combat") === 4 &&
    s.crew.members.some(
      (id) =>
        skillRank(s.characters[id], "combat") >= 3 &&
        s.characters[id].status === "active" &&
        (s.characters[id].relationships[s.playerId]?.trust ?? 0) >= 45,
    )
  );
}
