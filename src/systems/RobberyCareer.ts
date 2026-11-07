import { blockQuannyBusiness } from "./Quanny";
import { currentEncounter } from "./EncounterLifecycle";
import { player, cash, clamp, type GameState } from "../core/GameState";
import {
  ROBBERY_BALANCE as B,
  robberyTarget,
  ROBBERY_TARGETS,
  PAWN_LOCATION,
  type RobberyTarget,
} from "../content/robberyCareer";
import { ITEM_DEFINITIONS as D } from "../content/inventory";
import { newRobberyCareer, type CareerSession } from "./RobberyCareerState";
import { newRobberyState, robberySourceError, ROBBERY_TYPES } from "./Robbery";
import { presenceOf } from "../board/presence";
import { boardPeople } from "../board/people";
import {
  inventoryOf,
  gain,
  gainError,
  receivePhysical,
  removePhysical,
  syncCarried,
  physicalActionError,
  logInventory,
} from "./Inventory";
import { loseCarried, heistReadiness } from "./InventoryExchanges";
import { skillsOf, skillRank, awardRobbery, awardCombat } from "./Skills";
import { equipmentBonus, equipError } from "./Equipment";
import { availability, cooperation } from "./CrewAgency";
import { atPerson } from "./StreetLife";
import { lessonError, pabloError, personalBeef, TRIO } from "./StreetAccess";
import { record } from "../core/EventLog";
import { random } from "../core/Random";
import { earn, expense } from "./Economy";
import {
  addGrievance,
  hospitalize,
  hospitalStay,
  streetConversation,
} from "./Danger";
import { remember, change } from "./Relationships";
import { addExposure } from "./CriminalExposure";
import { arrest } from "./Incarceration";
const ledger = (s: GameState) => (s.robberyCareer ??= newRobberyCareer());
export function targetForJob(
  s: GameState,
  jobId: string,
): RobberyTarget | undefined {
  const j = s.robberies?.jobs.find((j) => j.id === jobId);
  if (!j?.targetId) return;
  if (j.victim) {
    const c = s.characters[j.victim];
    if (!c) return;
    return {
      id: j.targetId,
      kind: "strong-arm",
      zone: c.home,
      location: j.location,
      name: `${c.name} · high-risk`,
      circumstance:
        "They know your face. Theft can close business and start personal retaliation.",
      risk: B.criminalRisk,
      pool: [],
      lead: false,
    };
  }
  const target = robberyTarget(j.targetId);
  // Explicit stable GOAL011 anchor alias; existing lead/session IDs are never renamed.
  if (
    target?.id === "home.reservoir.1" &&
    j.location === "reservoir.boarded-house"
  )
    return { ...target, location: j.location };
  return target;
}
export function cooldownFor(s: GameState, t: RobberyTarget, victim?: string) {
  return s.robberyCareer?.cooldowns[
    t.kind === "home"
      ? `home:${t.zone}`
      : victim
        ? `victim:${victim}`
        : `place:${t.location}`
  ];
}
export function criminalTargetError(s: GameState, id: string) {
  const c = s.characters[id];
  return !c ||
    id === s.playerId ||
    !player(s).known.includes(id) ||
    (!c.affiliation &&
      id !== "quanny" &&
      !s.street.lots.some((l) => l.owner === id && l.remaining > 0)) ||
    c.traits.lawful >= 65
    ? "No recognized criminal opportunity."
    : (pabloError(s, id) ??
        (id === "quanny" && s.quanny.business !== "open"
          ? "Quanny’s authored business conditions still apply."
          : null) ??
        (!atPerson(s, id) || c.status !== "active"
          ? "Meet the target physically in the City."
          : null));
}
export function opportunityError(
  s: GameState,
  targetId: string,
  victim?: string,
) {
  if (victim && targetId !== `criminal.${victim}`)
    return "Unknown named opportunity ID.";
  const t = victim
    ? {
        id: targetId,
        kind: "strong-arm" as const,
        zone: s.characters[victim]?.home,
        location: presenceOf(s).location,
        lead: false,
      }
    : robberyTarget(targetId);
  if (!t) return "Unknown target.";
  const base = physicalActionError(s) ?? lessonError(s);
  if (base) return base;
  if (victim) {
    const e = criminalTargetError(s, victim);
    if (e) return e;
  }
  const legacyHomeHere =
    targetId === "home.reservoir.1" &&
    presenceOf(s).location === "reservoir.boarded-house" &&
    s.robberies?.jobs.some(
      (j) =>
        j.targetId === targetId &&
        j.location === "reservoir.boarded-house" &&
        j.status === "offered" &&
        j.expiresDay >= s.day,
    );
  if (presenceOf(s).location !== t.location && !legacyHomeHere)
    return "Visit the target’s actual City location.";
  const cd = cooldownFor(s, t as RobberyTarget, victim);
  if (cd && s.day < cd.nextDay)
    return `Neighborhood/target cooldown: day ${cd.nextDay}; started day ${cd.day} by ${cd.jobId}.`;
  if (
    t.lead &&
    !s.robberies?.jobs.some(
      (j) =>
        j.targetId === targetId &&
        j.status === "offered" &&
        j.expiresDay >= s.day,
    )
  )
    return "Earn a house/commercial lead from a trusted robbery contact.";
  return null;
}
export function offerTarget(
  s: GameState,
  targetId: string,
  victim?: string,
): GameState | string {
  const error = opportunityError(s, targetId, victim);
  if (error) return error;
  const old = s.robberies?.jobs.find(
    (j) =>
      j.targetId === targetId &&
      j.victim === victim &&
      j.status === "offered" &&
      j.expiresDay >= s.day,
  );
  if (old) return s;
  const n = structuredClone(s),
    r = (n.robberies ??= newRobberyState()),
    t = robberyTarget(targetId);
  r.jobs.push({
    id: `lick-${n.nextId++}`,
    targetId,
    victim,
    kind: t?.kind ?? "strong-arm",
    source: victim ?? n.playerId,
    location: t?.location ?? presenceOf(n).location,
    createdDay: n.day,
    expiresDay: n.day + 6,
    status: "offered",
  });
  return n;
}
/** Earned in-person introductions; all leads are real records, cooldown checked before AP. */
export function offerCareerLead(
  s: GameState,
  source: string,
  targetId: string,
): GameState | string {
  const t = robberyTarget(targetId);
  const error = robberySourceError(s, source);
  if (error) return error;
  if (!t?.lead) return "This is a local opportunity, not a contact lead.";
  const p = skillsOf(player(s));
  if ((p.milestones.robberySuccess ?? 0) < (t.kind === "store" ? 9 : 3))
    return "Complete more genuine robberies before this introduction.";
  const cd = cooldownFor(s, t);
  if (cd && cd.nextDay > s.day)
    return `Next home opportunity day ${cd.nextDay} (${cd.jobId}).`;
  const n = structuredClone(s);
  skillsOf(player(n)).milestones[
    t.kind === "store" ? "robberyAccess3" : "robberyAccess2"
  ] = 1;
  n.robberies ??= newRobberyState();
  if (
    n.robberies.jobs.some(
      (j) =>
        j.targetId === targetId &&
        j.status === "offered" &&
        j.expiresDay >= n.day,
    )
  )
    return s;
  n.robberies.jobs.push({
    id: `lick-${n.nextId++}`,
    targetId,
    kind: t.kind,
    source,
    location: t.location,
    createdDay: n.day,
    expiresDay: n.day + 6,
    status: "offered",
  });
  record(
    n,
    "social",
    `${n.characters[source].name} shared ${t.name}. ${t.circumstance} A willing equipped partner takes 25% cash and a disclosed goods buyout.`,
    [n.playerId, source],
  );
  return n;
}
export function partnerError(
  s: GameState,
  member: string,
  jobId: string,
  inviting = false,
): string | null {
  const t = targetForJob(s, jobId),
    c = s.characters[member];
  if (!t || !["home", "store"].includes(t.kind))
    return "This job does not need a crew.";
  if (
    !c ||
    member === s.playerId ||
    (!s.crew.members.includes(member) &&
      !["mega", "quanny", ...TRIO].includes(member))
  )
    return "Recruit a Set member or earn a criminal contact’s cooperation.";
  if (personalBeef(s, member) || (c.relationships[s.playerId]?.trust ?? 0) < 45)
    return "Requires 45 earned trust and no personal beef.";
  if (member === "quanny" && s.quanny.business !== "open")
    return "Quanny’s business must be open.";
  const busy = availability(s, c);
  if (busy) return busy;
  if (!cooperation(s, c, "partner-crime", 0).accepted)
    return "Partner refuses this risk with you.";
  // Contacts use the same physical equipment/rank checks as Set members.
  const ready = heistReadiness(
    {
      ...s,
      crew: { ...s.crew, members: [...new Set([...s.crew.members, member])] },
    },
    member,
    {
      combatRank: t.kind === "store" ? 3 : 2,
      equipped: c.equipment?.equipped ?? "law-19",
      items: { gloves: 1, mask: 1 },
    },
  );
  if (ready) return ready;
  if (inviting && !atPerson(s, member))
    return "Invite them in person with their own carried equipment.";
  return null;
}
export function inviteRobbery(
  s: GameState,
  member: string,
  jobId: string,
): GameState | string {
  const j = s.robberies?.jobs.find((j) => j.id === jobId);
  const error =
    physicalActionError(s) ??
    (j?.status !== "offered" || j.expiresDay < s.day
      ? "Lead expired or unavailable."
      : null) ??
    partnerError(s, member, jobId, true);
  if (error) return error;
  if (
    s.robberyCareer?.invitations.some(
      (i) => i.jobId === jobId && i.status === "accepted",
    )
  )
    return "One partner already accepted; 25% total share.";
  const n = structuredClone(s);
  ledger(n).invitations.push({
    jobId,
    member,
    day: n.day,
    meetingLocation: presenceOf(n).location,
    share: B.crewShare,
    status: "accepted",
  });
  record(
    n,
    "crew",
    `${n.characters[member].name} accepted ${jobId}: travel together from this meeting; 25% cash, plus 25% of the base pawn quote of carried goods due within five days.`,
    [n.playerId, member],
  );
  return n;
}
export function careerStartError(s: GameState, jobId: string) {
  const t = targetForJob(s, jobId),
    j = s.robberies?.jobs.find((j) => j.id === jobId);
  if (!t || !j) return "Unknown career target.";
  const error = opportunityError(s, t.id, j.victim);
  if (error) return error;
  if (j.victim && j.location !== presenceOf(s).location)
    return "Target moved; meet them at the recorded place.";
  const cd = cooldownFor(s, t, j.victim);
  if (cd && s.day < cd.nextDay) return `Next attempt day ${cd.nextDay}.`;
  if (["home", "store"].includes(t.kind)) {
    const i = s.robberyCareer?.invitations.find(
      (i) => i.jobId === jobId && i.status === "accepted",
    );
    if (!i)
      return "Requires an accepted in-person invitation from a willing equipped partner (25% share).";
    const e = partnerError(s, i.member, jobId);
    if (e) return e;
    // Accepted partner travels with player from their physical invitation. No inventory teleport.
    const met = s.presence?.trail.some(
      (p) =>
        p.day >= i.day &&
        p.location ===
          (i.meetingLocation ??
            boardPeople(s).find((p) => p.id === i.member)?.placeId),
    );
    if (!atPerson(s, i.member) && !met)
      return "Meet your accepted partner before travelling to the target.";
  }
  return null;
}
const band = (s: GameState, b: readonly number[]) =>
  Math.floor(b[0] + random(s) * (b[1] - b[0] + 1));
