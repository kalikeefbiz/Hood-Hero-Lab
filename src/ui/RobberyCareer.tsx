import { robberyPlaceView, robberyDiscoveryView, playerText, jobName } from "../presentation/PlayerInformation";
/**
 * Robbery presentation over RobberyCareer's rules (GOAL 013). Everything is
 * read from, or sent to, the career API: no rolls, prices or awards here.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameState } from "../core/GameState";
import {
  ROBBERY_TARGETS,
  PAWN_LOCATION,
  ROBBERY_BALANCE as B,
  type CareerKind,
} from "../content/robberyCareer";
import { ITEM_DEFINITIONS as D } from "../content/inventory";
import {
  offerTarget,
  offerCareerLead,
  inviteRobbery,
  partnerError,
  targetForJob,
  takeLoot,
  tryDial,
  pawnQuote,
  dispositionError,
  sellProperty,
  criminalTargetError,
  payCrewClaim,
  answerExtortion,
} from "../systems/RobberyCareer";
import { inventoryOf, characterCapacity } from "../systems/Inventory";
import { atPerson } from "../systems/StreetLife";
import { skillRank } from "../systems/Skills";
import { ItemArt } from "./inventory/Slots";

type Props = { s: GameState; change: (s: GameState) => void };
const KIND: Record<CareerKind, string> = {
  home: "House · crew job",
  liquor: "Liquor store",
  store: "Commercial · crew job",
  "strong-arm": "Street",
};
const nameOf = (s: GameState, id: string) =>
  s.characters[id]?.alias ?? s.characters[id]?.name ?? "someone";

function useRun(change: (s: GameState) => void) {
  const [error, setError] = useState("");
  const run = (r: GameState | string) =>
    typeof r === "string" ? setError(r) : (setError(""), change(r));
  return { error, run };
}
const Alert = ({ error, s }: { error: string; s: GameState }) =>
  error ? (
    <p className="disabled-reason" role="alert">
      {playerText(s, error)}
    </p>
  ) : null;

function Risk({ risk }: { risk: number }) {
  const n = risk < 0.05 ? 1 : risk < 0.11 ? 2 : 3;
  return (
    <span className="risk-pips" aria-label={`Risk ${n} of 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </span>
  );
}

/** What a place offers: its targets, and the pawn counter at the Reservoir. */
export function CareerPlace({
  s,
  change,
  location,
  focus,
}: Props & { location: string; focus?: string | null }) {
  const { error, run } = useRun(change);
  const view = robberyPlaceView(s, location), targets = view.targets;
  const root = useRef<HTMLElement>(null);
  // A house tapped on the board opens its own card.
  useEffect(() => {
    if (!focus) return;
    root.current
      ?.querySelector(`[data-target="${CSS.escape(focus)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);
  return (
    <section ref={root} className="robbery-place" aria-label="Robbery career">
      {targets.length > 0 && <p className="eyebrow">Opportunities here</p>}
      {view.possibilities.length > 0 && <details className="city-hint"><summary>Possible finds around here</summary>{view.possibilities.map(text => <p key={text}>{text}</p>)}</details>}
      {targets.map((t) => {
        const held = t.expiresDay !== undefined;
        const hot = t.unsettled;
        return (
          <article
            key={t.ref}
            className={`target-card kind-${t.kind}${hot ? " hot" : ""}${focus === t.ref ? " focused" : ""}`}
            data-target={t.ref}
          >
            <header>
              <strong>{t.name}</strong>
              <small>{t.warning}</small>
            </header>
            <span className="target-kind">{KIND[t.kind]}</span>
            <p>{t.circumstance}</p>
            {hot && <p className="target-lock">People nearby are still on alert.</p>}
            {held ? (
              <p className="target-held">Job lined up · expires day {t.expiresDay}</p>
            ) : t.leadRequired ? (
              <p className="city-hint">Needs an earned lead from someone who knows the place.</p>
            ) : (
              <button disabled={!!t.error} onClick={() => run(offerTarget(s, t.ref))}>
                Notice {t.name}
              </button>
            )}
            {t.error && !held && !t.leadRequired && <p className="disabled-reason">{t.error}</p>}
          </article>
        );
      })}
      {location === PAWN_LOCATION && <PawnCounter s={s} run={run} />}
      <Alert error={error} s={s} />
    </section>
  );
}

function PawnCounter({ s, run }: { s: GameState; run: (r: GameState | string) => void }) {
  const rows = inventoryOf(s)
    .slots.map((x) => ({ x, q: pawnQuote(s, x.id) }))
    .filter((r) => r.q);
  return (
    <div className="pawn-counter" aria-label="Pawn counter">
      <h3>Pawn carried property</h3>
      <p className="city-hint">Cash on the counter. Weapons and Pink Magic aren't taken here.</p>
      {rows.map(({ x, q }) => {
        const e = dispositionError(s, x.id);
        return (
          <div key={x.id} className="pawn-row">
            <ItemArt itemId={x.itemId} />
            <div className="pawn-copy">
              <strong>
                {D[x.itemId].name} ×{x.quantity}
              </strong>
              <small>
                Retail ~${q!.value} → offer ${q!.price}
              </small>
            </div>
            <button disabled={!!e} onClick={() => run(sellProperty(s, x.id))}>
              Pawn {D[x.itemId].name} · ${q!.price}
            </button>
            {e && <small className="disabled-reason">{playerText(s, e)}</small>}
          </div>
        );
      })}
    </div>
  );
}

/** A person's card: scores on them, leads, invitations, returns and debts. */
export function CareerPerson({ s, id, change }: Props & { id: string }) {
  const { error, run } = useRun(change);
  const who = nameOf(s, id);
  const parts: ReactNode[] = [];
  if (!criminalTargetError(s, id))
    parts.push(
      <article key="score" className="target-card kind-criminal">
        <header>
          <strong>Confront {who}</strong>
          <Risk risk={1} />
        </header>
        <span className="target-kind">Personal confrontation</span>
        <p className="city-hint">Robbing someone in the game makes it personal.</p>
        <button onClick={() => run(offerTarget(s, `criminal.${id}`, id))}>
          Notice high-risk opportunity · {s.characters[id].name}
        </button>
      </article>,
    );
  if (
    atPerson(s, id) &&
    ["dizzy", "baby-canon", "joker", "quanny"].includes(id) &&
    skillRank(s.characters[s.playerId], "robbery") >= 2
  )
    parts.push(
      <details key="leads" className="lead-list">
        <summary>Ask about house and commercial leads</summary>
        {ROBBERY_TARGETS.filter((t) => t.lead).map((t) => (
          <button key={t.id} className="secondary" onClick={() => run(offerCareerLead(s, id, t.id))}>
            {t.name} · earned lead
          </button>
        ))}
      </details>,
    );
  for (const j of s.robberies?.jobs ?? []) {
    if (j.status !== "offered" || j.expiresDay < s.day || !["home", "store"].includes(j.kind)) continue;
    const e = partnerError(s, id, j.id, true);
    parts.push(
      <article key={j.id} className="invite-card">
        <strong>{targetForJob(s, j.id)?.name ?? "Lined-up job"}</strong>
        <p className="board-facts">
          {who} takes {Math.round(B.crewShare * 100)}% of the cash on the spot, plus a goods buyout due{" "}
          {B.crewClaimDays} days after. Brings their own equipment.
        </p>
        <button disabled={!!e} onClick={() => run(inviteRobbery(s, id, j.id))}>
          Invite to {jobName(s, j.id)} · own equipment required
        </button>
        {e && <small className="disabled-reason">{playerText(s, e)}</small>}
      </article>,
    );
  }
  for (const x of inventoryOf(s).slots) {
    const q = pawnQuote(s, x.id);
    if (q?.owner !== id) continue;
    const e = dispositionError(s, x.id, id),
      back = Math.floor(q.value * B.sellBackRatio);
    parts.push(
      <article key={x.id} className="return-card">
        <div className="pawn-row">
          <ItemArt itemId={x.itemId} />
          <div className="pawn-copy">
            <strong>
              {who}'s {D[x.itemId].name}
            </strong>
            <small>
              Pawn ${q.price} · sell back ${back}
            </small>
          </div>
        </div>
        <p className="disabled-reason">
          Selling stolen goods back can make the conflict personal and draw attention.
        </p>
        <button disabled={!!e} onClick={() => run(sellProperty(s, x.id, id))}>
          Sell {D[x.itemId].name} back · ${back}
        </button>
        {e && <small className="disabled-reason">{playerText(s, e)}</small>}
      </article>,
    );
  }
  for (const c of s.robberyCareer?.claims ?? []) {
    if (c.member !== id || c.paid >= c.amount) continue;
    parts.push(
      <div key={c.id} className="claim-card">
        <span>
          You owe {who} their goods share · due day {c.dueDay}
        </span>
        <button onClick={() => run(payCrewClaim(s, c.id))}>
          Pay agreed goods share ${c.amount - c.paid} · due {c.dueDay}
        </button>
      </div>,
    );
  }
  for (const d of s.robberyCareer?.extortions ?? []) {
    if (d.npc !== id || d.status !== "pending") continue;
    parts.push(
      <article key={d.id} className="return-card">
        <strong>
          {who} witnessed your job · wants ${d.amount}
        </strong>
        <div className="slot-actions">
          <button onClick={() => run(answerExtortion(s, d.id, true))}>Pay personal cut</button>
          <button className="secondary" onClick={() => run(answerExtortion(s, d.id, false))}>
            Refuse · personal conflict
          </button>
        </div>
      </article>,
    );
  }
  if (!parts.length && !error) return null;
  return (
    <section className="robbery-person" aria-label="Personal robbery business">
      <p className="eyebrow">Robbery business</p>
      {parts}
      <Alert error={error} s={s} />
    </section>
  );
}

/** The live encounter: approach, rooms and loot, the optional dial, exit. */
export function CareerControls({ s, change, input }: Props & { input: (a: string) => void }) {
  const { error, run } = useRun(change);
  const [dial, setDial] = useState(50);
  const a = s.activeRobbery!,
    c = a.career!;
  if (a.cursor === 0)
    return (
      <div className="robbery-controls" aria-label="Robbery choices">
        <p className="eyebrow">Approach</p>
        <button className="choice" onClick={() => input("patient")}>
          Wait and watch · lower pressure
        </button>
        <button className="choice" onClick={() => input("rush")}>
          Rush · higher pressure
        </button>
        <button className="choice secondary" onClick={() => input("withdraw")}>
          Withdraw
        </button>
        <Alert error={error} s={s} />
      </div>
    );
  const carriers = [
    s.playerId,
    ...c.participants.filter((p) => s.crew.members.includes(p.id)).map((p) => p.id),
  ];
  const discovery = robberyDiscoveryView(s);
  const seen = discovery.goods;
  const safeHere = discovery.lockedContainer;
  const pressure = c.pressure < 2 ? "Steady" : c.pressure < 4 ? "Tense" : "Dangerous";
  return (
    <div className="robbery-controls" aria-label="Robbery choices">
      <div className="robbery-status">
        <span className="pressure" aria-label={`Pressure: ${pressure}`}><b>Pressure</b> {pressure}</span>
        {c.kind === "home" && <span className="room">Room {c.revealed} of 3</span>}
      </div>
      <div className="carriers">
        {[s.playerId, ...c.participants.map((p) => p.id)].map((id) => {
          const cap = characterCapacity(s, id);
          return (
            <span key={id} className="carrier">
              <strong>{id === s.playerId ? "You" : nameOf(s, id)}</strong>
              <small>
                {cap.usedSlots}/{cap.maxSlots} slots · {cap.usedLoad}/{cap.maxLoad} load
              </small>
            </span>
          );
        })}
      </div>
      {discovery.lockedContainer && <p className="loot-flag">A locked safe · contents unknown</p>}
      {seen.length > 0 && (
        <div className="loot-grid">
          {seen.map((g) => {
            return (
              <article key={g.ref} className={`loot-card${g.takenBy ? " taken" : ""}`}>
                <div className="loot-head">
                  <ItemArt itemId={g.itemId} />
                  <div>
                    <strong>
                      {D[g.itemId].name} ×{g.quantity}
                    </strong>
                    <small>
                      ~${g.value} · {g.quantity * D[g.itemId].load} load
                    </small>
                  </div>
                </div>
                {g.takenBy && (
                  <small className="loot-flag carried">
                    Carried by {g.takenBy === s.playerId ? "you" : nameOf(s, g.takenBy)}
                  </small>
                )}
                {!g.takenBy && (
                  <div className="loot-take">
                    {carriers.map((id) => (
                      <button
                        key={id}
                        className={id === s.playerId ? "" : "secondary"}
                        onClick={() => run(takeLoot(s, a.id, a.cursor, g.ref, id))}
                      >
                        Take {D[g.itemId].name} · {s.characters[id].name}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {c.kind === "home" && safeHere && !c.dial.open && c.dial.tries < 3 && (
        <fieldset className="dial">
          <legend>Safe dial · optional, no timer</legend>
          <p role="status">
            {c.dial.feedback || "Turn it and listen."} · {3 - c.dial.tries} tries left
          </p>
          <div className="dial-face" style={{ ["--dial" as string]: `${dial * 3.6}deg` }}>
            <span className="dial-needle" />
            <output aria-live="polite">{dial}</output>
          </div>
          <div className="dial-row">
            <button className="secondary" onClick={() => setDial(Math.max(0, dial - 10))}>
              Dial −10
            </button>
            <button className="secondary" onClick={() => setDial(Math.min(100, dial + 10))}>
              Dial +10
            </button>
          </div>
          <button onClick={() => run(tryDial(s, a.id, a.cursor, dial))}>Try dial · adds pressure</button>
        </fieldset>
      )}
      <div className="robbery-actions">
        {c.kind === "home" ? (
          c.revealed < 3 && (
            <button className="choice" onClick={() => input("search")}>
              Search next room · more pressure
            </button>
          )
        ) : c.kind === "store" && a.cursor === 1 ? (
          <button className="choice" onClick={() => input("coordinate")}>
            Coordinate partner collection
          </button>
        ) : (
          <>
            <button className="choice" onClick={() => input("deescalate")}>
              De-escalate and finish
            </button>
            <button className="choice" onClick={() => input("press")}>
              Press for full cash · greater risk
            </button>
          </>
        )}
        <button className="choice secondary" onClick={() => input("leave")}>
          Leave with current take
        </button>
      </div>
      <Alert error={error} s={s} />
    </div>
  );
}
