import { ROBBERY_TARGETS, PAWN_LOCATION } from "../../content/robberyCareer";
import { pabloError } from "../../systems/StreetAccess";
import { LifePerson, LifePlace } from "../../ui/StreetLife";
import { KnownCharacterLocation } from "../../ui/KnownCharacterLocation";
import { PlugEntry, isPlug, plugDebt, plugStatus } from "../../ui/PlugEntry";
import { boardPeople } from "../people";
import type { ReactNode } from "react";
import type { GameState, ZoneId } from "../../core/GameState";
import type { Action } from "../../core/ActionEngine";
import { businessAction, businessError } from "../../systems/Businesses";
import { BUSINESSES } from "../../content/strategy";
import { THEMES } from "../../ui/theme";
import { ZONE_ORDER, blockById } from "../../city3d/layout";
import { KIND_ICON, KIND_LABEL, LOCATIONS, locationById } from "../locations";
import { placeActions, placeFacts, placePeople } from "../interactions";
import { availableActions, validateAction } from "../../core/ActionEngine";
import {
  assessRisk,
  presenceOf,
  HAIR,
  TOPS,
  BUILDS,
  SKIN_TONES,
  type Appearance,
  type Risk,
} from "../presence";
import type { BoardView } from "../viewModel";
import type { Focus, Lens, TimeOfDay } from "../BoardRenderer";

const band = (n: number, words: string[]) =>
  words[n < 20 ? 0 : n < 45 ? 1 : n < 70 ? 2 : 3];

export const blockLabel = (id: string) => {
  const b = blockById(id);
  return b ? `Block ${b.col + 1}·${b.row + 1}` : "Block";
};

