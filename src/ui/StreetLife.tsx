import { playerText, playerReason, jobName } from "../presentation/PlayerInformation";
import { CareerPlace, CareerPerson, CareerControls } from "./RobberyCareer";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { player, type GameState } from "../core/GameState";
import { LOCATIONS, locationById } from "../board/locations";
import { presenceOf } from "../board/presence";
import { TRIO, pabloError } from "../systems/StreetAccess";
import {
  atPerson,
  rioIntroductionError,
  introduceRio,
  tributeError,
  payTribute,
  lawfulLewis,
  safeStory,
} from "../systems/StreetLife";
import { LIFE_TALKS } from "../content/streetLifeEncounters";
import { record } from "../core/EventLog";
import {
  PREPARATION,
  ROBBERY_TYPES,
  purchasePrep,
  purchasePrepError,
  offerRobbery,
  robberySourceError,
  robberyOfferError,
  robberyStartError,
  startRobbery,
  robberyInput,
  pauseRobbery,
  leaveRobbery,
  equipmentContactError,
  obtainContactEquipment,
  type PrepId,
} from "../systems/Robbery";
export function TutorialObjective({
  s,
  go,
}: {
  s: GameState;
  go: (id: string) => void;
}) {
  const t = s.streetLife;
  if (!t || t.legacy || t.lesson !== "waiting") return null;
  return (
    <section className="panel" aria-label="First steps">
      <strong>First steps</strong>
      <p>
        {t.decision === "unasked"
          ? "Speak with Mega about the Chains."
          : !t.workEvent
            ? "Visit a workplace and submit a valid application (unpaid; scheduled shifts after hiring), or finish a paid local gig."
            : "Bring your starter stock to Mega’s trapping lesson at the Southside Lot."}
      </p>
      {!t.workEvent ? (
        LOCATIONS.filter(
          (l) =>
            l.links.gig ||
            (l.links.job &&
              (l.zone === player(s).home || l.links.job === "warehouse")),
        ).map((l) => (
          <button key={l.id} onClick={() => go(l.id)}>
            Visit {l.name}
            {l.links.gig ? " · paid gig" : " · hiring"}
          </button>
        ))
      ) : (
        <button onClick={() => go("south.the-lot")}>
          Visit the Southside Lot
        </button>
      )}
      {t.workEvent && !t.giftLot && !t.starterLot && (
        <p>
          {t.initialDecision === "promise"
            ? "Keep exploring the City and talk to people you meet."
            : "Meet Mega physically on Southside: six Pink Magic, $90 cash only."}
        </p>
      )}
    </section>
  );
}
export function LifePerson({
  s,
  id,
  change,
}: {
  s: GameState;
  id: string;
  change: (s: GameState) => void;
}) {
  if (pabloError(s, id))
    return <p className="disabled-reason">{playerReason(s, pabloError(s, id))}</p>;
  const here = atPerson(s, id);
  const talks = LIFE_TALKS.filter(
    (t) => t.person === id && t.when(s) && !s.streetLife?.scenes[t.key],
  );
  const apply = (fn: (s: GameState) => void) => {
    const n = structuredClone(s);
    fn(n);
    change(n);
  };
  return (
    <section aria-label="Street-life encounters">
      <CareerPerson s={s} id={id} change={change} />
      {!here && <p>Meet this person on their City spot to talk business.</p>}
      {talks.map((t) => (
        <button
          key={t.key}
          disabled={!here || !safeStory(s)}
          onClick={() =>
            apply((n) => {
              const e = record(n, "social", t.text, [n.playerId, id]);
              n.streetLife!.scenes[t.key] = e.id;
              for (const e of n.encounters)
                if (e.status === "active") {
                  e.status = "pending";
                  e.deferred = true;
                }
              n.encounters.push({
                id: `life-talk-${n.nextId++}`,
                definitionId: `life-${t.key}`,
                participants: [id],
                createdDay: n.day,
                status: "active",
                selectedResponses: [],
                followUpPending: false,
                deferred: false,
              });
            })
          }
        >
          {t.label}
        </button>
      ))}
      {TRIO.includes(id) && (
        <>
          <button
            disabled={!!rioIntroductionError(s, id)}
            onClick={() => apply((n) => introduceRio(n, id))}
          >
            Ask for a Rio street introduction · 1 AP
          </button>
          <p>{playerReason(s, rioIntroductionError(s, id))}</p>
        </>
      )}
      {id === "contact-angels" && (
        <>
          <p>
            Angels territory permission: $12 paid up front, valid today and the
            next two days. Product and reputation are separate.
          </p>
          <button
            disabled={!!tributeError(s)}
            onClick={() => apply(payTribute)}
          >
            Agree and pay $12 territory tribute
          </button>
          <p>{playerReason(s, tributeError(s))}</p>
        </>
      )}
      {(TRIO.includes(id) || id === "quanny") && (
        <>
          <button
            disabled={!!robberyOfferError(s, id)}
            onClick={() => change(offerRobbery(s, id))}
          >
            Ask about an optional robbery job
          </button>
          <p>{playerReason(s, robberyOfferError(s, id))}</p>
          <button
            disabled={!!equipmentContactError(s, id)}
            onClick={() => change(obtainContactEquipment(s, id))}
          >
            Ask contact for Law-19 · $75 · 1 AP
          </button>
          <p>{playerReason(s, equipmentContactError(s, id))}</p>
        </>
      )}
      {id === "mr-lewis" && !s.streetLife?.scenes.lewis && (
        <button
          disabled={!here || !safeStory(s) || s.ap < 1}
          onClick={() => apply(lawfulLewis)}
        >
          Help Mr. Lewis deliver groceries · $38 · 1 AP
        </button>
      )}
    </section>
  );
}
export function LifePlace({
  s,
  location,
  change,
  onStart,
  targetId,
}: {
  s: GameState;
  location: string;
  change: (s: GameState) => void;
  onStart?: () => void;
  targetId?: string | null;
}) {
  const jobs =
    s.robberies?.jobs.filter(
      (j) => j.location === location && j.status === "offered",
    ) ?? [];
  return (
    <>
      <CareerPlace s={s} location={location} change={change} focus={targetId} />
      {Object.entries(PREPARATION)
        .filter(([, d]) => d.location === location)
        .map(([key, d]) => {
          const id = key as PrepId;
          const error = purchasePrepError(s, id, location);
          return (
            <section key={id} aria-label={`${d.name} supplies`}>
              <p>
                {d.name} · {s.robberies?.items[id] ?? 0} held · consumed on an
                attempt
              </p>
              <button
                disabled={!!error}
                onClick={() => change(purchasePrep(s, id, location))}
              >
                Buy {d.name} · ${d.price} · 1 AP
              </button>
              <button
                disabled={!!purchasePrepError(s, id, location, 3)}
                onClick={() => change(purchasePrep(s, id, location, 3))}
              >
                Buy 3 {d.name} · ${d.price * 3} · 1 AP
              </button>
              {error && <p className="disabled-reason">{playerReason(s, error)}</p>}
            </section>
          );
        })}
      {jobs.map((j) => {
        const error = robberyStartError(s, j.id),
          d = ROBBERY_TYPES[j.kind];
        return (
          <section key={j.id} aria-label="Robbery opportunity">
            <h3>
              {jobName(s, j.id)}
            </h3>
            <p>
              From {s.characters[j.source].name} · expires day {j.expiresDay} ·
              contents unknown · failure can mean no loot,
              injury or arrest.
            </p>
            <p>
              Bring{" "}
              {d.prep.map((id) => PREPARATION[id as PrepId].name).join(", ")}
              {d.weapon ? ` and equipped ${d.weapon}` : ""}.
            </p>
            <button
              disabled={!!error}
              onClick={() => {
                const r = startRobbery(s, j.id);
                change(r.state);
                if (!r.error) onStart?.();
              }}
            >
              Begin {d.name} session · 1 AP
            </button>
            {error && <p className="disabled-reason">{playerReason(s, error)}</p>}
          </section>
        );
      })}
    </>
  );
}
export function RobberyPlayback({
  s,
  change,
  visible,
}: {
  s: GameState;
  change: Dispatch<SetStateAction<GameState | null>>;
  visible: boolean;
}) {
  const a = s.activeRobbery;
  const [answer, setAnswer] = useState<number[]>([]);
  useEffect(() => {
    setAnswer([]);
  }, [a?.id, a?.cursor]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden)
        change((cur) =>
          cur?.activeRobbery
            ? pauseRobbery(cur, cur.activeRobbery.id, true)
            : cur,
        );
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [change]);
  useEffect(() => {
    if (!visible && a?.status === "active")
      change((cur) => (cur ? pauseRobbery(cur, a.id, true) : cur));
  }, [visible, a?.id, a?.status, change]);
  if (!a || !visible || player(s).status !== "active") return null;
  const input = (answer: string) =>
    change((cur) =>
      cur && !document.hidden ? robberyInput(cur, a.id, a.cursor, answer) : cur,
    );
  const colors = ["Amber", "Blue", "Violet"];
  return (
    <section
      className="session-playback robbery-playback"
      aria-label="Robbery session"
      data-cursor={a.cursor}
    >
      <strong>
        {locationById(a.location)?.name} ·{" "}
        {a.status === "ended"
          ? "Operation ended"
          : a.career
            ? "Robbery encounter"
            : `Beat ${a.cursor + 1}/3`}
      </strong>
      <p role="status">{playerText(s, a.text)}</p>
      {a.status === "ended" ? (
        <>
          <p>
            ${a.loot} actual loot · {s.ap} AP left
          </p>
          <button
            onClick={() =>
              change((cur) =>
                cur?.activeRobbery?.status === "ended"
                  ? { ...cur, activeRobbery: undefined }
                  : cur,
              )
            }
          >
            Return to City
          </button>
        </>
      ) : a.status === "paused" ? (
        <button
          onClick={() =>
            change((cur) => (cur ? pauseRobbery(cur, a.id, false) : cur))
          }
        >
          Continue robbery session
        </button>
      ) : a.career ? (
        <>
          <CareerControls
            s={s}
            change={(next) =>
              change((cur) =>
                cur?.activeRobbery?.id === a.id &&
                cur.activeRobbery.cursor === a.cursor &&
                cur.activeRobbery.status === "active" &&
                !document.hidden
                  ? next
                  : cur,
              )
            }
            input={input}
          />
          <button
            onClick={() =>
              change((cur) => (cur ? pauseRobbery(cur, a.id, true) : cur))
            }
          >
            Pause robbery
          </button>
        </>
      ) : (
        <>
          {a.cursor === 0 && (
            <>
              <button onClick={() => input("patient")}>
                Wait and watch · lower pressure
              </button>
              <button onClick={() => input("rush")}>
                Rush the approach · higher pressure
              </button>
              <button onClick={() => input("withdraw")}>
                Withdraw before participating
              </button>
            </>
          )}
          {a.cursor === 1 && (
            <div aria-label="Fictional color memory puzzle">
              <p>Remember: {a.pattern.map((i) => colors[i]).join(" → ")}</p>
              <p>
                Your sequence:{" "}
                {answer.map((i) => colors[i]).join(" → ") || "none"}
              </p>
              <div className="session-controls">
                {colors.map((c, i) => (
                  <button
                    key={c}
                    disabled={answer.length >= 3}
                    onClick={() => setAnswer((v) => [...v, i])}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                disabled={answer.length !== 3}
                onClick={() => input(answer.join(","))}
              >
                Commit sequence once
              </button>
            </div>
          )}
          {a.cursor === 2 && (
            <>
              <button onClick={() => input("leave")}>
                Leave with partial proceeds · safer
              </button>
              <button onClick={() => input("push")}>
                Push for the full payment · more risk
              </button>
            </>
          )}
          <button
            onClick={() =>
              change((cur) => (cur ? pauseRobbery(cur, a.id, true) : cur))
            }
          >
            Pause robbery
          </button>
        </>
      )}
      {a.status !== "ended" && (
        <button
          onClick={() => change((cur) => (cur ? leaveRobbery(cur, a.id) : cur))}
        >
          Abandon attempt
        </button>
      )}
    </section>
  );
}
