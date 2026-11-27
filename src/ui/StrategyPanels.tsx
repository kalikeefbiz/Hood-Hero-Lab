import { rivalryView, playerText, playerReason, latestPlayerEvent } from "../presentation/PlayerInformation";
import { payArrears } from "../systems/Economy";
import { useState } from "react";
import { player, type GameState, type ZoneId } from "../core/GameState";
import { BUSINESSES, STRATEGY_BALANCE as B } from "../content/strategy";
import {
  businessAction,
  businessError,
  operating,
} from "../systems/Businesses";
import {
  POLITICAL_ACTIONS,
  politicalAction,
  politicalError,
  representative,
  type PoliticalAction,
  authorityStage,
  promotionRequirements,
  promote,
  successorError,
  appointSuccessor,
} from "../systems/Politics";
import { dominanceScore } from "../systems/Territory";
import { underlordProgress } from "../systems/gang/Authority";
import {
  legitimateProgress,
  retire,
} from "../systems/EndConditions";
import { THEMES } from "./theme";
import "./strategy.css";
type Props = { s: GameState; onChange: (s: GameState) => void };
function useResult(onChange: Props["onChange"]) {
  const [message, setMessage] = useState("");
  return {
    message,
    apply: (result: { state: GameState; error: string | null }) => {
      if (result.error) setMessage(result.error);
      else {
        onChange(result.state);
        setMessage(latestPlayerEvent(result.state)?.text ?? "Recorded.");
      }
    },
  };
}
export function NeighborhoodStrategy({
  s,
  zone,
  onChange,
}: Props & { zone: ZoneId }) {
  const t = s.strategic.territories[zone],
    p = player(s),
    contact = representative(s, zone),
    r = useResult(onChange);
  const meaningful = Object.entries(t.factions).filter(
    ([, q]) => q.presence >= 15 || q.economy >= 15,
  );
  return (
    <section
      className="strategy-neighborhood"
      aria-label="Neighborhood strategy"
    >
      <h4>{t.contested ? "Up for grabs" : "Who runs it"}</h4>
      <p>
        {t.controller
          ? `${s.factions[t.controller].name} have run it since day ${t.controlSince}.`
          : "Nobody runs this neighborhood."}{" "}
      </p>
      <p className="muted">
        {rivalryView(s, zone)}
      </p>
      {meaningful.map(([id, q]) => (
        <div
          className="foothold"
          key={id}
          style={{ borderLeftColor: THEMES[id as keyof typeof THEMES].accent }}
        >
          <strong>{s.factions[id as keyof typeof s.factions].name}</strong>
          <small>
            {q.presence < 35 ? "A local foothold" : q.presence < 65 ? "An established presence" : "A strong local presence"}
          </small>
        </div>
      ))}
      {!meaningful.length && (
        <p>
          No set has a real foothold here.
        </p>
      )}
      {t.changes.slice(-2).map((c) => (
        <p className="memory" key={c.eventId}>
          Day {c.day}:{" "}
          {c.to
            ? s.factions[c.to].name + " gained control"
            : "Nobody runs it anymore"}
          .
        </p>
      ))}
      <details className="strategic-actions">
        <summary>Influence this neighborhood</summary>
        <p className="muted">
          You can do this once every {B.actionCooldown} days.{" "}
          {contact
            ? `You’d work through ${s.characters[contact].name}.`
            : "You need someone from your organization here who trusts you."}
        </p>
        {(Object.keys(POLITICAL_ACTIONS) as PoliticalAction[]).map((type) => {
          const a = POLITICAL_ACTIONS[type],
            error = politicalError(s, type, zone, contact);
          return (
            <div className="strategy-action" key={type}>
              <button
                disabled={!!error}
                onClick={() => r.apply(politicalAction(s, type, zone, contact))}
              >
                {a.label} · ${a.cost} · 1 AP
              </button>
              {error && <small>{playerText(s, error)}</small>}
            </div>
          );
        })}
      </details>
      {r.message && <p role="status">{playerText(s, r.message)}</p>}
    </section>
  );
}
export function OrganizationPanel({ s, onChange }: Props) {
  const p = player(s),
    r = useResult(onChange),
    stage = authorityStage(s),
    next = promotionRequirements(s),
    underlord = underlordProgress(s),
    f = p.affiliation ? s.factions[p.affiliation] : null;
  return (
    <section
      className="panel organization-panel"
      aria-label="Organizational progression"
    >
      <p className="eyebrow">POWER & SUCCESSION</p>
      <h3>{f ? f.name : "Unaffiliated"}</h3>
      <p>
        {f
          ? `${stage?.name ?? "Recruit"} · ${Math.floor(s.strategic.contributions[f.id])} contribution points`
          : "Your Set is your own people. Joining an organization takes someone inside who trusts you enough to vouch for you."}
      </p>
      {f && (
        <>
          <p>
            {stage?.permission}.{" "}
            {f.leaders.length
              ? `Running things: ${f.leaders.map((id) => s.characters[id].name + (s.characters[id].status === "active" ? "" : s.characters[id].status === "arrested" ? " (locked up)" : s.characters[id].status === "dead" ? " (gone)" : " (laying low)")).join(", ")}.`
              : "The same people are still running things."}
          </p>
          {next.stage && (
            <>
              <h4>{next.stage.name === stage?.name ? "More authority" : `Next: ${next.stage.name}`}</h4>
              <ul>
                {next.missing.map((m) => (
                  <li key={playerText(s, m)}>{playerText(s, m)}</li>
                ))}
              </ul>
              <button
                disabled={
                  !!s.end ||
                  p.status !== "active" ||
                  !!next.missing.length ||
                  s.ap < 1
                }
                onClick={() => r.apply(promote(s))}
              >
                Ask to move up · 1 AP
              </button>
            </>
          )}
          <p>
            To run it all: hold {underlord.zones} of {underlord.requiredZones} neighborhoods ·{" "}
            {underlord.authorityEligible ? "authority requirement met" : "gain more authority"} ·{" "}
            {s.crew.successor
              ? `${s.characters[s.crew.successor].name} will take your place`
              : "no one named to take your place"}
            .
          </p>
        </>
      )}
      <details>
        <summary>Who could take your place</summary>
        <p>
          You need enough authority, and they need to be in
          your organization, around, and willing.
        </p>
        {s.crew.members.map((id) => {
          const error = successorError(s, id);
          return (
            <div className="strategy-action" key={id}>
              <strong>{s.characters[id].name}</strong>
              <small>{playerReason(s, error) ?? "Ready to talk about it"}</small>
              <button
                disabled={
                  !!error || s.ap < 1 || !!s.end || p.status !== "active"
                }
                onClick={() => r.apply(appointSuccessor(s, id))}
              >
                Appoint {s.characters[id].alias ?? s.characters[id].name} · 1 AP
              </button>
            </div>
          );
        })}
      </details>
      {r.message && <p role="status">{playerText(s, r.message)}</p>}
    </section>
  );
}
export function BusinessPanel({ s, onChange }: Props) {
  const r = useResult(onChange);
  return (
    <section
      className="panel business-panel"
      aria-label="Legitimate businesses"
    >
      <p className="eyebrow">OWN A PIECE OF THE CITY</p>
      <h3>Business opportunities</h3>
      <p className="muted">
        You pay cash, clean money first. If any street money goes in, the
        business and everything it earns stays dirty. Earnings go up and down,
        and upkeep costs $120.
      </p>
      {BUSINESSES.map((d) => {
        const b = s.strategic.businesses.find((b) => b.definition === d.id),
          a = b ? s.assets.find((a) => a.id === b.id) : null;
        const actions = b
          ? operating(b.status)
            ? (["maintain", "sell", "close"] as const)
            : []
          : (["buy"] as const);
        return (
          <article className="business-opportunity" key={d.id}>
            <h4>{d.name}</h4>
            <p>
              {s.zones[d.zone].name} ·{" "}
              {b ? (b.status === "struggling" ? "Losing money" : b.status === "profitable" ? "Making money" : b.status === "sold" ? "Sold" : b.status === "closed" ? "Closed" : "Just opened") : `For sale · $${d.cost.toLocaleString()}`}
            </p>
            <p className="muted">
              {d.description} Usually takes in about ${d.revenue} a day and
              spends about ${d.expenses}.
            </p>
            {b && (
              <p>
                {b.provenance === "clean" ? "Clean money" : "Street money"} ·
                Condition {Math.round(b.condition)}% · Yesterday ${b.lastNet} ·
                All time ${b.totalNet} · Worth ${a?.value ?? 0} · Steady income $
                {a?.recurringIncome ?? 0}/day
              </p>
            )}
            {actions.map((action) => {
              const error = businessError(s, d.id, action);
              return (
                <div className="strategy-action" key={action}>
                  <button
                    disabled={!!error}
                    onClick={() => r.apply(businessAction(s, d.id, action))}
                  >
                    {action === "buy"
                      ? "Buy"
                      : action === "maintain"
                        ? "Maintain · $120"
                        : action === "sell"
                          ? `Sell · $${a?.value}`
                          : "Close"}{" "}
                    {d.name} · 1 AP
                  </button>
                  {error && <small>{playerText(s, error)}</small>}
                </div>
              );
            })}
            {b && (
              <details>
                <summary>Last week</summary>
                {b.history
                  .slice(-7)
                  .reverse()
                  .map((h, i) => (
                    <p key={i}>
                      Day {h.day} · took in ${h.revenue}, spent ${h.expenses}{" "}
                      · ${h.net}
                    </p>
                  ))}
              </details>
            )}
          </article>
        );
      })}
      {r.message && <p role="status">{playerText(s, r.message)}</p>}
    </section>
  );
}
export function RetirementPanel({ s, onChange }: Props) {
  const r = useResult(onChange),
    v = legitimateProgress(s);
  return (
    <section
      className="panel retirement-panel"
      aria-label="Legitimate Exit progress"
    >
      <p className="eyebrow">A LIFE OF YOUR OWN</p>
      <h3>Walk away clean</h3>
      {s.street.arrears > 0 && (
        <button
          disabled={
            !!s.end ||
            player(s).status !== "active" ||
            player(s).wallet.clean + player(s).wallet.illicit < s.street.arrears
          }
          onClick={() => r.apply(payArrears(s))}
        >
          Pay what you’re behind on · ${s.street.arrears}
        </button>
      )}
      <p>
        Clean savings ${Math.floor(v.wealth).toLocaleString()} of $100,000 ·
        Honest income ${v.income} of $24 a day · Days living straight{" "}
        {s.strategic.lawfulStreak} of {B.lawfulSustainDays}
      </p>
      <ul>
        {v.missing.map((m) => (
          <li key={playerText(s, m)}>{playerText(s, m)}</li>
        ))}
      </ul>
      {!v.missing.length && <p>You could walk away now. It’s your call.</p>}
      <button
        disabled={!!s.end || !!v.missing.length}
        onClick={() => r.apply(retire(s))}
      >
        Walk away
      </button>
      {r.message && <p role="status">{playerText(s, r.message)}</p>}
    </section>
  );
}