/** Breadcrumb, lenses and time of day, floating over the city. */
export function BoardControls({
  s,
  busy = false,
  endDay,
  focus,
  setFocus,
  lens,
  setLens,
  time,
  setTime,
}: {
  s: GameState;
  busy?: boolean;
  endDay: () => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  lens: Lens;
  setLens: (l: Lens) => void;
  time: TimeOfDay;
  setTime: (t: TimeOfDay) => void;
}) {
  const place = focus.place ? locationById(focus.place) : null;
  const crumbs: { label: string; to: Focus }[] = [
    { label: "Stixx City", to: { zone: null, block: null, place: null } },
  ];
  if (focus.zone)
    crumbs.push({
      label: s.zones[focus.zone].name,
      to: { zone: focus.zone, block: null, place: null },
    });
  if (focus.block)
    crumbs.push({
      label: blockLabel(focus.block),
      to: { zone: focus.zone, block: focus.block, place: null },
    });
  if (place) crumbs.push({ label: place.name, to: focus });
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2].to : null;
  const lenses: { id: Lens; label: string }[] = [
    { id: "streets", label: "Streets" },
    { id: "influence", label: "Influence" },
    { id: "police", label: "Police" },
    { id: "opportunity", label: "Moves" },
  ];
  const times: TimeOfDay[] = ["dusk", "night", "day"];
  return (
    <div className="board-controls">
      <div className="board-crumbs" role="group" aria-label="Board location">
        {up && (
          <button
            className="board-up"
            aria-label="Zoom out"
            onClick={() => setFocus(up)}
          >
            ‹
          </button>
        )}
        <ol>
          {crumbs.map((c, i) => (
            <li key={c.label}>
              {i < crumbs.length - 1 ? (
                <button onClick={() => setFocus(c.to)}>{c.label}</button>
              ) : (
                <span aria-current="location">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
        <button
          className="advance board-end-day"
          onClick={endDay}
          disabled={!!s.end || busy}
          aria-label="End day"
        >
          <span className="advance-label">End day</span>{" "}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {!place && (
        <div className="board-toggles">
          <div className="board-lenses" role="group" aria-label="Map lens">
            {lenses.map((l) => (
              <button
                key={l.id}
                aria-pressed={lens === l.id}
                onClick={() => setLens(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            className="board-time"
            aria-label={`Time of day: ${time}. Change`}
            onClick={() =>
              setTime(times[(times.indexOf(time) + 1) % times.length])
            }
          >
            {time === "dusk" ? "🌆" : time === "night" ? "🌙" : "☀️"}
          </button>
        </div>
      )}
    </div>
  );
}

/** District quick-select; doubles as the accessible district list. */
export function DistrictChips({
  s,
  focus,
  setFocus,
}: {
  s: GameState;
  focus: Focus;
  setFocus: (f: Focus) => void;
}) {
  return (
    <div
      className="district-chips"
      role="group"
      aria-label="Five neighborhoods of Stixx City"
    >
      {ZONE_ORDER.map((id) => {
        const z = s.zones[id],
          t = s.strategic.territories[id];
        const presence = z.organizations
          .map((f) => s.factions[f].name)
          .join(" / ");
        const colors = z.organizations.length
          ? z.organizations.map((f) => THEMES[f].accent)
          : ["#A8ADB3"];
        return (
          <button
            key={id}
            aria-label={`Select ${z.name}`}
            aria-pressed={focus.zone === id}
            aria-describedby={`chip-desc-${id}`}
            onClick={() => setFocus({ zone: id, block: null, place: null })}
          >
            <span id={`chip-desc-${id}`} hidden>
              {`${z.controller ? `Controlled by ${s.factions[z.controller].name}.` : "No single controller."}${presence ? ` Faction presence: ${presence}.` : " Unclaimed."}`}
            </span>
            <span className="chip-colors" aria-hidden="true">
              {colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <span>{z.name}</span>
            {t.contested && (
              <small className="chip-contested" aria-hidden="true">
                !
              </small>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A block: who shows their colors here, and what's on it. */
export function BlockSheet({
  s,
  view,
  blockId,
  setFocus,
}: {
  s: GameState;
  view: BoardView;
  blockId: string;
  setFocus: (f: Focus) => void;
}) {
  const b = view.blocks[blockId];
  if (!b) return null;
  const z = s.zones[b.zone];
  const holder = b.faction ? s.factions[b.faction].name : null;
  return (
    <section
      className="panel board-card"
      aria-label={`${z.name} ${blockLabel(blockId)}`}
      style={{ borderTopColor: b.color }}
    >
      <p className="eyebrow">
        {z.name} · {blockLabel(blockId)}
      </p>
      <h3>{holder ? `${holder} block` : "Neutral block"}</h3>
      <p>
        {holder
          ? b.contested
            ? `${holder} marks are here, but rivals are pushing in. Expect friction.`
            : `${holder} colors are on the walls ${b.strength > 0.6 ? "and on the corners" : "but the hold is light"}.`
          : "No organization has put its name on these walls."}
      </p>
      <p className="board-facts">
        Police {band(b.police, ["minimal", "light", "elevated", "heavy"])} ·
        Street activity{" "}
        {band(view.zones[b.zone].streetActivity, [
          "quiet",
          "steady",
          "busy",
          "crowded",
        ])}
      </p>
      {b.locations.length > 0 ? (
        <ul className="board-place-list" aria-label="Places on this block">
          {b.locations.map((id) => {
            const l = locationById(id)!;
            const st = view.places[id];
            return (
              <li key={id}>
                <button
                  onClick={() =>
                    setFocus({ zone: l.zone, block: blockId, place: id })
                  }
                >
                  <span aria-hidden="true">{KIND_ICON[l.kind]}</span>
                  <strong>{l.name}</strong>
                  <small>
                    {st?.live
                      ? st.actions
                        ? `${st.actions} moves`
                        : KIND_LABEL[l.kind]
                      : "Coming soon"}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">
          Homes and storefronts. Nothing here needs you today.
        </p>
      )}
    </section>
  );
}

/** A place: what it is, what you can do there now, who's around. */
export function PlaceSheet({
  s,
  view,
  placeId,
  renderAction,
  renderStreet,
  openPerson,
  showPolitics,
  setState,
  openStoryline,
  goHere,
  busy,
  targetId,
}: {
  s: GameState;
  view: BoardView;
  placeId: string;
  targetId?: string | null;
  renderAction: (a: Action) => ReactNode;
  renderStreet: (zone: ZoneId) => ReactNode;
  openPerson: (id: string) => void;
  showPolitics: (zone: ZoneId) => void;
  setState: (s: GameState) => void;
  openStoryline?: () => void;
  goHere: () => void;
  busy: boolean;
}) {
  const l = locationById(placeId);
  if (!l) return null;
  const z = view.zones[l.zone];
  const st = view.places[l.id];
  const actions = placeActions(s, l);
  const people = placePeople(s, l);
  const facts = placeFacts(s, l);
  const business = l.links.business
    ? BUSINESSES.find((b) => b.id === l.links.business)
    : null;
  const owned =
    business &&
    s.strategic.businesses.find(
      (b) =>
        b.definition === business.id && !["sold", "closed"].includes(b.status),
    );
  const block =
    view.blocks[
      Object.keys(view.blocks).find((id) =>
        view.blocks[id].locations.includes(l.id),
      ) ?? ""
    ];
  const holder =
    (l.faction ?? block?.faction)
      ? s.factions[(l.faction ?? block?.faction)!].name
      : null;
  return (
    <section
      className="panel board-card place-card"
      aria-label={l.name}
      style={{
        borderTopColor: block?.faction ? block.color : z.controllerColor,
      }}
    >
      <p className="eyebrow">
        <span aria-hidden="true">{KIND_ICON[l.kind]}</span> {z.name} ·{" "}
        {KIND_LABEL[l.kind]}
        {holder ? ` · ${holder} turf` : ""}
      </p>
      <div className="inspector-title">
        <h3>{l.name}</h3>
        {presenceOf(s).location === l.id ? (
          <span className="you-here">You're here</span>
        ) : (
          <button className="go-here" onClick={goHere} disabled={busy}>
            Go here
          </button>
        )}
      </div>
      <LifePlace s={s} location={l.id} change={setState} targetId={targetId} />
      <RiskBadge risk={assessRisk(s, l.id)} />
      <p>{l.description}</p>
      {facts.map((f) => (
        <p className="board-facts" key={f}>
          {f}
        </p>
      ))}
      {l.links.incident &&
        s.incidents[l.links.incident]?.status === "active" &&
        openStoryline && (
          <button className="secondary" onClick={openStoryline}>
            Open {s.incidents[l.links.incident].title} storyline →
          </button>
        )}
      {actions.length > 0 && (
        <div
          className="board-actions inspector-tiles quick-moves"
          aria-label={`Moves at ${l.name}`}
          role="group"
        >
          {actions.map((a) => renderAction(a))}
        </div>
      )}
      {business && (
        <div className="board-business">
          <h4>{business.name}</h4>
          <p className="muted">{business.description}</p>
          <div className="board-business-actions">
            {(owned ? (["maintain", "sell"] as const) : (["buy"] as const)).map(
              (kind) => {
                const error = businessError(s, business.id, kind);
                return (
                  <button
                    key={kind}
                    disabled={!!error}
                    title={error ?? undefined}
                    onClick={() => {
                      const r = businessAction(s, business.id, kind);
                      if (!r.error) setState(r.state);
                    }}
                  >
                    {kind === "buy"
                      ? `Buy · $${business.cost.toLocaleString()}`
                      : kind === "maintain"
                        ? "Maintain · $120"
                        : "Sell"}
                    {error && <small>{error}</small>}
                  </button>
                );
              },
            )}
          </div>
        </div>
      )}
      {l.links.street && (
        <div className="board-street">{renderStreet(l.zone)}</div>
      )}
      {people.length > 0 && (
        <div className="board-people">
          <h4>Around here</h4>
          <ul>
            {people.map((p) => (
              <li key={p.id}>
                <button onClick={() => openPerson(p.id)}>
                  <i
                    style={{
                      background: p.affiliation
                        ? THEMES[p.affiliation].accent
                        : "#A8ADB3",
                    }}
                    aria-hidden="true"
                  />
                  <strong>{p.name}</strong>
                  <small>
                    {p.known ? `Trust ${Math.round(p.trust)}` : "Not met yet"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {l.links.politics && (
        <button className="text-button" onClick={() => showPolitics(l.zone)}>
          Read {z.name} politics →
        </button>
      )}
      {(l.status === "planned" ||
        (!ROBBERY_TARGETS.some((t) => t.location === l.id) &&
          l.id !== PAWN_LOCATION &&
          !actions.length &&
          !business &&
          !l.links.street &&
          !people.length &&
          !l.links.politics)) && (
        <p className="board-planned">
          <strong>Coming to Stixx City</strong>
          {l.planned ?? "Nothing to do here yet."}
        </p>
      )}
      {!st?.live &&
        l.status === "live" &&
        l.id !== PAWN_LOCATION &&
        !ROBBERY_TARGETS.some((t) => t.location === l.id) && (
          <p className="muted">Nothing needs you here right now.</p>
        )}
    </section>
  );
}

export const PLACES_IN = (zone: ZoneId) =>
  LOCATIONS.filter((l) => l.zone === zone);

/** Every place in a district, live ones first: the list view of the board. */
export function DistrictPlaces({
  s,
  view,
  zone,
  setFocus,
}: {
  s: GameState;
  view: BoardView;
  zone: ZoneId;
  setFocus: (f: Focus) => void;
}) {
  const places = LOCATIONS.filter((l) => l.zone === zone).sort(
    (a, b) =>
      Number(view.places[b.id]?.live) - Number(view.places[a.id]?.live) ||
      (view.places[b.id]?.actions ?? 0) - (view.places[a.id]?.actions ?? 0),
  );
  const z = view.zones[zone];
  return (
    <section
      className="panel board-card board-district-places"
      aria-label={`Places in ${s.zones[zone].name}`}
      style={{ borderTopColor: z.controllerColor }}
    >
      <p className="eyebrow">{s.zones[zone].subtitle}</p>
      <h3>Places in {s.zones[zone].name}</h3>
      <ul className="board-place-list">
        {places.map((l) => {
          const st = view.places[l.id];
          return (
            <li key={l.id}>
              <button
                onClick={() => setFocus({ zone, block: null, place: l.id })}
              >
                <span aria-hidden="true">{KIND_ICON[l.kind]}</span>
                <strong>{l.name}</strong>
                <small>
                  {st?.owned
                    ? "Yours"
                    : st?.employed
                      ? "Your job"
                      : st?.live
                        ? st.actions
                          ? `${st.actions} move${st.actions > 1 ? "s" : ""}`
                          : KIND_LABEL[l.kind]
                        : "Coming soon"}
                </small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const RISK_LABEL: Record<Risk["level"], string> = {
  safe: "Safe",
  watchful: "Watchful",
  tense: "Tense",
  hostile: "Hostile",
};
/** How exposed you'd be here: turf, contest, police vs heat, notoriety. */
export function RiskBadge({
  risk,
  compact = false,
}: {
  risk: Risk;
  compact?: boolean;
}) {
  return (
    <div
      className={`risk-badge risk-${risk.level} ${compact ? "compact" : ""}`}
      aria-label={`Risk here: ${RISK_LABEL[risk.level]}`}
    >
      <strong>{RISK_LABEL[risk.level]}</strong>
      {!compact && risk.reasons[0] && (
        <span>{risk.reasons.slice(0, 2).join(" ")}</span>
      )}
    </div>
  );
}

/** A person on the board: who they are to you and what you can do together. */
export function PersonInspector({
  s,
  personId,
  onChange,
  renderAction,
  openProfile,
  openPlug,
  goTo,
}: {
  s: GameState;
  personId: string;
  onChange: (s:GameState)=>void;
  renderAction: (a: import("../../core/ActionEngine").Action) => ReactNode;
  openProfile: (id: string) => void;
  /** Open the plug conversation (terms or repayment). */
  openPlug?: (id: string) => void;
  /** Walk the player to a place on the board. */
  goTo?: (placeId: string) => void;
}) {
  const c = s.characters[personId];
  if (!c) return null;
  const p = s.characters[s.playerId];
  const known = p.known.includes(c.id);
  const rel = c.relationships[p.id];
  const moves = availableActions(s)
    .filter((a) => a.target === c.id && !pabloError(s,c.id))
    .sort(
      (a, b) => Number(!!validateAction(s, a)) - Number(!!validateAction(s, b)),
    );
  return (
    <section
      className="panel board-card person-card"
      aria-label={c.alias ?? c.name}
      style={{
        borderTopColor: c.affiliation
          ? THEMES[c.affiliation].accent
          : "#A8ADB3",
      }}
    >
      <p className="eyebrow">
        {s.zones[c.home].name} ·{" "}
        {c.affiliation ? s.factions[c.affiliation].name : "Independent"}
      </p>
      <div className="inspector-title">
        <h3>{known ? (c.alias ?? c.name) : "Someone from around here"}</h3>
        {known && (
          <button className="go-here" onClick={() => openProfile(c.id)}>
            Profile
          </button>
        )}
      </div>
      <p>
        {known
          ? c.description
          : "You haven't been introduced. Ask around, or get someone you know to vouch for you."}
      </p>
      {known && <KnownCharacterLocation s={s} id={c.id} />}
      {known && <LifePerson s={s} id={c.id} change={onChange} />}
      {known && rel && c.id !== "quanny" && (
        <p className="board-facts">
          Trust {Math.round(rel.trust)} · Respect {Math.round(rel.respect)}
          {rel.grievance > 10
            ? ` · Grievance ${Math.round(rel.grievance)}`
            : ""}
        </p>
      )}
      {known && openPlug && isPlug(s, c.id) && (
        <PlugBlock s={s} id={c.id} open={openPlug} goTo={goTo} />
      )}
      {moves.length > 0 && (
        <div
          className="move-groups"
          role="group"
          aria-label={`Moves with ${c.alias ?? c.name}`}
        >
          {MOVE_GROUPS.map(([label, types]) => {
            const row = moves.filter((a) =>
              label === "Talk"
                ? types.includes(a.type) ||
                  !MOVE_GROUPS.some(([, t]) => t.includes(a.type))
                : types.includes(a.type),
            );
            return row.length ? (
              <div key={label} className="move-group">
                <p className="eyebrow">{label}</p>
                <div className="board-actions inspector-tiles quick-moves">
                  {row.map((a) => renderAction(a))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}

/** Person-card moves, grouped so a dozen stay readable. Unlisted types go under Talk. */
const MOVE_GROUPS: [string, string[]][] = [
  ["Talk", ["contact", "inquire", "introduce", "socialize", "favor"]],
  ["Business", ["offer", "transfer", "settlement", "standing", "affiliate", "quanny"]],
  ["Crew", ["recruit", "remove", "assign"]],
];

/** A plug on the board: where to find them, and the deal itself. */
function PlugBlock({
  s,
  id,
  open,
  goTo,
}: {
  s: GameState;
  id: string;
  open: (id: string) => void;
  goTo?: (placeId: string) => void;
}) {
  const at = boardPeople(s).find((x) => x.id === id);
  const place = at ? locationById(at.placeId) : null;
  const here = !!place && presenceOf(s).location === place.id;
  return (
    <div className="plug-block" aria-label="Plug">
      <p className="eyebrow">Plug</p>
      {place && (
        <p className="board-facts">
          {here ? `With you at ${place.name}` : `At ${place.name}`}
          {!here && goTo && (
            <>
              {" "}
              <button className="text-button" onClick={() => goTo(place.id)}>
                Walk there →
              </button>
            </>
          )}
        </p>
      )}
      <PlugEntry s={s} id={id} open={open} />
    </div>
  );
}

/** Plugs the player knows: status, and a tap to find them on the board. */
export function PlugList({
  s,
  onPlug,
  zone,
}: {
  s: GameState;
  onPlug: (id: string) => void;
  /** Only plugs found in this neighborhood. */
  zone?: ZoneId;
}) {
  const p = s.characters[s.playerId];
  const where = new Map(boardPeople(s).map((x) => [x.id, x.placeId]));
  const plugs = p.known
    .filter((id) => s.characters[id] && isPlug(s, id))
    .filter((id) => !zone || locationById(where.get(id) ?? "")?.zone === zone)
    .sort(
      (a, b) =>
        Number(!!plugDebt(s, b)) - Number(!!plugDebt(s, a)) ||
        Number(p.connections.includes(b)) - Number(p.connections.includes(a)),
    )
    .slice(0, 6);
  if (!plugs.length) return null;
  return (
    <div className="plug-list" role="group" aria-label={zone ? `Plugs in ${s.zones[zone].name}` : "Your plugs"}>
      <p className="eyebrow">{zone ? `Plugs in ${s.zones[zone].name}` : "Your plugs"}</p>
      {plugs.map((id) => {
        const c = s.characters[id],
          place = locationById(where.get(id) ?? "");
        return (
          <button key={id} className="plug-row" onClick={() => onPlug(id)}>
            <strong>{c.alias ?? c.name}</strong>
            <small>
              {place ? `${place.name} · ` : ""}
              {plugStatus(s, id)}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** The player's own card: where they stand and what that means. */
export function PresenceCard({
  s,
  onFind,
  onLook,
  onPlug,
}: {
  s: GameState;
  onFind: () => void;
  onLook: () => void;
  /** Find a plug on the board and open their card. */
  onPlug?: (id: string) => void;
}) {
  const pr = presenceOf(s);
  const l = locationById(pr.location)!;
  const risk = assessRisk(s, pr.location);
  return (
    <section
      className="panel board-card presence-card"
      aria-label="Your whereabouts"
    >
      <p className="eyebrow">You are at</p>
      <div className="inspector-title">
        <h3>{l.name}</h3>
        <button className="go-here" onClick={onFind}>
          Find me
        </button>
      </div>
      <p className="muted">
        {s.zones[l.zone].name} · since day {pr.arrivedDay}
        {pr.trail.length
          ? ` · came from ${locationById(pr.trail[pr.trail.length - 1].location)?.name}`
          : ""}
      </p>
      <RiskBadge risk={risk} />
      <button className="text-button" onClick={onLook}>
        Change your look →
      </button>
      {onPlug && <PlugList s={s} onPlug={onPlug} />}
    </section>
  );
}

const TOP_COLORS = [
  "#2b2f36",
  "#d8d2c4",
  "#7a1f2b",
  "#3a5a7a",
  "#2f5a3a",
  "#c9a04a",
  "#5a2a6a",
  "#cd7935",
];
const BOTTOM_COLORS = ["#3a4a6a", "#2a2a2a", "#6a5a44", "#8a8f94", "#4a3a2c"];
const HAIR_COLORS = [
  "#1c1612",
  "#3a2416",
  "#6a4428",
  "#b08a5a",
  "#d9d2c4",
  "#8e51cb",
];
/** First pass of character customization: drives the figure on the board. */
export function AppearancePanel({
  appearance,
  onChange,
  onClose,
}: {
  appearance: Appearance;
  onChange: (a: Appearance) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) =>
    onChange({ ...appearance, [k]: v });
  const swatches = (
    label: string,
    list: string[],
    key: "skin" | "topColor" | "bottomColor" | "hairColor",
  ) => (
    <fieldset className="look-row">
      <legend>{label}</legend>
      {list.map((c) => (
        <button
          key={c}
          aria-label={`${label} ${c}`}
          aria-pressed={appearance[key] === c}
          className="swatch"
          style={{ background: c }}
          onClick={() => set(key, c)}
        />
      ))}
    </fieldset>
  );
  const options = <T extends string>(
    label: string,
    list: readonly T[],
    key: "hair" | "top" | "build",
  ) => (
    <fieldset className="look-row">
      <legend>{label}</legend>
      {list.map((o) => (
        <button
          key={o}
          aria-pressed={appearance[key] === o}
          className="look-option"
          onClick={() => set(key, o as Appearance[typeof key])}
        >
          {o}
        </button>
      ))}
    </fieldset>
  );
  return (
    <section className="panel board-card look-panel" aria-label="Your look">
      <div className="inspector-title">
        <h3>Your look</h3>
        <button className="go-here" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="muted">
        How you show up on the streets. A full character creator will replace
        this.
      </p>
      {swatches("Skin", SKIN_TONES, "skin")}
      {options("Hair", HAIR, "hair")}
      {swatches("Hair color", HAIR_COLORS, "hairColor")}
      {options("Top", TOPS, "top")}
      {swatches("Top color", TOP_COLORS, "topColor")}
      {swatches("Pants", BOTTOM_COLORS, "bottomColor")}
      {options("Build", BUILDS, "build")}
      <fieldset className="look-row">
        <legend>Chain</legend>
        <button
          className="look-option"
          aria-pressed={appearance.chain}
          onClick={() => set("chain", !appearance.chain)}
        >
          {appearance.chain ? "On" : "Off"}
        </button>
      </fieldset>
    </section>
  );
}
