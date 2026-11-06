import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameState } from "../core/GameState";
import { baseline, newExchanges, type Exchange, type ExchangeSide } from "./exchanges";

/** How long each card stays: slide in, hold, fade (CSS keyframes match). */
export const EXCHANGE_MS = 2600;
const MAX_VISIBLE = 3;

function Side({ side, dir }: { side: ExchangeSide; dir: "give" | "get" }) {
  const headline =
    side.kind === "item"
      ? `${side.quantity}× ${side.name}`
      : `${dir === "get" ? "+" : "−"}$${side.amount}`;
  return (
    <div className={`exchange-side ${dir} ${side.kind}`}>
      {side.icon && <img src={side.icon} alt="" />}
      <div>
        <strong>{headline}</strong>
        <small>{side.label}</small>
        {side.note && <small className="exchange-note">{side.note}</small>}
      </div>
    </div>
  );
}

/**
 * What changed hands after each exchange: merchandise and cash, in and out.
 * Never a target: taps go straight through, and nothing waits on it.
 */
export function ExchangeFeed({ s }: { s: GameState }) {
  const seen = useRef(baseline(s));
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
          {e.give && <Side side={e.give} dir="give" />}
          {e.give && e.get && (
            <span className="exchange-arrows" aria-hidden="true">
              <i>→</i>
              <i>←</i>
            </span>
          )}
          {e.get && <Side side={e.get} dir="get" />}
        </div>
      ))}
    </div>,
    document.body,
  );
}
