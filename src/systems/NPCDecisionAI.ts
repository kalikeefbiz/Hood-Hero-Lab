import { isReservoirResidentAddition } from "../content/reservoirResidents";
import { proficiency } from "./Skills";
import { considerCrewOffer } from "./CrewAgency";
import { shiftToday } from "./Employment";
import { cash, type GameState, type Character } from "../core/GameState";
import { random } from "../core/Random";
import {
  resolveAction,
  validateAction,
  type Action,
} from "../core/ActionEngine";
export function npcCanTakeDailyAction(s: GameState, c: Character) {
  return !(
    c.status !== "active" ||
    c.availableDay > s.day ||
    c.lastActionDay >= s.day ||
    c.agency.lastAssignmentDay === s.day ||
    s.commitments.some(
      (o) =>
        o.actor === c.id &&
        o.status === "pending" &&
        o.kind !== "employment-shift" &&
        o.kind !== "supplier-debt" &&
        o.kind !== "recover-property" &&
        (o.kind !== "crew-activity" || o.dueDay === s.day),
    )
  );
}

// The expanded cast gets deterministic draws without rerolling existing actors
// or the opening story's shared stream when new options become available.
function residentDraw(s: GameState, id: string) {
  let rng = s.rng ^ s.day;
  for (const code of id) rng = Math.imul(rng ^ code.charCodeAt(0), 16777619);
  return { rng: rng >>> 0 };
}

// Utility scores derive from goals, needs, values, memories and obligations.
function decide(s: GameState, c: Character, expandedResident: boolean): Action | null {
  if (!npcCanTakeDailyAction(s, c)) return null;
  if (shiftToday(s, c.id)) return { actor: c.id, type: "work" };
  const options: { action: Action; score: number }[] = [];
  const add = (action: Action, score: number) => {
    if (validateAction(s, action)) return;
    const target = action.target;
    let stream: Pick<GameState, "rng"> = s;
    if (!expandedResident && target) {
      if (target === "contact-angels") stream = s.streetLife ?? s.quanny;
      else if (target === "quanny" || target === "mr-lewis") stream = s.quanny;
      else if (isReservoirResidentAddition(target)) stream = residentDraw(s, target);
    }
    options.push({ action, score: score + random(stream) * 5 });
  };
  add(
    { actor: c.id, type: "gig" },
    (cash(c) < 100 ? 65 : 15) +
      (c.goals.includes("income") ? 15 : 0) +
      proficiency(c, "work") / 10,
  );
  add({ actor: c.id, type: "rest" }, c.stress > 45 ? 90 : 5);
  if (c.traits.risk > 60 || (s.crew.members.includes(c.id) && s.street.agreements.some(a => a.debtor === c.id && a.setConsignment && a.balance > 0)))
    add(
      { actor: c.id, type: "crime" },
      (c.goals.includes("status") ? 35 : 10) +
        c.traits.ambition / 5 +
        (proficiency(c, "trapper") - 20) / 20 -
        c.police / 2,
    );
  for (const target of c.known) {
    const other = s.characters[target];
    if (!other || other.id === c.id || other.status !== "active") continue;
    const r = c.relationships[target];
    if ((r?.grievance ?? 0) > 40) continue;
    const memory =
      c.memories
        .slice(-10)
        .filter((m) => m.about === target)
        .reduce((n, m) => n + m.weight, 0) / 10;
    const obligation = c.goals.includes("loyalty") ? c.traits.loyalty / 4 : 0;
    add(
      { actor: c.id, type: "socialize", target },
      20 + obligation + (r?.trust ?? 0) / 5 + memory + other.influence / 10,
    );
  }
  options.sort((a, b) => b.score - a.score);
  return options[0]?.action ?? null;
}
export function advanceNPCs(s: GameState) {
  for (const c of Object.values(s.characters).sort(
    (a, b) =>
      Number(["quanny", "mr-lewis", "contact-angels"].includes(a.id)) -
      Number(["quanny", "mr-lewis", "contact-angels"].includes(b.id)),
  )) {
    if (c.id === s.playerId) continue;
    const authored = ["quanny", "mr-lewis", "contact-angels"].includes(c.id),
      resident = isReservoirResidentAddition(c.id),
      previousRng = s.rng;
    if (authored)
      s.rng =
        c.id === "contact-angels" ? (s.streetLife?.rng ?? 11011) : s.quanny.rng;
    if (resident) s.rng = residentDraw(s, c.id).rng;
    try {
      considerCrewOffer(s, c);
      const action = decide(s, c, resident);
      if (action) resolveAction(s, action);
    } finally {
      if (authored) {
        if (c.id === "contact-angels") {
          if (s.streetLife) s.streetLife.rng = s.rng;
        } else s.quanny.rng = s.rng;
      }
      if (authored || resident) s.rng = previousRng;
    }
  }
}
