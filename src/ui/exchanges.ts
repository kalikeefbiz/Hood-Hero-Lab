import type { GameState } from "../core/GameState";
import { MERCHANDISE } from "../content/street";
import type { StreetTransaction } from "../systems/StreetTypes";

/**
 * A physical exchange the player just made: what left their hands and what
 * landed in them. Built only from records the economy already wrote, so the
 * feed never prices, counts or pays anything itself. Reusable for purchases
 * and lawful pay later: give and get are both optional.
 */
export interface Exchange {
  id: string;
  give?: { name: string; quantity: number; icon: string };
  get?: { amount: number; kind: "illicit" | "clean"; icon: string; note?: string };
}

const art = (file: string) => `${import.meta.env.BASE_URL}assets/items/${file}.webp`;
/** Inventory art by merchandise category. Missing art means no icon, never a stand-in. */
export const ITEM_ICONS: Record<string, string> = { nightgoods: art("pink-magic") };
export const CASH_ICON = art("cash");

const itemName = (category: string) =>
  (MERCHANDISE as Record<string, { name: string }>)[category]?.name ?? category;

/** The player's side of one street transaction, or null when they got nothing. */
export function streetExchange(s: GameState, t: StreetTransaction): Exchange | null {
  if (!t.sold || !t.gross) return null; // failures keep their own feedback
  const lot = s.street.lots.find((l) => l.id === t.lotId);
  const category = lot?.category ?? "nightgoods";
  if (t.actor === s.playerId) {
    const partner = t.partner ? s.characters[t.partner] : null;
    return {
      id: t.id,
      give: { name: itemName(category), quantity: t.sold, icon: ITEM_ICONS[category] ?? "" },
      get: {
        amount: t.gross,
        kind: "illicit",
        icon: CASH_ICON,
        note: partner && t.crewPaid ? `$${t.crewPaid} to ${partner.name}` : undefined,
      },
    };
  }
  if (t.partner === s.playerId && t.crewPaid)
    return {
      id: t.id,
      get: {
        amount: t.crewPaid,
        kind: "illicit",
        icon: CASH_ICON,
        note: `Share from ${s.characters[t.actor]?.name ?? "crew"}`,
      },
    };
  return null;
}

/**
 * Transactions appended since `seen` was taken. A different history (a load,
 * a new run) is not "new": it re-baselines without announcing anything.
 */
export function newExchanges(
  s: GameState,
  seen: { firstId: string | null; count: number },
): { exchanges: Exchange[]; seen: { firstId: string | null; count: number } } {
  const list = s.street.transactions,
    firstId = list[0]?.id ?? null,
    next = { firstId, count: list.length };
  const continues =
    seen.count <= list.length && (seen.count === 0 || seen.firstId === firstId);
  if (!continues) return { exchanges: [], seen: next };
  const exchanges = list
    .slice(seen.count)
    .filter((t) => t.day === s.day)
    .map((t) => streetExchange(s, t))
    .filter((e): e is Exchange => !!e);
  return { exchanges, seen: next };
}