export function initializeCareer(s: GameState, jobId: string) {
  const t = targetForJob(s, jobId)!,
    j = s.robberies!.jobs.find((j) => j.id === jobId)!,
    a = s.activeRobbery!,
    r = ledger(s);
  const participants: CareerSession["participants"] = [];
  for (const i of r.invitations.filter(
    (i) => i.jobId === jobId && i.status === "accepted",
  )) {
    participants.push({
      id: i.member,
      share: i.share,
      attack: equipmentBonus(s.characters[i.member]).attack,
      combat: skillRank(s.characters[i.member], "combat"),
    });
    i.status = "participated";
    s.characters[i.member].agency.lastAssignmentDay = s.day;
    for (const item of ["gloves", "mask"]) {
      const x = inventoryOf(s, i.member).slots.find((x) => x.itemId === item)!;
      removePhysical(inventoryOf(s, i.member), x.id, 1);
      logInventory(
        s,
        "crew preparation consumed",
        i.member,
        "used",
        gain(item as "mask"),
      );
    }
    syncCarried(s.characters[i.member]);
  }
  const c: CareerSession = {
    targetId: t.id,
    victim: j.victim,
    kind: t.kind,
    pressure: 0,
    revealed: 0,
    cash: band(
      s,
      t.kind === "strong-arm"
        ? j.victim
          ? B.criminalCash
          : B.civilianCash
        : t.kind === "home"
          ? B.homeCash
          : t.kind === "liquor"
            ? B.liquorCash
            : B.commercialCash,
    ),
    roll: random(s),
    riskRoll: random(s),
    participants,
    goods: [],
    dial: {
      target: band(s, [0, 100]),
      tries: 0,
      open: false,
      feedback:
        "Optional fictional dial; three untimed tries. Ordinary loot needs no lock.",
    },
  };
  const add = (
    itemId: keyof typeof D,
    beat: number,
    locked = false,
    quantity = 1,
    sourceSlot?: string,
  ) => {
    const retail = B.retail[itemId as keyof typeof B.retail];
    c.goods.push({
      id: `loot-${s.nextId++}`,
      itemId,
      quantity,
      value: retail ? band(s, retail) : quantity * B.stolenUnitValue,
      beat,
      locked,
      sourceSlot,
    });
  };
  if (j.victim) {
    const owner = s.characters[j.victim];
    c.cash = Math.min(c.cash, cash(owner));
    const stock = inventoryOf(s, owner.id).slots.find(
      (x) => x.itemId === "nightgoods",
    );
    const pool = (r.sources[owner.id] ??= {
      stock: stock ? 0 : B.sourceStock,
      jewelry: B.sourceJewelry,
    });
    if (stock)
      add("nightgoods", 1, false, Math.min(3, stock.quantity), stock.id);
    else if (pool.stock) add("nightgoods", 1, false, Math.min(3, pool.stock));
    if (pool.jewelry) add("high-chain", 1);
  } else if (t.kind === "strong-arm") {
    const roll = random(s);
    if (roll < B.ordinaryBonusChance)
      add(t.pool[roll < B.pettyChainChance ? 3 : Math.floor(random(s) * 3)], 1);
  } else if (t.kind === "liquor") {
    if (random(s) < B.liquorGoodsChance)
      add(
        t.pool[Math.floor(random(s) * 2)],
        1,
        false,
        1 + Math.floor(random(s) * 2),
      );
  } else {
    add(t.pool[0], 1);
    add(t.pool[1], 2);
    if (random(s) < B.rareBonusChance) add(t.pool[2], 3, t.kind === "home");
  }
  if (t.kind === "strong-arm" && !j.victim)
    c.visitor = `visitor:${t.zone}:${s.day}`;
  a.career = c;
  a.text = `${t.name}: ${t.circumstance} ${j.victim ? "Personal retaliation likely. " : ""}Choose your approach or leave.`;
  const key =
    t.kind === "home"
      ? `home:${t.zone}`
      : j.victim
        ? `victim:${j.victim}`
        : `place:${t.location}`;
  r.cooldowns[key] = {
    day: s.day,
    nextDay:
      s.day +
      (t.kind === "home"
        ? B.homeCooldown
        : j.victim
          ? B.criminalCooldown
          : B.localCooldown),
    jobId,
  };
  addExposure(
    s,
    s.playerId,
    t.zone,
    B.attemptHeat + (t.zone === "downtown" ? 6 : 0),
    true,
  );
  s.strategic.lastCrimeDay = s.day;
  if (c.visitor) {
    const e = record(
      s,
      "risk",
      `${c.visitor}: a distinct street visitor remembers the attempted robbery.`,
      [s.playerId],
    );
    r.visitors[c.visitor] = { lastDay: s.day, eventId: e.id, targetId: t.id };
  }
  if (j.victim) {
    const e = record(
      s,
      "risk",
      `${s.characters[j.victim].name} recognized the attempted strong-arm. Supply and introductions may close.`,
      [s.playerId, j.victim],
    );
    addGrievance(
      s,
      j.victim,
      s.playerId,
      "Recognized robbery attempt",
      e.id,
      40,
    );
    if (j.victim === "quanny") {
      blockQuannyBusiness(s);
      s.quanny.history.push(e.id);
    }
  }
}
export function careerChance(s: GameState) {
  const a = s.activeRobbery!,
    c = a.career!,
    t = targetForJob(s, a.jobId)!;
  return clamp(
    B.baseChance +
      a.score * B.approachScore +
      equipmentBonus(player(s)).attack * B.playerEquipmentScale +
      c.participants.reduce(
        (n, p) =>
          n + p.combat * B.crewCombatBonus + p.attack * B.crewEquipmentScale,
        0,
      ) -
      c.pressure * B.pressurePenalty -
      t.risk,
    B.minimumChance,
    B.maximumChance,
  );
}
function activeError(s: GameState, id: string, cursor: number) {
  const a = s.activeRobbery;
  if (!a?.career || a.id !== id || a.status !== "active" || a.cursor !== cursor)
    return "Stale or paused session.";
  if (
    s.end ||
    player(s).status !== "active" ||
    hospitalStay(s) ||
    streetConversation(s) ||
    currentEncounter(s) ||
    s.day !== a.day ||
    presenceOf(s).location !== a.location ||
    a.career.participants.some((p) => s.characters[p.id].status !== "active")
  )
    return "Session interrupted; leave to resolve.";
  return null;
}
export function careerInput(
  state: GameState,
  id: string,
  cursor: number,
  answer: string,
): GameState {
  if (activeError(state, id, cursor)) return state;
  const a0 = state.activeRobbery!,
    c0 = a0.career!;
  const allowed =
    cursor === 0
      ? ["patient", "rush", "withdraw"]
      : c0.kind === "home"
        ? ["search", "leave"]
        : c0.kind === "store" && cursor === 1
          ? ["coordinate", "rush", "leave"]
          : ["deescalate", "press", "leave"];
  if (!allowed.includes(answer)) return state;
  const s = structuredClone(state),
    a = s.activeRobbery!,
    c = a.career!;
  a.cursor++;
  if (answer === "withdraw") return settleCareer(s, false, true);
  if (cursor === 0) {
    a.score = answer === "patient" ? 1 : -1;
    c.revealed = c.kind === "store" ? 0 : 1;
    c.pressure = answer === "rush" ? 1 : 0;
    a.text =
      c.kind === "home"
        ? "First room revealed. Take only what fits; each search adds pressure. Leave with your current take."
        : c.kind === "store"
          ? "Partner is ready. Coordinate collection or abandon the collection."
          : "The target hesitates; a witness watches. De-escalate, press for cash, or leave.";
    return s;
  }
  if (answer === "search") {
    if (c.revealed >= 3) return state;
    c.revealed++;
    c.pressure++;
    addExposure(
      s,
      s.playerId,
      targetForJob(s, a.jobId)!.zone,
      B.searchHeat,
      true,
    );
    a.text = `Search ${c.revealed}/3: pressure ${c.pressure}. Leaving now keeps your selected goods if the exit succeeds.`;
    return s;
  }
  if (c.kind === "store" && cursor === 1 && answer === "leave")
    return settleCareer(s, false, true);
  if (
    c.kind === "store" &&
    cursor === 1 &&
    ["coordinate", "rush"].includes(answer)
  ) {
    a.score += answer === "coordinate" ? 1 : -1;
    if (answer === "rush") c.pressure++;
    c.revealed = 3;
    a.text =
      "The partner completed collection. Press to commit or leave with a smaller cash take.";
    return s;
  }
  if (answer === "press") c.pressure++;
  return settleCareer(s, c.kind === "home" || answer !== "leave");
}
export function takeLoot(
  s: GameState,
  id: string,
  cursor: number,
  lootId: string,
  actor = s.playerId,
): GameState | string {
  const error = activeError(s, id, cursor);
  if (error) return error;
  const c = s.activeRobbery!.career!,
    x = c.goods.find((x) => x.id === lootId);
  if (!x || x.takenBy || x.beat > c.revealed || (x.locked && !c.dial.open))
    return "Loot is hidden, locked or already taken.";
  if (actor !== s.playerId && !s.crew.members.includes(actor))
    return "Only Set members may carry player loot; contacts carry their own gear.";
  if (actor !== s.playerId && !c.participants.some((p) => p.id === actor))
    return "Only participating carriers may take loot.";
  const item = gain(
    x.itemId,
    x.quantity,
    `stolen:${x.id}`,
    x.itemId === "nightgoods" ? `stolen-lot:${x.id}` : undefined,
  );
  const fit = gainError(s, actor, item);
  if (fit) return fit;
  const n = structuredClone(s),
    a = n.activeRobbery!,
    g = a.career!.goods.find((g) => g.id === lootId)!,
    r = ledger(n);
  if (g.itemId === "nightgoods") {
    const victim = a.career!.victim!;
    if (g.sourceSlot) {
      const slot = inventoryOf(n, victim).slots.find(
        (x) => x.id === g.sourceSlot,
      );
      if (!slot || slot.quantity < g.quantity)
        return "Source stock no longer available.";
      loseCarried(n, victim, slot.id, g.quantity, "stolen in strong-arm");
    } else {
      if (r.sources[victim].stock < g.quantity) return "Source depleted.";
      r.sources[victim].stock -= g.quantity;
    }
    n.street.lots.push({
      id: item.lotId!,
      category: "nightgoods",
      owner: actor,
      supplier: victim,
      zone: targetForJob(n, a.jobId)!.zone,
      received: g.quantity,
      remaining: g.quantity,
      lost: 0,
      cost: 0,
      paid: 0,
      owed: 0,
      expectedGross: g.quantity * B.stolenUnitValue,
      collected: 0,
      losses: 0,
      crewPaid: 0,
      dueDay: n.day + 6,
      acquiredDay: n.day,
      arrangement: "cash",
      status: "held",
    });
  } else if (a.career!.victim && g.itemId === "high-chain") {
    const pool = r.sources[a.career!.victim];
    if (!pool.jewelry) return "Source depleted.";
    pool.jewelry--;
  }
  receivePhysical(n, actor, item);
  g.takenBy = actor;
  const e = record(
    n,
    "risk",
    `${n.characters[actor].name} carried ${D[g.itemId].name} ×${g.quantity}; physical property, not cash.`,
    [n.playerId, actor],
  );
  r.property[g.id] = {
    itemId: g.itemId,
    quantity: g.quantity,
    owner: a.career!.victim ?? a.career!.targetId,
    eventId: e.id,
    value: g.value,
    jobId: a.jobId,
  };
  logInventory(n, "robbery loot", a.career!.victim ?? "scene", actor, item);
  a.cursor++;
  return n;
}
export function tryDial(
  s: GameState,
  id: string,
  cursor: number,
  position: number,
): GameState | string {
  const error = activeError(s, id, cursor);
  if (error) return error;
  const c = s.activeRobbery!.career!;
  if (
    c.kind !== "home" ||
    !c.goods.some((x) => x.locked && x.beat <= c.revealed) ||
    c.dial.tries >= 3 ||
    c.dial.open
  )
    return "No optional lock available.";
  if (!Number.isInteger(position) || position < 0 || position > 100)
    return "Choose 0–100.";
  const n = structuredClone(s),
    a = n.activeRobbery!,
    d = a.career!.dial,
    delta = Math.abs(position - d.target),
    distance = Math.min(delta, 101 - delta);
  d.tries++;
  d.open = distance <= 10;
  d.feedback = d.open ? "Opened" : distance <= 25 ? "Near" : "Far";
  a.career!.pressure++;
  a.cursor++;
  return n;
}
/** Settlement mutates only its cloned input; historical cursor and outcome block replay. */
export function settleCareer(
  s: GameState,
  full = false,
  abandon = false,
): GameState {
  const a = s.activeRobbery!,
    c = a.career!,
    j = s.robberies!.jobs.find((j) => j.id === a.jobId)!,
    r = ledger(s),
    t = targetForJob(s, j.id)!;
  if (a.status === "ended") return s;
  const success = !abandon && c.roll < careerChance(s),
    goods = c.goods.filter((g) => g.takenBy);
  let amount = success
    ? Math.floor(
        c.cash * (full ? 1 : c.kind === "strong-arm" ? 0 : B.partialCash),
      )
    : 0;
  if (c.victim) {
    amount = Math.min(amount, cash(s.characters[c.victim]));
    if (amount)
      expense(s, s.characters[c.victim], amount, "Robbery victim cash taken");
  }
  const outcome = success ? (full ? "success" : "partial") : "failed";
  a.status = "ended";
  a.loot = amount;
  j.status = outcome;
  const e = record(
    s,
    "risk",
    `${t.name}: ${outcome}. $${amount} illicit cash, ${success ? goods.length : 0} selected physical finds.`,
    [
      s.playerId,
      ...c.participants.map((p) => p.id),
      ...(c.victim ? [c.victim] : []),
    ],
  );
  s.robberies!.history.push({
    id: a.id,
    jobId: j.id,
    day: s.day,
    outcome,
    loot: amount,
    eventId: e.id,
  });
  if (amount) {
    earn(s, player(s), amount, "illicit", "Robbery proceeds");
    s.streetLife?.exchanges.push({
      id: e.id,
      quantity: 0,
      paid: 0,
      received: amount,
      provenance: "illicit",
    });
  }
  for (const p of c.participants) {
    const cut = Math.floor(amount * p.share);
    if (cut) {
      // Split the newly earned illicit take, not unrelated clean savings.
      player(s).wallet.illicit -= cut;
      s.ledger.push({
        day: s.day,
        amount: -cut,
        provenance: "illicit",
        reason: "Robbery crew cash share",
      });
      s.characters[p.id].wallet.illicit += cut;
      s.streetLife?.exchanges.push({
        id: `cut-${s.nextId++}`,
        quantity: 0,
        paid: cut,
        received: 0,
      });
    }
    const buyout = success
      ? Math.floor(
          goods.reduce((n, g) => n + g.value * B.pawnRatio, 0) * p.share,
        )
      : 0;
    if (buyout)
      r.claims.push({
        id: `claim-${s.nextId++}`,
        jobId: j.id,
        member: p.id,
        amount: buyout,
        paid: 0,
        dueDay: s.day + B.crewClaimDays,
        warned: false,
      });
    awardCombat(s, p.id, a.id, success ? "success" : "failed");
  }
  if (!success)
    for (const g of goods) {
      const inv = inventoryOf(s, g.takenBy!),
        slots = inv.slots.filter((x) => x.provenance === `stolen:${g.id}`);
      for (const x of slots)
        loseCarried(
          s,
          g.takenBy!,
          x.id,
          x.quantity,
          "loot lost leaving robbery",
        );
    }
  if (!abandon) {
    skillsOf(player(s)).milestones.certified = 1;
    awardCombat(
      s,
      s.playerId,
      a.id,
      success && (amount > 0 || goods.length > 0) ? "success" : "failed",
    );
    awardRobbery(
      s,
      s.playerId,
      a.id,
      c.kind === "liquor" ? "home" : c.kind,
      success && (amount > 0 || goods.length > 0),
    );
  }
  const prior = s.robberies!.history.filter(
    (h) => targetForJob(s, h.jobId)?.zone === t.zone && h.day >= s.day - 5,
  ).length;
  addExposure(
    s,
    s.playerId,
    t.zone,
    B.completionHeat + prior * B.repeatHeat,
    true,
  );
  player(s).notoriety = clamp(player(s).notoriety + (success ? 4 : 2));
  player(s).neighborhoodStanding[t.zone] = clamp(
    player(s).neighborhoodStanding[t.zone] - 3,
    -100,
    100,
  );
  const witnesses = boardPeople(s).filter(
    (p) =>
      p.placeId === t.location &&
      !c.participants.some((c) => c.id === p.id) &&
      p.id !== c.victim,
  );
  for (const w of witnesses) {
    remember(s, w.id, s.playerId, e.id, `Witnessed ${t.name}.`, 12);
    change(s.characters[w.id], s.playerId, { trust: -4, grievance: 6 });
  }
  const witness = witnesses.find((w) => s.characters[w.id].affiliation);
  const profit =
    amount +
    (success
      ? goods.reduce((n, g) => n + Math.floor(g.value * B.pawnRatio), 0)
      : 0);
  if (witness && profit > 0)
    r.rumors.push({
      jobId: j.id,
      eventId: e.id,
      witness: witness.id,
      zone: t.zone,
      profit,
      day: s.day,
    });
  a.text = e.text;
  if (
    !abandon &&
    !success &&
    c.riskRoll <
      B.arrestRisk + t.risk + (t.zone === "downtown" ? B.downtownRisk : 0)
  ) {
    arrest(s, s.playerId, "witnessed robbery", 1);
    for (const p of c.participants)
      if (c.riskRoll < B.arrestRisk / 2)
        arrest(s, p.id, "participating in robbery", 1);
  } else if (
    !abandon &&
    !success &&
    c.riskRoll < B.arrestRisk + t.risk + B.injuryRisk
  ) {
    hospitalize(s, "assault", e.id);
    for (const p of c.participants) {
      s.characters[p.id].status = "laying-low";
      s.characters[p.id].availableDay = Math.max(
        s.characters[p.id].availableDay,
        s.day + 2,
      );
      record(
        s,
        "risk",
        `${s.characters[p.id].name} was hurt in the failed job and is recovering until day ${s.characters[p.id].availableDay}.`,
        [s.playerId, p.id],
      );
    }
  }
  return s;
}
export function pawnQuote(s: GameState, slotId: string) {
  const x = inventoryOf(s).slots.find((x) => x.id === slotId),
    p = x && s.robberyCareer?.property[x.provenance.replace(/^stolen:/, "")];
  if (!x || !p || x.itemId === "nightgoods" || x.kind === "equipment")
    return null;
  const modifier =
    clamp((player(s).neighborhoodStanding.reservoir ?? 0) / 2000, -0.02, 0.02) -
    (player(s).police / 100) * B.pawnHeatPenalty;
  const value = Math.floor((p.value * x.quantity) / p.quantity);
  return {
    price: Math.floor(value * clamp(B.pawnRatio + modifier, 0.55, 0.7)),
    value,
    quantity: x.quantity,
    owner: p.owner,
  };
}
export function dispositionError(s: GameState, slotId: string, owner?: string) {
  const error = physicalActionError(s);
  if (error) return error;
  const q = pawnQuote(s, slotId);
  if (!q) return "No eligible physical stolen valuable.";
  if (owner) {
    if (q.owner !== owner || !s.characters[owner])
      return "Only its exact original owner can buy this property back.";
    if (!atPerson(s, owner) || s.characters[owner].status !== "active")
      return "Meet the original owner physically.";
    const x = inventoryOf(s).slots.find((x) => x.id === slotId)!;
    const fit = gainError(
      s,
      owner,
      gain(x.itemId, x.quantity, `returned:${x.provenance}`),
    );
    if (fit) return `Owner cannot receive property: ${fit}`;
    if (cash(s.characters[owner]) < Math.floor(q.value * B.sellBackRatio))
      return "Owner refuses: insufficient available funds.";
  } else if (presenceOf(s).location !== PAWN_LOCATION)
    return "Visit the Reservoir Pawn Shop with the item on you.";
  return null;
}
export function sellProperty(
  s: GameState,
  slotId: string,
  owner?: string,
): GameState | string {
  const error = dispositionError(s, slotId, owner);
  if (error) return error;
  const n = structuredClone(s),
    x = inventoryOf(n).slots.find((x) => x.id === slotId)!,
    q = pawnQuote(n, slotId)!,
    amount = owner ? Math.floor(q.value * B.sellBackRatio) : q.price;
  removePhysical(inventoryOf(n), slotId, x.quantity);
  syncCarried(player(n));
  logInventory(
    n,
    owner ? "sold back to original owner" : "pawned",
    n.playerId,
    owner ?? PAWN_LOCATION,
    x,
  );
  if (owner) {
    expense(n, n.characters[owner], amount, "Bought back stolen property");
    receivePhysical(
      n,
      owner,
      gain(x.itemId, x.quantity, `returned:${x.provenance}`),
    );
  }
  earn(
    n,
    player(n),
    amount,
    "illicit",
    owner ? "Stolen property sell-back" : "Pawn proceeds",
  );
  const e = record(
    n,
    "money",
    `${owner ? n.characters[owner].name : "Pawn Shop"} paid $${amount} for ${D[x.itemId].name}.${owner ? " Guaranteed active personal beef; +8 notoriety." : ""}`,
    [n.playerId, ...(owner ? [owner] : [])],
  );
  n.streetLife?.exchanges.push({
    id: e.id,
    quantity: 0,
    paid: 0,
    received: amount,
    provenance: "illicit",
  });
  if (owner) {
    const beef = addGrievance(
      n,
      owner,
      n.playerId,
      "Sold their stolen property back for payment",
      e.id,
      65,
    );
    beef.requiresReconciliation = true;
    beef.state = "worsening";
    beef.intent = "seek";
    player(n).notoriety = clamp(player(n).notoriety + B.sellBackNotoriety);
  }
  return n;
}
export function payCrewClaim(s: GameState, id: string): GameState | string {
  const claim = s.robberyCareer?.claims.find((c) => c.id === id);
  const error =
    physicalActionError(s) ??
    (!claim || claim.paid === claim.amount
      ? "No outstanding share."
      : !atPerson(s, claim.member)
        ? "Pay your partner in person."
        : cash(player(s)) < claim.amount - claim.paid
          ? "Insufficient cash for agreed share."
          : null);
  if (error) return error;
  const n = structuredClone(s),
    c = ledger(n).claims.find((c) => c.id === id)!,
    amount = c.amount - c.paid,
    paid = expense(n, player(n), amount, "Robbery goods buyout")!;
  n.characters[c.member].wallet.clean += paid.clean;
  n.characters[c.member].wallet.illicit += paid.illicit;
  c.paid = c.amount;
  const e = record(
    n,
    "crew",
    `Paid $${amount} agreed goods share to ${n.characters[c.member].name}.`,
    [n.playerId, c.member],
  );
  n.streetLife?.exchanges.push({
    id: e.id,
    quantity: 0,
    paid: amount,
    received: 0,
  });
  return n;
}
/** Call on day advance; only direct witnesses with known actual proceeds can demand a cut. */
export function tickRobberyCareer(s: GameState) {
  const r = s.robberyCareer;
  if (!r) return;
  for (const i of r.invitations)
    if (
      i.status === "accepted" &&
      (s.robberies?.jobs.find((j) => j.id === i.jobId)?.expiresDay ?? 0) < s.day
    )
      i.status = "expired";
  for (const c of r.claims)
    if (c.paid < c.amount && s.day > c.dueDay && !c.warned) {
      c.warned = true;
      const e = record(
        s,
        "crew",
        "The agreed robbery goods share is overdue.",
        [s.playerId, c.member],
      );
      addGrievance(s, c.member, s.playerId, "Unpaid robbery share", e.id, 25);
    }
  for (const rumor of r.rumors) {
    if (
      s.day <= rumor.day ||
      s.day > rumor.day + 5 ||
      r.extortions.some((e) => e.jobId === rumor.jobId)
    )
      continue;
    const ordinal = r.rumors.indexOf(rumor);
    if (ordinal % B.extortionFrequency !== 0) continue;
    const npc = s.characters[rumor.witness];
    if (npc?.status !== "active" || npc.home !== rumor.zone) continue;
    const amount = Math.floor(
      rumor.profit *
        (B.extortionMin +
          ((B.extortionMax - B.extortionMin) * npc.traits.ambition) / 100),
    );
    if (amount < 1) continue;
    const e = record(
      s,
      "social",
      `${npc.name} witnessed ${rumor.jobId} and requests a personal $${amount} cut. Meet them to pay or refuse; this is not a faction toll.`,
      [s.playerId, npc.id],
    );
    r.extortions.push({
      id: `demand-${s.nextId++}`,
      jobId: rumor.jobId,
      npc: npc.id,
      amount,
      status: "pending",
      eventId: e.id,
    });
  }
}
export function answerExtortion(
  s: GameState,
  id: string,
  pay: boolean,
): GameState | string {
  const demand = s.robberyCareer?.extortions.find((d) => d.id === id);
  const error =
    physicalActionError(s) ??
    (!demand || demand.status !== "pending"
      ? "No pending demand."
      : !atPerson(s, demand.npc)
        ? "Meet this person physically."
        : pay && cash(player(s)) < demand.amount
          ? "Insufficient funds."
          : null);
  if (error) return error;
  const n = structuredClone(s),
    d = ledger(n).extortions.find((d) => d.id === id)!;
  d.status = pay ? "paid" : "refused";
  if (pay) {
    const paid = expense(n, player(n), d.amount, "Personal robbery demand")!;
    n.characters[d.npc].wallet.clean += paid.clean;
    n.characters[d.npc].wallet.illicit += paid.illicit;
    change(n.characters[d.npc], n.playerId, { respect: 2 });
  }
  const e = record(
    n,
    "social",
    pay
      ? `Paid ${n.characters[d.npc].name} $${d.amount}.`
      : `Refused ${n.characters[d.npc].name}: personal grievance, not faction war.`,
    [n.playerId, d.npc],
  );
  if (pay)
    n.streetLife?.exchanges.push({
      id: e.id,
      quantity: 0,
      paid: d.amount,
      received: 0,
    });
  else
    addGrievance(
      n,
      d.npc,
      n.playerId,
      "Refused personal robbery demand",
      e.id,
      30,
    );
  return n;
}
export function confiscateCarried(
  s: GameState,
  actor: string,
  eventId: string,
) {
  const r = ledger(s);
  if (r.seizures.some((x) => x.eventId === eventId)) return;
  const illegal = inventoryOf(s, actor).slots.filter(
    (x) =>
      x.kind === "equipment" ||
      x.itemId === "nightgoods" ||
      x.provenance.startsWith("stolen:"),
  );
  r.seizures.push({
    eventId,
    actor,
    day: s.day,
    slots: illegal.map((x) => x.id),
  });
  for (const x of illegal)
    loseCarried(s, actor, x.id, x.quantity, "confiscated on arrest");
}
export function careerOpportunities(s: GameState, location: string) {
  return ROBBERY_TARGETS.filter((t) => t.location === location).map((t) => ({
    ...t,
    error: opportunityError(s, t.id),
    cooldown: cooldownFor(s, t),
  }));
}
/** Cross-record integrity beyond the structural save schema. Never manufactures past loot. */
export function validateRobberyCareer(s: GameState) {
  const r = s.robberyCareer;
  if (!r) return;
  const event = (id: string) => s.events.some((e) => e.id === id),
    job = (id: string) => s.robberies?.jobs.find((j) => j.id === id);
  const fail = () => {
    throw new Error(
      "Invalid robbery career references or physical provenance.",
    );
  };
  if (
    Object.values(r.visitors).some(
      (v) =>
        v.lastDay > s.day || !event(v.eventId) || !robberyTarget(v.targetId),
    )
  )
    fail();
  if (
    new Set(r.invitations.map((i) => `${i.jobId}:${i.member}`)).size !==
      r.invitations.length ||
    r.invitations.some(
      (i) =>
        !job(i.jobId) ||
        !s.characters[i.member] ||
        i.day > s.day ||
        i.share !== B.crewShare,
    )
  )
    fail();
  if (
    Object.values(r.cooldowns).some(
      (c) =>
        !job(c.jobId) ||
        c.day > s.day ||
        c.nextDay !==
          c.day +
            (job(c.jobId)?.kind === "home"
              ? B.homeCooldown
              : job(c.jobId)?.victim
                ? B.criminalCooldown
                : B.localCooldown),
    )
  )
    fail();
  if (
    r.claims.some(
      (c) => !job(c.jobId) || !s.characters[c.member] || c.paid > c.amount,
    ) ||
    new Set(r.claims.map((c) => c.id)).size !== r.claims.length
  )
    fail();
  if (
    r.rumors.some(
      (r) =>
        !event(r.eventId) ||
        !s.characters[r.witness] ||
        r.day > s.day ||
        !job(r.jobId),
    ) ||
    r.extortions.some(
      (d) =>
        !event(d.eventId) ||
        !s.characters[d.npc] ||
        !r.rumors.some((r) => r.jobId === d.jobId),
    )
  )
    fail();
  if (
    r.seizures.some(
      (c) => !event(c.eventId) || !s.characters[c.actor] || c.day > s.day,
    ) ||
    new Set(r.seizures.map((c) => c.eventId)).size !== r.seizures.length
  )
    fail();
  const slots = [
    ...Object.values(s.characters).flatMap((c) => c.inventory?.slots ?? []),
    ...Object.values(s.residences ?? {}).flatMap((r) => r.safe.slots),
    ...Object.values(s.inventory?.overflow ?? {}).flat(),
  ];
  for (const [id, p] of Object.entries(r.property)) {
    if (!event(p.eventId) || !job(p.jobId)) fail();
    const held = slots.filter((x) => x.provenance === `stolen:${id}`);
    if (
      held.some((x) => x.itemId !== p.itemId) ||
      held.reduce((n, x) => n + x.quantity, 0) > p.quantity
    )
      fail();
  }
  if (
    slots.some(
      (x) =>
        x.provenance.startsWith("stolen:") &&
        !r.property[x.provenance.slice(7)],
    )
  )
    fail();
  const a = s.activeRobbery,
    c = a?.career;
  if (c && a) {
    if (
      !targetForJob(s, a.jobId) ||
      c.targetId !== job(a.jobId)?.targetId ||
      c.victim !== job(a.jobId)?.victim ||
      c.kind !== job(a.jobId)?.kind ||
      c.revealed > 3 ||
      new Set(c.goods.map((g) => g.id)).size !== c.goods.length ||
      new Set(c.participants.map((p) => p.id)).size !== c.participants.length
    )
      fail();
    if (
      c.participants.some(
        (p) =>
          p.id === s.playerId ||
          !s.characters[p.id] ||
          !r.invitations.some(
            (i) =>
              i.jobId === a.jobId &&
              i.member === p.id &&
              i.status === "participated",
          ),
      ) ||
      c.goods.some(
        (g) =>
          g.takenBy &&
          g.takenBy !== s.playerId &&
          !c.participants.some((p) => p.id === g.takenBy),
      )
    )
      fail();
    if (
      a.status === "ended" &&
      !s.robberies?.history.some((h) => h.id === a.id)
    )
      fail();
  }
}
