import { marketView, playerText, playerReason } from "../presentation/PlayerInformation";
import { hospitalStay } from "../systems/Danger";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { player, type GameState } from "../core/GameState";
import { locationById } from "../board/locations";
import { assessRisk } from "../board/presence";
import { saleLot, unitPrice } from "../systems/StreetEconomy";
import {
  advanceStreetSession,
  endStreetSession,
  pauseStreetSession,
  startStreetSession,
  validateStartStreetSession,
} from "../systems/StreetSessions";
export function StreetSessionStart({
  s,
  location,
  change,
  busy,
  onStart,
}: {
  s: GameState;
  location: string;
  change: Dispatch<SetStateAction<GameState | null>>;
  busy: boolean;
  onStart: () => void;
}) {
  const [selected, setSelected] = useState("");
  const reason = validateStartStreetSession(s, location),
    l = locationById(location)!;
  return (
    <section className="panel" aria-label="City trapping spot">
      <h3>Trapping · {l.name}</h3>
      <p>
        {saleLot(s)?.remaining ?? 0} Pink Magic on hand · about $
        {unitPrice(s, l.zone)} per unit before rank margin.
      </p>
      <p>
        {marketView(s, l.zone)} · {assessRisk(s, location).level}
      </p>
      <label>
        Stock lot
        <select
          aria-label="Stock lot"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Earliest deadline (automatic)</option>
          {s.street.lots
            .filter((l) => l.owner === s.playerId && l.remaining > 0)
            .map((l) => (
              <option key={l.id} value={l.id}>
                Received day {l.acquiredDay} · {s.characters[l.supplier].name} · {l.remaining} held ·
                ${l.owed} owed · day {l.dueDay}
              </option>
            ))}
        </select>
      </label>
      <p>
        {s.street.lots
          .filter((l) => l.owner === s.playerId)
          .reduce((n, l) => n + l.remaining, 0)}{" "}
        total units across your lots.
      </p>
      <p>Spend some time on the block · about 30–45 seconds · visitors and sales are uncertain.</p>
      <button
        disabled={busy || !!reason}
        onClick={() => {
          change((cur) =>
            cur
              ? startStreetSession(cur, location, selected || undefined).state
              : cur,
          );
          onStart();
        }}
      >
        Start trapping — 1 AP
      </button>
      {reason && <p className="disabled-reason">{playerReason(s, reason)}</p>}
    </section>
  );
}
export function StreetSessionPlayback({
  s,
  change,
  visible,
}: {
  s: GameState;
  change: Dispatch<SetStateAction<GameState | null>>;
  visible: boolean;
}) {
  const a = s.activeSession;
  useEffect(() => {
    const pause = () => {
      if (document.hidden)
        change((cur) =>
          cur?.activeSession
            ? pauseStreetSession(cur, cur.activeSession.id, true)
            : cur,
        );
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [change]);
  useEffect(() => {
    if (!visible && a?.status === "active")
      change((cur) => (cur ? pauseStreetSession(cur, a.id, true) : cur));
  }, [visible, a?.id, a?.status, change]);
  useEffect(() => {
    if (!a || a.status !== "active" || !visible || document.hidden) return;
    const { id, cursor } = a;
    const timer = window.setTimeout(() => {
      if (!document.hidden)
        change((cur) => (cur ? advanceStreetSession(cur, id, cursor) : cur));
    }, a.beats[cursor]?.duration ?? 7200);
    return () => window.clearTimeout(timer);
  }, [a?.id, a?.cursor, a?.status, visible, change]);
  if (!a || !visible || player(s).status !== "active" || hospitalStay(s))
    return null;
  const advance = () =>
    change((cur) =>
      cur && !document.hidden ? advanceStreetSession(cur, a.id, a.cursor) : cur,
    );
  return (
    <section
      className="session-playback"
      aria-label="Trapping session"
      data-session={a.id}
      data-cursor={a.cursor}
    >
      <strong>
        {locationById(a.location)?.name} ·{" "}
        {a.status === "ended"
          ? "Session ended"
          : `On the block · ${a.cursor} visitors met`}
      </strong>
      <p role="status">{playerText(s, a.lastText)}</p>
      <p>
        {a.totals.sold} sold · {a.totals.lost} lost · $
        {a.totals.gross - a.totals.loss} cash · +
        {(a.totals.xp / 100).toFixed(2)} XP · police attention may rise
      </p>
      <details>
        <summary>Stock, obligations and AP</summary>
        <p>
          {saleLot(s)?.remaining ?? 0} held · $
          {s.street.agreements
            .filter((x) => x.debtor === s.playerId)
            .reduce((n, x) => n + x.balance, 0)}{" "}
          supplier balance · {s.ap} AP left
        </p>
      </details>
      {a.status === "ended" ? (
        <>
          <p>{playerText(s, a.reason)}</p>
          <button
            onClick={() =>
              change((cur) =>
                cur?.activeSession?.status === "ended"
                  ? { ...cur, activeSession: undefined }
                  : cur,
              )
            }
          >
            Dismiss session summary
          </button>
        </>
      ) : (
        <div className="session-controls">
          {a.status === "paused" ? (
            <button
              onClick={() =>
                change((cur) =>
                  cur ? pauseStreetSession(cur, a.id, false) : cur,
                )
              }
            >
              Continue session
            </button>
          ) : (
            <>
              <button onClick={advance}>Skip visitor</button>
              <button
                onClick={() =>
                  change((cur) =>
                    cur ? pauseStreetSession(cur, a.id, true) : cur,
                  )
                }
              >
                Pause
              </button>
            </>
          )}
          <button
            onClick={() =>
              change((cur) => (cur ? endStreetSession(cur, a.id) : cur))
            }
          >
            Leave session
          </button>
        </div>
      )}
      {player(s).status !== "active" && (
        <p>Your activity stopped. Follow the custody or recovery controls.</p>
      )}
    </section>
  );
}
