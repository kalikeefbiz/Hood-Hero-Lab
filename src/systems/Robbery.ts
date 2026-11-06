import { remember, change } from "./Relationships";
import { z } from "zod";
import { player, cash, clamp, type GameState } from "../core/GameState";
import { presenceOf } from "../board/presence";
import { locationById } from "../board/locations";
import { random } from "../core/Random";
import { record } from "../core/EventLog";
import { earn, expense } from "./Economy";
import { addExposure } from "./CriminalExposure";
import { arrest } from "./Incarceration";
import { hospitalStay, streetConversation, hospitalize } from "./Danger";
import { currentEncounter } from "./EncounterLifecycle";
import { TRIO, lessonError, personalBeef } from "./StreetAccess";
import { atPerson } from "./StreetLife";
import { skillsOf, skillRank, awardCombat, awardRobbery } from "./Skills";
import { equipmentOf, grantEquipment } from "./Equipment";
const uint = z.number().int().nonnegative();
const prepId = z.enum(["gloves", "mask", "duffle", "pattern-token"]);
const kind = z.enum(["strong-arm", "home", "store", "bank"]);
export const ROBBERY_TYPES = {
  "strong-arm": {
    name: "Strong-arm",
    combat: 1,
    robbery: 1,
    prep: ["gloves", "mask"] as string[],
    loot: [65, 125],
    risk: 0.18,
    weapon: null,
  },
  home: {
    name: "Home invasion",
    combat: 2,
    robbery: 2,
    prep: ["gloves", "mask", "duffle", "pattern-token"] as string[],
    loot: [190, 340],
    risk: 0.3,
    weapon: "law-19",
  },
  store: {
    name: "Store robbery",
    combat: 3,
    robbery: 3,
    prep: ["gloves", "mask", "duffle"] as string[],
    loot: [0, 0],
    risk: 0.4,
    weapon: "law-19-switch",
  },
  bank: {
    name: "Major score",
    combat: 4,
    robbery: 4,
    prep: ["gloves", "mask", "duffle", "pattern-token"] as string[],
    loot: [0, 0],
    risk: 0.6,
    weapon: "arp",
  },
} as const;
export const PREPARATION = {
  gloves: { name: "Gloves", price: 8, location: "south.food-mart" },
  mask: { name: "Mask", price: 12, location: "nawf.street-market" },
  duffle: { name: "Duffle bag", price: 22, location: "nawf.street-market" },
  "pattern-token": {
    name: "Fictional pattern token",
    price: 18,
    location: "reservoir.warehouse",
  },
};
export type PrepId = keyof typeof PREPARATION;
export const robberyStateSchema = z.object({
  items: z.record(prepId, uint),
  purchases: z.array(
    z.object({
      id: z.string(),
      item: prepId,
      day: uint,
      location: z.string(),
      cost: uint,
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.string(),
      kind,
      source: z.string(),
      location: z.string(),
      createdDay: uint,
      expiresDay: uint,
      status: z.enum([
        "offered",
        "active",
        "success",
        "partial",
        "failed",
        "expired",
      ]),
    }),
  ),
  history: z.array(
    z.object({
      id: z.string(),
      jobId: z.string(),
      day: uint,
      outcome: z.enum(["success", "partial", "failed"]),
      loot: uint,
      eventId: z.string(),
    }),
  ),
});
export type RobberyState = z.infer<typeof robberyStateSchema>;
export const newRobberyState = (): RobberyState => ({
  items: { gloves: 0, mask: 0, duffle: 0, "pattern-token": 0 },
  purchases: [],
  jobs: [],
  history: [],
});
export const robberySessionSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    location: z.string(),
    day: uint,
    paidAP: z.literal(true),
    status: z.enum(["active", "paused", "ended"]),
    cursor: uint.max(3),
    seed: uint.max(4294967295),
    pattern: z.array(uint.max(2)).length(3),
    answers: z.array(z.string()).max(3),
    text: z.string(),
    loot: uint,
    score: z.number().int().min(-3).max(4),
  })
  .refine(
    (a) =>
      a.cursor === a.answers.length &&
      (a.cursor !== 3 || a.status === "ended") &&
      a.answers.every((answer, i) =>
        i === 0
          ? ["patient", "rush", "withdraw"].includes(answer)
          : i === 1
            ? /^[0-2],[0-2],[0-2]$/.test(answer)
            : ["leave", "push"].includes(answer),
      ),
  );
