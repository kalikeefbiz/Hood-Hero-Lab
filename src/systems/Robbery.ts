import { ROBBERY_BALANCE } from "../content/robberyCareer";
import { careerSessionSchema } from "./RobberyCareerState";
import {
  careerStartError,
  initializeCareer,
  careerInput,
  settleCareer,
  offerCareerLead,
  targetForJob,
} from "./RobberyCareer";
import {
  gain,
  gainError,
  receivePhysical,
  inventoryOf,
  removePhysical,
  syncCarried,
} from "./Inventory";
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
import {
  equipmentOf,
  grantEquipment,
  equipError,
  equipmentBonus,
} from "./Equipment";
const uint = z.number().int().nonnegative();
const prepId = z.enum(["gloves", "mask", "duffle", "pattern-token"]);
const kind = z.enum(["strong-arm", "home", "store", "bank", "liquor"]);
export const ROBBERY_TYPES = {
  "strong-arm": {
    name: "Strong-arm",
    combat: 1,
    robbery: 1,
    prep: ["gloves", "mask"] as string[],
    loot: ROBBERY_BALANCE.civilianCash,
    risk: 0.18,
    weapon: null,
  },
  home: {
    name: "Home invasion",
    combat: 2,
    robbery: 2,
    prep: ["gloves", "mask", "duffle"] as string[],
    loot: ROBBERY_BALANCE.homeCash,
    risk: 0.3,
    weapon: "law-19",
  },
  store: {
    name: "Store robbery",
    combat: 3,
    robbery: 3,
    prep: ["gloves", "mask", "duffle"] as string[],
    loot: ROBBERY_BALANCE.commercialCash,
    risk: 0.4,
    weapon: "law-19",
  },
  liquor: {
    name: "Liquor-store robbery",
    combat: 2,
    robbery: 2,
    prep: ["gloves", "mask"] as string[],
    loot: ROBBERY_BALANCE.liquorCash,
    risk: 0.4,
    weapon: "law-19",
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
      quantity: uint.min(1).max(5).optional(),
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.string(),
      kind,
      targetId: z.string().optional(),
      victim: z.string().optional(),
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
    career: careerSessionSchema.optional(),
    cursor: uint,
    seed: uint.max(4294967295),
    pattern: z.array(uint.max(2)).length(3),
    answers: z.array(z.string()).max(3),
    text: z.string(),
    loot: uint,
    score: z.number().int().min(-3).max(4),
  })
  .refine(
    (a) =>
      !!a.career ||
      (a.cursor === a.answers.length &&
        (a.cursor !== 3 || a.status === "ended") &&
        a.answers.every((answer, i) =>
          i === 0
            ? ["patient", "rush", "withdraw"].includes(answer)
            : i === 1
              ? /^[0-2],[0-2],[0-2]$/.test(answer)
              : ["leave", "push"].includes(answer),
        )),
  );
