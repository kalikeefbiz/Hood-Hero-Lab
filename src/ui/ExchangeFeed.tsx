import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameState } from "../core/GameState";
import { newExchanges, type Exchange } from "./exchanges";

/** How long each card stays: slide in, hold, fade (CSS keyframes match). */
export const EXCHANGE_MS = 2600;
const MAX_VISIBLE = 3;

/**
 * Item-for-cash cards after each successful exchange. Never a target: taps go
 * straight through to the board and controls, and nothing waits on it.
 */
export function ExchangeFeed({ s }: { s: GameState }) {
  const seen = useRef<{ firstId: string | null; count: number }>({
    firstId: s.street.transactions[0]?.id ?? null,
    count: s.street.transactions.length,
  });
  const [cards, setCards] = useState<Exchange[]>([]);
  useEffect(() => {
    const { exchanges, seen: next } = newExchanges(s, seen.current);
    seen.current = next;
    if (!exchanges.length) return;
    setCards((c) => [...c, ...exchanges].slice(-MAX_VISIBLE));
    const ids = new Set(exchanges.map((e) => e.id));
    window.setTimeout(
      () => setCards((c) => c.filter((x) => !ids.has(x.id))),
      EXCHANGE_MS,
    );
  }, [s]);
  if (!cards.length) return null;
  // Above the board and its labels, outside the game panel's layer.
  return createPortal(
    <div className="exchange-feed" aria-live="polite">
      {cards.map((e) => (
        <div className="exchange-card" key={e.id} data-transaction={e.id}>
          {e.give && (
            <div className="exchange-side give">
              {e.give.icon && <img src={e.give.icon} alt="" />}
              <div>
                <strong>
                  {e.give.quantity}× {e.give.name}
                </strong>
                <small>Given</small>
              </div>
            </div>
          )}
          {e.give && e.get && (
            <span className="exchange-arrows" aria-hidden="true">
              <i>→</i>
              <i>←</i>
            </span>
          )}
          {e.get && (
            <div className="exchange-side get">
              <img src={e.get.icon} alt="" />
              <div>
                <strong>+${e.get.amount}</strong>
                <small>
                  {e.get.kind === "illicit" ? "Illicit cash" : "Cash"} received
                </small>
                {e.get.note && <small className="exchange-note">{e.get.note}</small>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