export type RobberySession = z.infer<typeof robberySessionSchema>;
export function robberySourceError(s: GameState, id: string) {
  if (lessonError(s)) return lessonError(s);
  if (!atPerson(s, id))
    return "Speak to this contact at their physical City location.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Return safely to the City first.";
  if (
    (s.activeRobbery && s.activeRobbery.status !== "ended") ||
    (s.activeSession && s.activeSession.status !== "ended")
  )
    return "Finish your active session first.";
  if (
    personalBeef(s, id) ||
    (TRIO.includes(id) && TRIO.some((member) => personalBeef(s, member)))
  )
    return "Resolve your personal beef before asking for a job.";
  const trust = s.characters[id]?.relationships[s.playerId]?.trust ?? 0;
  if (TRIO.includes(id))
    return trust >= 35
      ? null
      : "Earn 35 trust toward you from a crew member first.";
  if (id === "quanny")
    return s.quanny.business === "open" && trust >= 45
      ? null
      : "Quanny requires open business and 45 earned trust. His existing repair conditions still apply.";
  return "This person has no robbery introduction.";
}
export function robberyOfferError(s: GameState, id: string) {
  const access = robberySourceError(s, id);
  if (access) return access;
  const active = s.robberies?.jobs.find(
    (j) =>
      j.status === "active" ||
      (j.status === "offered" && j.expiresDay >= s.day),
  );
  if (active)
    return `You already have ${active.id}. Prepare and visit ${locationById(active.location)?.name}.`;
  if (
    s.robberies?.history.some(
      (h) => s.robberies?.jobs.find((j) => j.id === h.jobId)?.kind === "home",
    )
  )
    return "That home lead is resolved. Store and bank scores are not available yet.";
  if (s.robberies?.jobs.some((j) => j.createdDay === s.day))
    return "No fresh lead today. Ask again tomorrow.";
  return null;
}
export function offerRobbery(state: GameState, source: string) {
  if (robberyOfferError(state, source)) return state;
  const s = structuredClone(state),
    r = (s.robberies ??= newRobberyState());
  for (const j of r.jobs)
    if (j.status === "offered" && j.expiresDay < s.day) j.status = "expired";
  if (
    r.jobs.some((j) => ["offered", "active"].includes(j.status)) ||
    r.jobs.some((j) => j.createdDay === s.day)
  )
    return state;
  const m = skillsOf(player(s)).milestones,
    home = (m.robberySuccess ?? 0) >= 3;
  if (
    r.history.some((h) => r.jobs.find((j) => j.id === h.jobId)?.kind === "home")
  )
    return state;
  if (home) m.robberyAccess2 = 1;
  const job: RobberyState["jobs"][number] = {
    id: `lick-${s.nextId++}`,
    kind: home ? "home" : "strong-arm",
    source,
    location: home ? "reservoir.boarded-house" : "rio.courtyard",
    createdDay: s.day,
    expiresDay: s.day + 6,
    status: "offered",
  };
  r.jobs.push(job);
  record(
    s,
    "social",
    home
      ? "“Three real jobs behind you. There’s a home-invasion opportunity at the Boarded house. Certified Combat, Home Invasion rank, equipped Law-19 and four preparation items. The colored pattern is a fictional game, not a real access system.”"
      : "“There’s a courier carrying a street payment at the Rio courtyard. This is a strong-arm job. Gloves and mask, no firearm required. Someone can get hurt or arrested. You can keep living lawful; nobody is making you do this.”",
    [source, s.playerId],
    undefined,
    { title: "Optional street operation", importance: "personal" },
  );
  return s;
}
export function purchasePrepError(
  s: GameState,
  item: PrepId,
  location: string,
) {
  const d = PREPARATION[item];
  if (!d || d.location !== location || presenceOf(s).location !== location)
    return "Visit the actual shop for this item.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Finish the current encounter first.";
  if (
    (s.activeSession && s.activeSession.status !== "ended") ||
    (s.activeRobbery && s.activeRobbery.status !== "ended")
  )
    return "Finish your current session first.";
  if (s.ap < 1) return "Requires 1 AP to shop.";
  if (cash(player(s)) < d.price) return `Requires $${d.price}.`;
  if ((s.robberies?.items[item] ?? 0) >= 2)
    return "You already hold two; this shop limits personal stock.";
  return null;
}
export function purchasePrep(state: GameState, item: PrepId, location: string) {
  if (purchasePrepError(state, item, location)) return state;
  const s = structuredClone(state),
    r = (s.robberies ??= newRobberyState()),
    d = PREPARATION[item];
  s.ap--;
  expense(s, player(s), d.price, `City supplies · ${d.name}`);
  r.items[item]++;
  const e = record(
    s,
    "money",
    `Bought ${d.name} for $${d.price} at ${locationById(location)?.name} · 1 AP. Used on a robbery attempt, including failure.`,
    [s.playerId],
  );
  r.purchases.push({ id: e.id, item, day: s.day, location, cost: d.price });
  s.streetLife?.exchanges.push({
    id: e.id,
    item: d.name,
    quantity: 1,
    paid: d.price,
    received: 0,
  });
  return s;
}
export function robberyStartError(s: GameState, jobId: string) {
  const intro = lessonError(s);
  if (intro) return intro;
  const j = s.robberies?.jobs.find((j) => j.id === jobId);
  if (!j || j.status !== "offered" || j.expiresDay < s.day)
    return "This opportunity is unavailable, resolved or expired.";
  const d = ROBBERY_TYPES[j.kind];
  if (j.kind === "store" || j.kind === "bank")
    return "Future tier: no authored opportunity is available.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Finish your encounter and return safely to the City.";
  if (
    (s.activeRobbery && s.activeRobbery.status !== "ended") ||
    (s.activeSession && s.activeSession.status !== "ended")
  )
    return "Finish or leave your active session first.";
  if (presenceOf(s).location !== j.location)
    return "Stand at the specified City location first.";
  if (s.ap < 1) return "Requires 1 AP.";
  if (
    skillRank(player(s), "combat") < d.combat ||
    skillRank(player(s), "robbery") < d.robbery
  )
    return `Requires Combat rank ${d.combat} and Robbery rank ${d.robbery}.`;
  if (d.weapon && equipmentOf(player(s)).equipped !== d.weapon)
    return `Requires equipped ${d.weapon}. Seek equipment through a trusted contact after certification.`;
  const missing = d.prep.filter((id) => !s.robberies?.items[id as PrepId]);
  if (missing.length)
    return `Prepare in the City: ${missing.map((id) => PREPARATION[id as PrepId].name).join(", ")}.`;
  return null;
}
export function startRobbery(state: GameState, jobId: string) {
  const error = robberyStartError(state, jobId);
  if (error) return { state, error };
  const s = structuredClone(state),
    j = s.robberies!.jobs.find((j) => j.id === jobId)!;
  s.ap--;
  j.status = "active";
  for (const item of ROBBERY_TYPES[j.kind].prep) {
    s.robberies!.items[item as PrepId]--;
    s.streetLife?.exchanges.push({
      id: `prep-use-${s.nextId++}`,
      item: PREPARATION[item as PrepId].name,
      quantity: 1,
      direction: "give",
      paid: 0,
      received: 0,
    });
  }
  s.activeRobbery = {
    id: `robbery-${s.nextId++}`,
    jobId,
    location: j.location,
    day: s.day,
    paidAP: true,
    status: "active",
    cursor: 0,
    seed: Math.floor(random(s) * 4294967296),
    pattern: Array.from({ length: 3 }, () => Math.floor(random(s) * 3)),
    answers: [],
    text:
      j.kind === "home"
        ? "An occupant crosses the yard. Watch the board and choose how to handle the pressure. You may withdraw; preparation and AP stay spent."
        : "The courier approaches. Watch the board. Choose how to handle the pressure. You may withdraw; preparation and AP stay spent.",
    loot: 0,
    score: 0,
  };
  record(
    s,
    "risk",
    `Started ${ROBBERY_TYPES[j.kind].name} at ${locationById(j.location)?.name}. 1 AP and required preparation consumed.`,
    [s.playerId, j.source],
  );
  return { state: s, error: null };
}
function interrupted(s: GameState) {
  const a = s.activeRobbery!;
  return (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s) ||
    s.day !== a.day ||
    presenceOf(s).location !== a.location
  );
}
export function robberyInput(
  state: GameState,
  id: string,
  cursor: number,
  answer: string,
) {
  const old = state.activeRobbery;
  if (
    !old ||
    old.id !== id ||
    old.cursor !== cursor ||
    old.status !== "active" ||
    cursor >= 3
  )
    return state;
  if (
    (cursor === 0 && !["patient", "rush", "withdraw"].includes(answer)) ||
    (cursor === 1 && !/^[0-2],[0-2],[0-2]$/.test(answer)) ||
    (cursor === 2 && !["leave", "push"].includes(answer))
  )
    return state;
  const s = structuredClone(state),
    a = s.activeRobbery!,
    j = s.robberies!.jobs.find((j) => j.id === a.jobId)!;
  if (interrupted(s)) return leaveRobbery(s, id);
  a.answers.push(answer);
  a.cursor++;
  if (cursor === 0) {
    a.score = answer === "patient" ? 1 : answer === "rush" ? -1 : 0;
    a.text =
      "A witness turns toward the scene. Repeat the three colored symbols shown, in order. This abstract memory challenge affects the escape, not a real lock or alarm.";
  }
  if (cursor === 1) {
    a.score += answer === a.pattern.join(",") ? 2 : -2;
    a.text =
      answer === a.pattern.join(",")
        ? "You held your focus. A route back into the City opens. Leave now or push for the full payment?"
        : "You lost the pattern. The witness raises an alert. Leave now or risk pushing on?";
  }
  if (answer === "withdraw") {
    a.status = "ended";
    a.text = "You withdrew before participation. No loot or XP.";
    j.status = "failed";
    return s;
  }
  if (cursor < 2) return s;
  const rng = s.rng;
  s.rng = a.seed;
  const roll = random(s),
    risk = random(s),
    lootRoll = random(s);
  s.rng = rng;
  const d = ROBBERY_TYPES[j.kind],
    chance = clamp(
      0.44 + a.score * 0.11 + (answer === "leave" ? 0.08 : -0.08),
      0.12,
      0.88,
    );
  const success = roll < chance,
    partial = success && answer === "leave",
    loot = success
      ? Math.floor(
          (d.loot[0] + lootRoll * (d.loot[1] - d.loot[0])) *
            (partial ? 0.6 : 1),
        )
      : 0;
  a.status = "ended";
  a.loot = loot;
  j.status = success ? (partial ? "partial" : "success") : "failed";
  const e = record(
    s,
    "risk",
    `${d.name}: ${success ? (partial ? "partial proceeds; you left early" : "payment taken") : "failed; no loot"}. $${loot} illicit cash. Witnesses remember the operation. The scene ended without a killing.`,
    [s.playerId, j.source],
    undefined,
    { importance: "major", title: "Robbery outcome" },
  );
  s.robberies!.history.push({
    id: a.id,
    jobId: j.id,
    day: s.day,
    outcome: success ? (partial ? "partial" : "success") : "failed",
    loot,
    eventId: e.id,
  });
  if (loot) {
    earn(s, player(s), loot, "illicit", "Robbery proceeds");
    s.streetLife?.exchanges.push({
      id: e.id,
      quantity: 0,
      paid: 0,
      received: loot,
      provenance: "illicit",
    });
  }
  // Certification requires actual completion of this optional authored violent-crime scene.
  const firstCertification = !skillsOf(player(s)).milestones.certified;
  skillsOf(player(s)).milestones.certified = 1;
  awardCombat(s, s.playerId, a.id, success ? "success" : "failed");
  awardRobbery(s, s.playerId, a.id, j.kind, success);
  addExposure(
    s,
    s.playerId,
    locationById(j.location)!.zone,
    success ? 14 : 22,
    true,
  );
  player(s).notoriety = clamp(player(s).notoriety + 6);
  player(s).rivalThreat = clamp(player(s).rivalThreat + (success ? 5 : 10));
  s.strategic.lastCrimeDay = s.day;
  const witness =
    j.kind === "strong-arm" ? "resident-rio" : "resident-reservoir";
  remember(
    s,
    j.source,
    s.playerId,
    e.id,
    success
      ? "Completed the optional operation I introduced."
      : "Failed the optional operation I introduced.",
    12,
  );
  remember(
    s,
    witness,
    s.playerId,
    e.id,
    `Witnessed a ${d.name.toLowerCase()}; remembers the player and reported the scene.`,
    18,
  );
  change(s.characters[witness], s.playerId, {
    trust: -8,
    grievance: success ? 12 : 6,
  });
  player(s).neighborhoodStanding[locationById(j.location)!.zone] = clamp(
    player(s).neighborhoodStanding[locationById(j.location)!.zone] - 3,
    -100,
    100,
  );
  a.text =
    e.text +
    (firstCertification
      ? " You earned Certified Combat."
      : " Your skills reflect the outcome.");
  if (!success && risk < d.risk) {
    arrest(s, s.playerId, "witness report after robbery", 1);
    a.text += " Police intervened.";
  } else if (!success && risk < d.risk + 0.18) {
    hospitalize(s, "assault", e.id);
    a.text += " Injured during the failed attempt.";
  }
  return s;
}
export function pauseRobbery(state: GameState, id: string, paused: boolean) {
  if (state.activeRobbery?.id !== id || state.activeRobbery.status === "ended")
    return state;
  const s = structuredClone(state);
  if (interrupted(s)) return leaveRobbery(s, id);
  s.activeRobbery!.status = paused ? "paused" : "active";
  return s;
}
export function leaveRobbery(state: GameState, id: string) {
  if (state.activeRobbery?.id !== id || state.activeRobbery.status === "ended")
    return state;
  const s = structuredClone(state);
  s.activeRobbery!.status = "ended";
  s.activeRobbery!.text =
    "Attempt abandoned. No loot; spent AP and preparation remain spent.";
  const j = s.robberies?.jobs.find((j) => j.id === s.activeRobbery!.jobId);
  if (j) j.status = "failed";
  return s;
}
export function equipmentContactError(s: GameState, id: string) {
  if (robberySourceError(s, id)) return robberySourceError(s, id);
  if (skillRank(player(s), "combat") < 2)
    return "Complete an optional violent-operation introduction for Certified Combat first.";
  if (equipmentOf(player(s)).owned.includes("law-19"))
    return "You already own a Law-19.";
  if (cash(player(s)) < 75 || s.ap < 1) return "Requires $75 and 1 AP.";
  return null;
}
export function obtainContactEquipment(state: GameState, id: string) {
  if (equipmentContactError(state, id)) return state;
  const s = structuredClone(state);
  s.ap--;
  expense(s, player(s), 75, "Contact equipment · Law-19");
  const e = record(
    s,
    "money",
    `${s.characters[id].name} arranged a Law-19 for $75 after your certification. Equip it in Wallet; carrying it does not grant skill.`,
    [s.playerId, id],
  );
  grantEquipment(s, s.playerId, "law-19", e.id);
  s.streetLife?.exchanges.push({
    id: e.id,
    item: "Law-19",
    quantity: 1,
    paid: 75,
    received: 0,
  });
  return s;
}
export function validateRobberyReferences(s: GameState) {
  const r = s.robberies,
    a = s.activeRobbery;
  if (!r) {
    if (a) throw new Error("Missing robbery ledger.");
    return;
  }
  if (
    r.purchases.some(
      (p) =>
        p.location !== PREPARATION[p.item].location ||
        p.cost !== PREPARATION[p.item].price ||
        p.day > s.day ||
        !s.events.some((e) => e.id === p.id),
    ) ||
    new Set(r.purchases.map((p) => p.id)).size !== r.purchases.length ||
    new Set(r.history.map((h) => h.id)).size !== r.history.length ||
    (Object.keys(PREPARATION) as PrepId[]).some(
      (item) =>
        r.items[item] !==
        r.purchases.filter((p) => p.item === item).length -
          r.jobs.filter(
            (j) =>
              ["active", "success", "partial", "failed"].includes(j.status) &&
              (ROBBERY_TYPES[j.kind].prep as readonly string[]).includes(item),
          ).length,
    ) ||
    r.jobs.some(
      (j) =>
        ["success", "partial"].includes(j.status) &&
        !r.history.some((h) => h.jobId === j.id && h.outcome === j.status),
    ) ||
    r.jobs.some(
      (j) =>
        j.status === "active" &&
        (!a || a.jobId !== j.id || a.status === "ended"),
    )
  )
    throw new Error("Invalid robbery resources or settlements.");
  if (
    new Set(r.jobs.map((j) => j.id)).size !== r.jobs.length ||
    new Set(r.history.map((h) => h.jobId)).size !== r.history.length ||
    r.jobs.some(
      (j) =>
        !s.characters[j.source] ||
        !locationById(j.location) ||
        j.createdDay > s.day ||
        j.expiresDay !== j.createdDay + 6 ||
        j.location !==
          (j.kind === "home" ? "reservoir.boarded-house" : "rio.courtyard"),
    ) ||
    r.history.some(
      (h) =>
        !r.jobs.some(
          (j) =>
            j.id === h.jobId &&
            ["success", "partial", "failed"].includes(j.status),
        ) ||
        !s.events.some((e) => e.id === h.eventId) ||
        h.day > s.day,
    )
  )
    throw new Error("Invalid robbery history.");
  if (a) {
    const j = r.jobs.find((j) => j.id === a.jobId);
    if (
      !j ||
      j.location !== a.location ||
      a.day > s.day ||
      (a.status !== "ended" &&
        (j.status !== "active" ||
          a.day !== s.day ||
          presenceOf(s).location !== a.location ||
          (s.activeSession && s.activeSession.status !== "ended"))) ||
      (a.cursor === 3 &&
        !r.history.some((h) => h.id === a.id && h.loot === a.loot))
    )
      throw new Error("Invalid robbery session references.");
  }
}