export type RobberySession = z.infer<typeof robberySessionSchema>;
export function robberySourceError(s: GameState, id: string) {
  if (lessonError(s)) return lessonError(s);
  if (!atPerson(s, id))
    return "Find them in the City first.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Get somewhere safe first.";
  if (
    (s.activeRobbery && s.activeRobbery.status !== "ended") ||
    (s.activeSession && s.activeSession.status !== "ended")
  )
    return "Finish what you’re doing first.";
  if (
    personalBeef(s, id) ||
    (TRIO.includes(id) && TRIO.some((member) => personalBeef(s, member)))
  )
    return "Squash your beef with them before you ask for work.";
  const trust = s.characters[id]?.relationships[s.playerId]?.trust ?? 0;
  if (TRIO.includes(id))
    return trust >= 35
      ? null
      : "They don’t trust you enough to put you on yet.";
  if (id === "quanny")
    return s.quanny.business === "open" && trust >= 45
      ? null
      : "Quanny doesn’t trust you enough to put you on.";
  return "They don’t have work like that for you.";
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
    return `You already have a job lined up at ${locationById(active.location)?.name}.`;
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
  if (home) {
    const result = offerCareerLead(
      state,
      source,
      (m.robberySuccess ?? 0) >= 9 ? "commercial.designer" : "home.reservoir.1",
    );
    return typeof result === "string" ? state : result;
  }
  const job: RobberyState["jobs"][number] = {
    id: `lick-${s.nextId++}`,
    targetId: "street.rio",
    kind: "strong-arm",
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
      ? "“You got three real jobs behind you now. There’s a house I been watching, the boarded one. You gotta know what you’re doing for this: combat certified, some home-invasion work under your belt, a Law-19 on you, and your prep together.”"
      : "“There’s a courier carrying a street payment through the Rio courtyard. Strong-arm, quick. Gloves and a mask, no strap needed. Somebody could get hurt or locked up, so it’s your call.”",
    [source, s.playerId],
    undefined,
    { title: "A job offer", importance: "personal" },
  );
  return s;
}
export function purchasePrepError(
  s: GameState,
  item: PrepId,
  location: string,
  quantity = 1,
) {
  const d = PREPARATION[item];
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)
    return "Pick between 1 and 5.";
  if (!d || d.location !== location || presenceOf(s).location !== location)
    return "Go to the shop that sells it.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Finish this conversation first.";
  if (
    (s.activeSession && s.activeSession.status !== "ended") ||
    (s.activeRobbery && s.activeRobbery.status !== "ended")
  )
    return "Finish what you’re doing first.";
  if (s.ap < 1) return "You need 1 AP.";
  if (cash(player(s)) < d.price * quantity) return `You need $${d.price * quantity}.`;
  return gainError(s, s.playerId, gain(item, quantity));
}
export function purchasePrep(
  state: GameState,
  item: PrepId,
  location: string,
  quantity = 1,
) {
  if (purchasePrepError(state, item, location, quantity)) return state;
  const s = structuredClone(state),
    r = (s.robberies ??= newRobberyState()),
    d = PREPARATION[item];
  s.ap--;
  expense(s, player(s), d.price * quantity, `City supplies · ${d.name}`);
  r.items[item] += quantity;
  receivePhysical(s, s.playerId, gain(item, quantity));
  const e = record(
    s,
    "money",
    `Bought ${d.name} ×${quantity} for $${d.price * quantity} at ${locationById(location)?.name}. It gets used up on a job, whether it goes right or not.`,
    [s.playerId],
  );
  r.purchases.push({
    id: e.id,
    item,
    day: s.day,
    location,
    cost: d.price * quantity,
    quantity,
  });
  s.streetLife?.exchanges.push({
    id: e.id,
    item: d.name,
    quantity,
    paid: d.price * quantity,
    received: 0,
  });
  return s;
}
export function robberyStartError(s: GameState, jobId: string) {
  const intro = lessonError(s);
  if (intro) return intro;
  const j = s.robberies?.jobs.find((j) => j.id === jobId);
  if (!j || j.status !== "offered" || j.expiresDay < s.day)
    return "That job isn’t on the table anymore.";
  const d = ROBBERY_TYPES[j.kind];
  if (j.kind === "bank" || (j.kind === "store" && !j.targetId))
    return "You haven’t heard of anything like that yet.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s)
  )
    return "Finish this and get somewhere safe first.";
  if (
    (s.activeRobbery && s.activeRobbery.status !== "ended") ||
    (s.activeSession && s.activeSession.status !== "ended")
  )
    return "Finish what you’re doing first.";
  if (presenceOf(s).location !== j.location)
    return "Go to the spot first.";
  if (s.ap < 1) return "You need 1 AP.";
  if (
    skillRank(player(s), "combat") < d.combat ||
    skillRank(player(s), "robbery") < d.robbery
  )
    return "You don’t have the experience for a job like this yet.";
  const carriedWeapon = equipmentOf(player(s)).equipped;
  if (
    d.weapon &&
    (!carriedWeapon ||
      (!j.targetId && carriedWeapon !== d.weapon) ||
      equipError(player(s), carriedWeapon))
  )
    return `You need a ${d.weapon} on you. Someone you trust can get you one once you’re certified.`;
  if (j.targetId) {
    const error = careerStartError(s, jobId);
    if (error) return error;
  }
  const missing = (
    j.targetId
      ? d.prep
      : j.kind === "home"
        ? [...d.prep, "pattern-token"]
        : d.prep
  ).filter((id) => !inventoryOf(s).slots.some((x) => x.itemId === id));
  if (missing.length)
    return `You still need: ${missing.map((id) => PREPARATION[id as PrepId].name).join(", ")}.`;
  return null;
}
export function startRobbery(state: GameState, jobId: string) {
  const error = robberyStartError(state, jobId);
  if (error) return { state, error };
  const s = structuredClone(state),
    j = s.robberies!.jobs.find((j) => j.id === jobId)!;
  s.ap--;
  j.status = "active";
  for (const item of j.targetId
    ? ROBBERY_TYPES[j.kind].prep
    : j.kind === "home"
      ? [...ROBBERY_TYPES.home.prep, "pattern-token"]
      : ROBBERY_TYPES[j.kind].prep) {
    s.robberies!.items[item as PrepId]--;
    const slot = inventoryOf(s).slots.find((x) => x.itemId === item)!;
    removePhysical(inventoryOf(s), slot.id, 1);
    syncCarried(player(s));
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
        ? "Someone’s crossing the yard. Decide how you play it. You can still back out, but what you spent is gone."
        : "The courier’s coming. Decide how you play it. You can still back out, but what you spent is gone.",
    loot: 0,
    score: 0,
  };
  if (j.targetId) initializeCareer(s, jobId);
  record(
    s,
    "risk",
    `You started the ${ROBBERY_TYPES[j.kind].name.toLowerCase()} at ${locationById(j.location)?.name}.`,
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
  if (state.activeRobbery?.career)
    return careerInput(state, id, cursor, answer);
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
      "A witness turns your way. Keep your head: repeat the three symbols in order to get out clean.";
  }
  if (cursor === 1) {
    a.score += answer === a.pattern.join(",") ? 2 : -2;
    a.text =
      answer === a.pattern.join(",")
        ? "You kept your head and found a way out. Leave now, or push for the whole payment?"
        : "You lost your nerve, and the witness is shouting. Leave now, or risk pushing on?";
  }
  if (answer === "withdraw") {
    a.status = "ended";
    a.text = "You backed out before anything happened.";
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
      0.44 +
        a.score * 0.11 +
        equipmentBonus(player(s)).attack / 100 +
        (answer === "leave" ? 0.08 : -0.08),
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
    `${d.name}: ${success ? (partial ? "you left early with part of it" : "you got the payment") : "it went wrong and you got nothing"}${loot ? `, $${loot} in dirty cash` : ""}. People saw you.`,
    [s.playerId, j.source],
    undefined,
    { importance: "major", title: "How the job went" },
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
  awardRobbery(
    s,
    s.playerId,
    a.id,
    j.kind === "liquor" ? "home" : j.kind,
    success,
  );
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
      ? "Pulled off the job I put them on."
      : "Messed up the job I put them on.",
    12,
  );
  remember(
    s,
    witness,
    s.playerId,
    e.id,
    `Saw a ${d.name.toLowerCase()} go down and told the police.`,
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
      : "");
  if (!success && risk < d.risk) {
    arrest(s, s.playerId, "witness report after robbery", 1);
    a.text += " The police showed up.";
  } else if (!success && risk < d.risk + 0.18) {
    hospitalize(s, "assault", e.id);
    a.text += " You got hurt.";
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
  if (s.activeRobbery!.career) return settleCareer(s, false, true);
  s.activeRobbery!.status = "ended";
  s.activeRobbery!.text =
    "You called it off. Nothing gained, and what you spent is gone.";
  const j = s.robberies?.jobs.find((j) => j.id === s.activeRobbery!.jobId);
  if (j) j.status = "failed";
  return s;
}
export function equipmentContactError(s: GameState, id: string) {
  if (robberySourceError(s, id)) return robberySourceError(s, id);
  if (skillRank(player(s), "combat") < 2)
    return "You need Combat certification first.";
  if (equipmentOf(player(s)).owned.includes("law-19"))
    return "You already own a Law-19.";
  if (cash(player(s)) < 75 || s.ap < 1) return "You need $75 and 1 AP.";
  return gainError(s, s.playerId, gain("law-19"));
}
export function obtainContactEquipment(state: GameState, id: string) {
  if (equipmentContactError(state, id)) return state;
  const s = structuredClone(state);
  s.ap--;
  expense(s, player(s), 75, "Law-19");
  const e = record(
    s,
    "money",
    `${s.characters[id].name} got you a Law-19 for $75. Equip it from your Wallet. Carrying it won’t make you any better with it.`,
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
        p.cost !== PREPARATION[p.item].price * (p.quantity ?? 1) ||
        p.day > s.day ||
        !s.events.some((e) => e.id === p.id),
    ) ||
    new Set(r.purchases.map((p) => p.id)).size !== r.purchases.length ||
    new Set(r.history.map((h) => h.id)).size !== r.history.length ||
    (Object.keys(PREPARATION) as PrepId[]).some(
      (item) =>
        r.items[item] !==
        r.purchases
          .filter((p) => p.item === item)
          .reduce((n, p) => n + (p.quantity ?? 1), 0) +
          (s.inventory?.history
            .filter(
              (h) =>
                h.itemId === item &&
                h.to === s.playerId &&
                h.from !== s.playerId &&
                !h.from.startsWith("overflow:") &&
                !!s.characters[h.from],
            )
            .reduce((n, h) => n + h.quantity, 0) ?? 0) -
          (s.inventory?.history
            .filter(
              (h) =>
                h.itemId === item &&
                h.from === s.playerId &&
                (h.to === "lost" || !!s.characters[h.to]) &&
                h.to !== s.playerId,
            )
            .reduce((n, h) => n + h.quantity, 0) ?? 0) -
          r.jobs.filter(
            (j) =>
              ["active", "success", "partial", "failed"].includes(j.status) &&
              (j.targetId
                ? ROBBERY_TYPES[j.kind].prep
                : j.kind === "home"
                  ? [...ROBBERY_TYPES.home.prep, "pattern-token"]
                  : ROBBERY_TYPES[j.kind].prep
              ).includes(item),
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
        (!locationById(j.location) && !targetForJob(s, j.id)) ||
        j.createdDay > s.day ||
        j.expiresDay !== j.createdDay + 6 ||
        (j.targetId
          ? targetForJob(s, j.id)?.location !== j.location
          : j.location !==
            (j.kind === "home" ? "reservoir.boarded-house" : "rio.courtyard")),
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
      (!a.career &&
        a.cursor === 3 &&
        !r.history.some((h) => h.id === a.id && h.loot === a.loot))
    )
      throw new Error("Invalid robbery session references.");
  }
}
