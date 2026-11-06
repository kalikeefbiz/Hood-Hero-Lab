import type { GameState } from "../core/GameState";
import { MERCHANDISE } from "../content/street";
import type { StreetTransaction } from "../systems/StreetTypes";

/**
 * A physical exchange the player just made: what left their hands and what
 * landed in them. Built only from records the economy already wrote (sales,
 * supplied lots, repayments), so the feed never prices, counts or pays
 * anything itself. Reusable for purchases and lawful pay: either side can be
 * merchandise or cash, and either can be missing.
 */
export type ExchangeSide =
  | { kind: "item"; name: string; quantity: number; icon: string; label: string; note?: string }
  | { kind: "cash"; amount: number; provenance: "illicit" | "clean" | "any"; icon: string; label: string; note?: string };
export interface Exchange {
  id: string;
  give?: ExchangeSide;
  get?: ExchangeSide;
}

const art = (file: string) => `${import.meta.env.BASE_URL}assets/items/${file}.webp`;
/** Inventory art by merchandise category. Missing art means no icon, never a stand-in. */
export const ITEM_ICONS: Record<string, string> = { nightgoods: art("pink-magic") };
export const CASH_ICON = art("cash");

const itemName = (category: string) =>
  (MERCHANDISE as Record<string, { name: string }>)[category]?.name ?? category;
const item = (category: string, quantity: number, label: string, note?: string): ExchangeSide => ({
  kind: "item",
  name: itemName(category),
  quantity,
  icon: ITEM_ICONS[category] ?? "",
  label,
  note,
});
const money = (
  amount: number,
  label: string,
  provenance: "illicit" | "clean" | "any" = "illicit",
  note?: string,
): ExchangeSide => ({ kind: "cash", amount, provenance, icon: CASH_ICON, label, note });
const nameOf = (s: GameState, id: string) =>
  s.characters[id]?.alias ?? s.characters[id]?.name ?? "them";

/** The player's side of one street transaction, or null when they got nothing. */
export function streetExchange(s: GameState, t: StreetTransaction): Exchange | null {
  if (!t.sold || !t.gross) return null; // failures keep their own feedback
  const lot = s.street.lots.find((l) => l.id === t.lotId);
  const category = lot?.category ?? "nightgoods";
  if (t.actor === s.playerId)
    return {
      id: t.id,
      give: item(category, t.sold, "Given"),
      get: money(
        t.gross,
        "Illicit cash received",
        "illicit",
        t.partner && t.crewPaid ? `$${t.crewPaid} to ${nameOf(s, t.partner)}` : undefined,
      ),
    };
  if (t.partner === s.playerId && t.crewPaid)
    return {
      id: t.id,
      get: money(t.crewPaid, "Illicit cash received", "illicit", `Share from ${nameOf(s, t.actor)}`),
    };
  return null;
}

/** What the economy has recorded so far; the next state is compared to it. */
export interface ExchangeBaseline {
  firstTx: string | null;
  txCount: number;
  lots: string[];
  repaid: Record<string, number>;
}
export function baseline(s: GameState): ExchangeBaseline {
  return {
    firstTx: s.street.transactions[0]?.id ?? null,
    txCount: s.street.transactions.length,
    lots: s.street.lots.map((l) => l.id),
    repaid: Object.fromEntries(
      s.street.agreements
        .filter((a) => a.debtor === s.playerId)
        .map((a) => [a.id, a.repaid]),
    ),
  };
}

/**
 * Exchanges recorded since `seen`. A history that does not continue from it
 * (a load, a new run) is not news: it re-baselines without announcing.
 */
export function newExchanges(
  s: GameState,
  seen: ExchangeBaseline,
): { exchanges: Exchange[]; seen: ExchangeBaseline } {
  const next = baseline(s),
    tx = s.street.transactions;
  const continues =
    seen.txCount <= tx.length &&
    (seen.txCount === 0 || seen.firstTx === next.firstTx) &&
    seen.lots.length <= next.lots.length &&
    seen.lots.every((id, i) => next.lots[i] === id) &&
    Object.entries(seen.repaid).every(([id, n]) => (next.repaid[id] ?? n) >= n);
  if (!continues) return { exchanges: [], seen: next };
  const exchanges: Exchange[] = [];
  // A pack from a plug: the merchandise in, and the cash out if paid up front.
  for (const l of s.street.lots.slice(seen.lots.length)) {
    if (l.owner !== s.playerId || l.acquiredDay !== s.day || l.sourceLotId) continue;
    const from = nameOf(s, l.supplier);
    exchanges.push({
      id: l.id,
      give:
        l.arrangement === "cash" && l.cost
          ? money(l.cost, `Paid to ${from}`, "any")
          : undefined,
      get: item(
        l.category,
        l.received,
        `Received from ${from}`,
        l.arrangement === "consignment"
          ? `Fronted · $${l.owed} owed by day ${l.dueDay}`
          : undefined,
      ),
    });
  }
  // Paying a plug back.
  for (const a of s.street.agreements) {
    if (a.debtor !== s.playerId || !(a.id in seen.repaid)) continue;
    const paid = a.repaid - seen.repaid[a.id];
    if (paid > 0)
      exchanges.push({
        id: `${a.id}:${a.repaid}`,
        give: money(
          paid,
          `Paid to ${nameOf(s, a.supplier)}`,
          "any",
          a.balance ? `$${a.balance} still owed` : "Paid in full",
        ),
      });
  }
  for (const t of tx.slice(seen.txCount)) {
    if (t.day !== s.day) continue;
    const e = streetExchange(s, t);
    if (e) exchanges.push(e);
  }
  return { exchanges, seen: next };
}
