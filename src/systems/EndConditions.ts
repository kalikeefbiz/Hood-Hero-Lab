import { interruptSession } from "./SessionLifecycle";
import { type GameState, player } from "../core/GameState";
import { BALANCE } from "../content/balance";
import { STRATEGY_BALANCE as B } from "../content/strategy";
import { stabilizedControl } from "./Territory";
import { successorError } from "./Politics";
import { record } from "../core/EventLog";
export function legitimateProgress(s: GameState) {
  const p = player(s),
    lawful = s.assets.filter(
      (a) => a.owner === p.id && a.provenance === "clean",
    );
  const debt =
    s.street.arrears +
    s.street.agreements
      .filter((a) => a.debtor === p.id)
      .reduce((n, a) => n + a.balance, 0);
  const wealth =
    p.wallet.clean + lawful.reduce((n, a) => n + a.value, 0) - debt;
  const income =
    p.recurringLawfulIncome + lawful.reduce((n, a) => n + a.recurringIncome, 0);
  const recentCrime =
    (s.strategic.lastCrimeDay !== null &&
      s.day - s.strategic.lastCrimeDay < BALANCE.legitimateCooldownDays) ||
    s.ledger.some(
      (e) =>
        e.provenance === "illicit" &&
        e.amount > 0 &&
        s.day - e.day < BALANCE.legitimateCooldownDays,
    );
  const missing: string[] = [];
  if (wealth < BALANCE.cleanWealthVictory)
    missing.push(
      `$${BALANCE.cleanWealthVictory.toLocaleString()} in clean savings and assets`,
    );
  if (income < BALANCE.recurringIncomeVictory)
    missing.push(
      `$${BALANCE.recurringIncomeVictory} a day in steady, honest income`,
    );
  if (s.strategic.lawfulStreak < B.lawfulSustainDays)
    missing.push(
      `${B.lawfulSustainDays} days in a row of steady, honest income`,
    );
  if (
    p.wallet.illicit > 0 ||
    s.strategic.businesses.some(
      (b) =>
        b.provenance === "illicit" && !["sold", "closed"].includes(b.status),
    )
  )
    missing.push("No dirty money, and no business bought with it");
  if (s.street.lots.some((l) => l.owner === p.id && l.remaining > 0))
    missing.push("No product left on you");
  if (recentCrime)
    missing.push(
      `${BALANCE.legitimateCooldownDays} days clean of crime and dirty money`,
    );
  if (debt > 0)
    missing.push("Pay off your suppliers and any unpaid living costs");
  if (p.status !== "active") missing.push("Be free and able to walk away");
  return { wealth, income, debt, recentCrime, missing };
}
export function evaluateEnd(s: GameState): GameState["end"] {
  const p = player(s);
  if (p.status === "dead") return "killed";
  if (s.progression.retired && !legitimateProgress(s).missing.length)
    return "legitimate-exit";
  if (
    p.affiliation &&
    p.authority >= BALANCE.underlordAuthority &&
    stabilizedControl(s, p.affiliation) >= BALANCE.underlordZones &&
    s.crew.successor &&
    !successorError(s, s.crew.successor)
  )
    return "underlord";
  return null;
}
export function finalizeEnding(s: GameState) {
  if (s.strategic.ending) return;
  const ending = evaluateEnd(s);
  s.end = ending;
  if (ending) interruptSession(s, "Your story ended. Anyone still waiting moved on.");
  if (!ending || ending === "arrested") return;
  const p = player(s),
    text =
      ending === "underlord"
        ? `${p.name} made it to the top of ${s.factions[p.affiliation!].name}, with ${s.characters[s.crew.successor!].name} ready to carry it on. The city won’t forget how you rose.`
        : ending === "legitimate-exit"
          ? `${p.name} left the streets behind. Honest income and clean money pay for the life now. The city remembers how you got here.`
          : `${p.name}’s life ended. Stixx City remembers.`;
  const e = record(s, "system", text, [p.id], [p.id], {
    title: ending === "killed" ? "A life cut short" : "A life of your own",
    importance: "critical",
  });
  s.strategic.ending = { day: s.day, kind: ending, eventId: e.id };
}
export function retire(state: GameState) {
  const missing = legitimateProgress(state).missing;
  if (state.end || missing.length)
    return { state, error: missing.join("; ") || "Campaign ended" };
  const s = structuredClone(state);
  s.progression.retired = true;
  finalizeEnding(s);
  return { state: s, error: null };
}
