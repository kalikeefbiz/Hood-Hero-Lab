import { KnownCharacterLocation } from "./KnownCharacterLocation";
import type { GameState } from "../core/GameState";
import { player } from "../core/GameState";
import { accessStatus } from "../systems/Relationships";
import { availableActions } from "../core/ActionEngine";
import { currentEmployment, absenceWarning } from "../systems/Employment";
import { JOBS } from "../content/jobs";
import { LOCATIONS, locationById } from "../board/locations";
import { boardPeople } from "../board/people";
import { isPlug, plugStatus } from "./PlugEntry";
import { EmploymentSummary } from "./EmploymentSummary";
import { StreetWork } from "./StreetWork";
export type ActionCategory = "Streets" | "Honest" | "Connects";

/**
 * Information only. Every action happens in the city, at a place or with a
 * person on the board; this tab says where, and "Find on map" takes you there.
 * (See docs/ACTIONS_TO_CITY.md and AGENTS.md section 0.)
 */
export function ActionsHub({
  s,
  category,
  setCategory,
  focus,
  setFocus,
  findPerson,
  findPlace,
}: {
  s: GameState;
  category: ActionCategory;
  setCategory: (v: ActionCategory) => void;
  focus: string;
  setFocus: (id: string) => void;
  /** Show a person on the board and open their card. */
  findPerson: (id: string) => void;
  /** Show a place on the board and open its card. */
  findPlace: (placeId: string) => void;
}) {
  const p = player(s),
    all = availableActions(s),
    c = s.characters[focus] ?? s.characters.mega,
    job = currentEmployment(s);
  const connected = p.connections.filter(
    (id) => s.characters[id] && id !== p.id,
  );
  const where = (filter: (l: (typeof LOCATIONS)[number]) => boolean) =>
    LOCATIONS.filter(filter);
  const placeRow = (placeId: string, title: string, detail: string) => {
    const l = locationById(placeId);
    return (
      <div className="known-contact find-row" key={`${placeId}-${title}`}>
        <strong>{title}</strong>
        <span>
          {l ? `${l.name} · ${s.zones[l.zone].name}` : ""}
          {detail ? ` · ${detail}` : ""}
        </span>
        {l && (
          <button className="text-button" onClick={() => findPlace(l.id)}>
            Find on map →
          </button>
        )}
      </div>
    );
  };
  const onBoard = new Set(boardPeople(s).map((x) => x.id));
  return (
    <div className={`actions-hub category-${category.toLowerCase()}`}>
      <div
        className="segmented action-categories"
        role="group"
        aria-label="Action categories"
      >
        {(["Streets", "Honest", "Connects"] as const).map((g) => (
          <button
            key={g}
            aria-pressed={category === g}
            className={category === g ? "active" : ""}
            onClick={() => setCategory(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <p className="city-hint">
        Everything here happens in the city. Find the place or person on the
        map to act.
      </p>
      {category === "Streets" && (
        <>
          <StreetWork s={s} connects={() => setCategory("Connects")} />
          <section className="panel find-list" aria-label="Where to work the street">
            <p className="eyebrow">Street spots</p>
            {where((l) => !!l.links.street).map((l) =>
              placeRow(l.id, l.name, "Start a session here"),
            )}
            <p className="eyebrow">Rest</p>
            {where((l) => !!l.links.rest && l.zone === p.home).map((l) =>
              placeRow(l.id, "Quiet afternoon", "Rest here"),
            )}
          </section>
        </>
      )}
      {category === "Honest" && (
        <>
          {absenceWarning(s) && (
            <p className="attendance-warning" role="status">
              {absenceWarning(s)}
            </p>
          )}
          <EmploymentSummary s={s} />
          <section className="panel find-list" aria-label="Where the work is">
            {job && (
              <>
                <p className="eyebrow">Your job</p>
                {where((l) => l.links.job === job.jobId).map((l) =>
                  placeRow(l.id, "Clock in · time off · quit", "At the workplace"),
                )}
              </>
            )}
            <p className="eyebrow">{job ? "Other employers" : "Hiring"}</p>
            {JOBS.filter((j) => j.id !== job?.jobId).flatMap((j) => {
              const offer = all.find((a) => a.type === "acceptJob" && a.jobId === j.id),
                open = all.some((a) => a.type === "apply" && a.jobId === j.id);
              return where((l) => l.links.job === j.id).map((l) =>
                placeRow(
                  l.id,
                  j.name,
                  offer ? "Offer waiting · accept in person" : open ? "Apply in person" : "Not hiring you right now",
                ),
              );
            })}
            <p className="eyebrow">Gigs</p>
            {where((l) => !!l.links.gig).map((l) =>
              placeRow(l.id, "Day gig", "Ask around here"),
            )}
          </section>
        </>
      )}
      {category === "Connects" && (
        <>
          <label className="person-selector">
            Connected contacts
            <select
              aria-label="Connected contacts"
              value={p.connections.includes(focus) ? focus : ""}
              onChange={(e) => setFocus(e.target.value)}
            >
              <option value="" disabled>
                Select a contact
              </option>
              {connected.map((id) => (
                <option key={id} value={id}>
                  {s.characters[id].alias ?? s.characters[id].name}
                </option>
              ))}
            </select>
          </label>
          <section
            className="panel connect-profile"
            aria-label="Selected contact"
          >
            <p className="eyebrow">
              {accessStatus(s, p.id, c.id).toUpperCase()}
            </p>
            <h3>{c.alias ?? c.name}</h3>
            <KnownCharacterLocation s={s} id={c.id} />
            <p>
              {s.zones[c.home].name} ·{" "}
              {c.affiliation ? s.factions[c.affiliation].name : "Independent"}
            </p>
            {c.relationships[p.id] && (
              <p className="board-facts">
                Trust {Math.round(c.relationships[p.id].trust)} · Respect{" "}
                {Math.round(c.relationships[p.id].respect)}
              </p>
            )}
            {isPlug(s, c.id) && <p className="board-facts">Plug · {plugStatus(s, c.id)}</p>}
            {onBoard.has(c.id) ? (
              <button onClick={() => findPerson(c.id)}>
                Find {c.alias ?? c.name} on map →
              </button>
            ) : (
              <p className="disabled-reason">Not out in the city right now.</p>
            )}
          </section>
          <details className="panel known-contacts">
            <summary>Known of · introductions needed</summary>
            {p.known
              .filter(
                (id) =>
                  !p.connections.includes(id) &&
                  s.characters[id] &&
                  id !== p.id,
              )
              .map((id) => (
                <div className="known-contact" key={id}>
                  <strong>
                    {s.characters[id].alias ?? s.characters[id].name}
                  </strong>
                  <span>{s.zones[s.characters[id].home].name} · Known of</span>
                  <small>
                    Ask an established connection for an introduction.
                    {id === "pablo" &&
                    s.incidents["the-chains"]?.status === "active"
                      ? " The Chains can be brought to him through City."
                      : ""}
                  </small>
                </div>
              ))}
          </details>
        </>
      )}
    </div>
  );
}
