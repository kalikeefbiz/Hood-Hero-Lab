// Bottom sheet that shows what the engine says can be done at a city anchor, and what happened.
// It only displays: every label, cost, refusal and outcome comes from Codex's location API and the
// engine's event log. Nothing is calculated or awarded here.
import type { CityAnchor } from "./anchors";
import type { LocationQuery, LocationResult, PreviewSession } from "./previewSession";
import type { LocationAction } from "../city/LocationInteractions";
import { JOBS } from "../content/jobs";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n)}`;

export interface PlacePanelHost {
  session: PreviewSession;
  /** Verified people for display (same list the API was given). */
  peopleAt(locationId: string): string[];
  onClose(): void;
}

export class PlacePanel {
  readonly root = el("section", "place");
  private anchor: CityAnchor | null = null;
  private lastResult: { label: string; result: LocationResult } | null = null;

  constructor(private host: PlacePanelHost) {
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    document.body.append(this.root);
  }

  get open() { return !this.root.hidden; }
  get current() { return this.anchor; }

  show(anchor: CityAnchor, note?: string) {
    this.anchor = anchor;
    this.lastResult = null;
    this.render(note);
    this.root.hidden = false;
    document.body.classList.add("place-open");
  }

  hide() {
    this.root.hidden = true;
    this.anchor = null;
    document.body.classList.remove("place-open");
    this.host.onClose();
  }

  refresh() { if (this.anchor) this.render(); }

  /** Who is here, as the card last showed it (to re-render when the simulation moves people). */
  shownPeople = "";

  private render(note?: string) {
    const a = this.anchor!;
    const s = this.host.session;
    const r = this.root;
    r.replaceChildren();
    r.dataset.anchor = a.id;

    const head = el("header");
    const titles = el("div", "titles");
    titles.append(el("h2", "", a.label));
    titles.append(el("small", "", [a.street, kindLabel(a), a.locationId ?? "scenery"].filter(Boolean).join(" · ")));
    const close = el("button", "close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.onclick = () => this.hide();
    head.append(titles, close);
    r.append(head);

    const p = s.player;
    r.append(el("p", "status", `Day ${s.state.day} · ${s.state.ap} AP · $${p.wallet.clean} clean · $${p.wallet.illicit} street`));
    if (note) r.append(el("p", "note", note));

    if (a.household) r.append(householdBlock(a, s));

    if (!a.locationId) {
      r.append(el("p", "empty", "Scenery for now. No game location is attached to this storefront yet."));
      return;
    }
    const q = s.query(a);
    const people = this.host.peopleAt(a.locationId);
    this.shownPeople = people.join(",");
    if (people.length) {
      const row = el("div", "people");
      row.append(el("span", "lbl", "Here now"));
      for (const id of people) row.append(el("span", "chip", s.state.characters[id]?.name ?? id));
      r.append(row);
    }
    if (q.politics) r.append(politicsBlock(q));
    if (q.error) r.append(el("p", "error", q.error));

    if (this.lastResult) r.append(resultBlock(this.lastResult.label, this.lastResult.result, s));

    // What you can do now first; everything the engine refuses goes in a fold, grouped by reason.
    const list = el("div", "actions");
    const ready = q.actions.filter((x) => !x.error);
    const blocked = q.actions.filter((x) => x.error);
    if (!q.actions.length && !q.politics) list.append(el("p", "empty", "Nothing the engine offers here right now."));
    else if (!ready.length && blocked.length) list.append(el("p", "empty", "Nothing available right now."));
    for (const act of ready) list.append(this.actionButton(a, act));
    r.append(list);
    if (blocked.length) {
      const fold = el("details", "blocked");
      fold.append(el("summary", "", `Not available now (${blocked.length})`));
      const reasons = new Map<string, LocationAction[]>();
      for (const x of blocked) reasons.set(x.error!, [...(reasons.get(x.error!) ?? []), x]);
      for (const [why, acts] of reasons) {
        fold.append(el("p", "why", why));
        const g = el("div", "actions");
        for (const act of acts) g.append(this.actionButton(a, act, false));
        fold.append(g);
      }
      r.append(fold);
    }

    const foot = el("footer");
    const day = el("button", "ghost", "Next day (test state)");
    day.type = "button";
    day.onclick = () => { s.nextDay(); this.lastResult = null; this.render(); };
    foot.append(day);
    r.append(foot);
  }

  private actionButton(a: CityAnchor, act: LocationAction, showWhy = true) {
    const s = this.host.session;
    const b = el("button", "act");
    b.type = "button";
    b.dataset.command = act.command.type;
    if (act.command.targetId) b.dataset.target = act.command.targetId;
    const top = el("span", "name", act.label);
    const target = targetName(act, s);
    if (target && !act.label.includes(target)) top.append(el("em", "", ` · ${target}`));
    const cost = [
      act.cost.ap ? `${act.cost.ap} AP` : "",
      act.cost.cash ? `$${act.cost.cash}` : "",
      act.proceeds ? `+$${act.proceeds}` : "",
    ].filter(Boolean).join(" · ");
    b.append(top);
    if (cost) b.append(el("span", "cost", cost));
    if (act.error) {
      b.disabled = true;
      if (showWhy) b.append(el("span", "why", act.error));
    }
    b.onclick = () => {
      const result = s.run(a, act.command);
      this.lastResult = { label: act.label + (target && !act.label.includes(target) ? ` · ${target}` : ""), result };
      this.render();
      this.root.scrollTop = 0;
    };
    return b;
  }
}

function kindLabel(a: CityAnchor) {
  if (a.kind === "home") return a.targetId ? "house · robbery lead" : "house";
  return a.kind === "place" ? "place" : a.kind;
}

function targetName(act: LocationAction, s: PreviewSession) {
  const id = act.command.targetId;
  if (act.detail && act.command.type === "buy") return act.detail;
  if (!id) return act.detail ?? "";
  const c = s.state.characters[id];
  if (c) return c.name;
  const job = JOBS.find((j) => j.id === id);
  if (job) return job.name;
  if (act.command.type === "respondEncounter") return "";
  return act.detail ?? "";
}

function householdBlock(a: CityAnchor, s: PreviewSession) {
  const h = a.household!;
  const box = el("div", "household");
  box.append(el("span", "lbl", `Household · ${h.kind}`));
  const names = [
    ...h.residents.map((id) => s.state.characters[id]?.name ?? id),
    ...h.canonResidents.map((id) => `${id} (canon, no engine record yet)`),
  ];
  box.append(el("p", "", names.length ? names.join(", ") : "Occupants not assigned yet."));
  box.append(el("p", "dim", h.note));
  return box;
}

function politicsBlock(q: LocationQuery) {
  const box = el("div", "politics");
  const t = q.politics!.territory;
  box.append(el("span", "lbl", "Who runs the Reservoir"));
  box.append(el("p", "big", q.politics!.controller?.name ?? "Nobody holds it"));
  box.append(el("p", "dim", `${t.contested ? "Contested" : "Not contested"} · lawful economy ${Math.round(t.lawfulEconomy)}`));
  return box;
}

function resultBlock(label: string, res: LocationResult, s: PreviewSession) {
  const box = el("div", res.error ? "result bad" : "result");
  box.append(el("span", "lbl", label));
  if (res.error) {
    box.append(el("p", "", res.error));
    return box;
  }
  const events = s.eventsOf(res);
  for (const e of events) box.append(el("p", "", e.text));
  const c = res.changes;
  const deltas: string[] = [];
  if (c.apSpent) deltas.push(`${c.apSpent > 0 ? "−" : "+"}${Math.abs(c.apSpent)} AP`);
  if (c.wallet?.clean) deltas.push(`${money(c.wallet.clean)} clean`);
  if (c.wallet?.illicit) deltas.push(`${money(c.wallet.illicit)} street`);
  if (c.inventoryExchangeIds.length) deltas.push(`${c.inventoryExchangeIds.length} item exchange${c.inventoryExchangeIds.length > 1 ? "s" : ""}`);
  if (c.streetTransactionIds.length) deltas.push(`${c.streetTransactionIds.length} street sale${c.streetTransactionIds.length > 1 ? "s" : ""}`);
  if (c.daysElapsed) deltas.push(`${c.daysElapsed} day passed`);
  if (deltas.length) box.append(el("p", "deltas", deltas.join(" · ")));
  if (!events.length && !deltas.length) box.append(el("p", "dim", res.changed ? "Done." : "Nothing changed."));
  return box;
}
