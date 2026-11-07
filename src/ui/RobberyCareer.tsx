/** Minimal functional City adapter for Claude review/replacement; no renderer logic. */
import { useState } from "react";
import type { GameState } from "../core/GameState";
import {
  ROBBERY_TARGETS,
  PAWN_LOCATION,
  ROBBERY_BALANCE as B,
} from "../content/robberyCareer";
import { ITEM_DEFINITIONS as D } from "../content/inventory";
import {
  careerOpportunities,
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
type Props = { s: GameState; change: (s: GameState) => void };
export function CareerPlace({
  s,
  change,
  location,
}: Props & { location: string }) {
  const [error, setError] = useState("");
  const run = (r: GameState | string) =>
    typeof r === "string" ? setError(r) : (setError(""), change(r));
  return (
    <section aria-label="Robbery career">
      {careerOpportunities(s, location).map((t) => (
        <div key={t.id}>
          <strong>{t.name}</strong>
          <p>
            {t.circumstance}{" "}
            {t.kind === "home"
              ? "Crew required · shared four full days cooldown."
              : ""}
          </p>
          {t.cooldown && (
            <p>
              Next eligible day {t.cooldown.nextDay} · {t.cooldown.jobId}
            </p>
          )}
          {!t.lead &&
            !s.robberies?.jobs.some(
              (j) =>
                j.targetId === t.id &&
                j.status === "offered" &&
                j.expiresDay >= s.day,
            ) && (
              <button
                disabled={!!t.error}
                onClick={() => run(offerTarget(s, t.id))}
              >
                Notice {t.name}
              </button>
            )}
          {t.error && <p>{t.error}</p>}
        </div>
      ))}
      {location === PAWN_LOCATION && (
        <>
          <h3>Pawn carried property</h3>
          {inventoryOf(s).slots.map((x) => {
            const q = pawnQuote(s, x.id);
            if (!q) return null;
            const e = dispositionError(s, x.id);
            return (
              <div key={x.id}>
                <p>
                  {D[x.itemId].name} · estimated retail ${q.value} · offer $
                  {q.price} illicit cash
                </p>
                <button
                  disabled={!!e}
                  onClick={() => run(sellProperty(s, x.id))}
                >
                  Pawn {D[x.itemId].name} · ${q.price}
                </button>
                {e && <p>{e}</p>}
              </div>
            );
          })}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function CareerPerson({ s, id, change }: Props & { id: string }) {
  const [error, setError] = useState("");
  const run = (r: GameState | string) =>
    typeof r === "string" ? setError(r) : (setError(""), change(r));
  const criminal = criminalTargetError(s, id);
  return (
    <section aria-label="Personal robbery business">
      {!criminal && (
        <button onClick={() => run(offerTarget(s, `criminal.${id}`, id))}>
          Notice high-risk opportunity · {s.characters[id].name}
        </button>
      )}
      {atPerson(s, id) &&
        ["dizzy", "baby-canon", "joker", "quanny"].includes(id) &&
        skillRank(s.characters[s.playerId], "robbery") >= 2 && (
          <details>
            <summary
              style={{
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                touchAction: "manipulation",
              }}
            >
              Ask about house and commercial leads
            </summary>
            {ROBBERY_TARGETS.filter((t) => t.lead).map((t) => (
              <button
                key={t.id}
                onClick={() => run(offerCareerLead(s, id, t.id))}
              >
                {t.name} · earned lead
              </button>
            ))}
          </details>
        )}
      {s.robberies?.jobs
        .filter(
          (j) =>
            j.status === "offered" &&
            j.expiresDay >= s.day &&
            ["home", "store"].includes(j.kind),
        )
        .map((j) => (
          <div key={j.id}>
            <p>
              {targetForJob(s, j.id)?.name} · 25% cash + goods buyout due day of
              completion +5
            </p>
            <button
              disabled={!!partnerError(s, id, j.id, true)}
              onClick={() => run(inviteRobbery(s, id, j.id))}
            >
              Invite to {j.id} · own equipment required
            </button>
            <p>{partnerError(s, id, j.id, true)}</p>
          </div>
        ))}
      {inventoryOf(s).slots.map((x) => {
        const q = pawnQuote(s, x.id);
        if (q?.owner !== id) return null;
        const e = dispositionError(s, x.id, id);
        return (
          <div key={x.id}>
            <p>Sell-back guarantees active personal beef and +8 notoriety.</p>
            <button
              disabled={!!e}
              onClick={() => run(sellProperty(s, x.id, id))}
            >
              Sell {D[x.itemId].name} back · $
              {Math.floor(q.value * B.sellBackRatio)}
            </button>
            {e && <p>{e}</p>}
          </div>
        );
      })}
      {s.robberyCareer?.claims
        .filter((c) => c.member === id && c.paid < c.amount)
        .map((c) => (
          <button key={c.id} onClick={() => run(payCrewClaim(s, c.id))}>
            Pay agreed goods share ${c.amount - c.paid} · due {c.dueDay}
          </button>
        ))}
      {s.robberyCareer?.extortions
        .filter((d) => d.npc === id && d.status === "pending")
        .map((d) => (
          <div key={d.id}>
            <p>
              Personal demand ${d.amount} · witnessed {d.jobId}
            </p>
            <button onClick={() => run(answerExtortion(s, d.id, true))}>
              Pay personal cut
            </button>
            <button onClick={() => run(answerExtortion(s, d.id, false))}>
              Refuse · personal conflict
            </button>
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function CareerControls({
  s,
  change,
  input,
}: Props & { input: (a: string) => void }) {
  const [error, setError] = useState(""),
    [dial, setDial] = useState(50),
    a = s.activeRobbery!,
    c = a.career!;
  const run = (r: GameState | string) =>
    typeof r === "string" ? setError(r) : (setError(""), change(r));
  return (
    <div aria-label="Robbery choices">
      {a.cursor === 0 ? (
        <>
          <button onClick={() => input("patient")}>
            Wait and watch · lower pressure
          </button>
          <button onClick={() => input("rush")}>Rush · higher pressure</button>
          <button onClick={() => input("withdraw")}>Withdraw</button>
        </>
      ) : (
        <>
          <p>
            Pressure {c.pressure} · revealed {c.revealed}/3 · items stay
            physical; no automatic cash conversion.
          </p>
          {[s.playerId, ...c.participants.map((p) => p.id)].map((id) => {
            const cap = characterCapacity(s, id);
            return (
              <p key={id}>
                {s.characters[id].name}: {cap.usedSlots}/{cap.maxSlots} slots ·{" "}
                {cap.usedLoad}/{cap.maxLoad} load
              </p>
            );
          })}
          {c.goods
            .filter((g) => g.beat <= c.revealed)
            .map((g) => (
              <div key={g.id}>
                <strong>
                  {D[g.itemId].name} ×{g.quantity}
                </strong>
                <p>
                  {g.quantity * D[g.itemId].load} load · retail estimate $
                  {g.value}{" "}
                  {g.locked && !c.dial.open ? "· optional locked bonus" : ""}{" "}
                  {g.takenBy ? "· carried" : ""}
                </p>
                {!g.takenBy &&
                  (!g.locked || c.dial.open) &&
                  [
                    s.playerId,
                    ...c.participants
                      .filter((p) => s.crew.members.includes(p.id))
                      .map((p) => p.id),
                  ].map((id) => (
                    <button
                      key={id}
                      onClick={() => run(takeLoot(s, a.id, a.cursor, g.id, id))}
                    >
                      Take {D[g.itemId].name} · {s.characters[id].name}
                    </button>
                  ))}
              </div>
            ))}
          {c.kind === "home" ? (
            <>
              {c.revealed < 3 && (
                <button onClick={() => input("search")}>
                  Search next room · more pressure
                </button>
              )}
              {c.goods.some((g) => g.locked && g.beat <= c.revealed) &&
                !c.dial.open &&
                c.dial.tries < 3 && (
                  <fieldset>
                    <legend>Optional fictional dial · untimed</legend>
                    <p>
                      {c.dial.feedback} · {3 - c.dial.tries} tries left
                    </p>
                    <button onClick={() => setDial(Math.max(0, dial - 10))}>
                      Dial −10
                    </button>
                    <output>{dial}</output>
                    <button onClick={() => setDial(Math.min(100, dial + 10))}>
                      Dial +10
                    </button>
                    <button
                      onClick={() => run(tryDial(s, a.id, a.cursor, dial))}
                    >
                      Try dial · adds pressure
                    </button>
                  </fieldset>
                )}
            </>
          ) : c.kind === "store" && a.cursor === 1 ? (
            <button onClick={() => input("coordinate")}>
              Coordinate partner collection
            </button>
          ) : (
            <>
              <button onClick={() => input("deescalate")}>
                De-escalate and finish
              </button>
              <button onClick={() => input("press")}>
                Press for full cash · greater risk
              </button>
            </>
          )}
          <button onClick={() => input("leave")}>
            Leave with current take
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
