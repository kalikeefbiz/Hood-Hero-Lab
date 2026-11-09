import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { acquire, repay, supplierError } from "../systems/StreetEconomy";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  base,
  shop,
  ranks,
  person,
  crew,
  at,
  input,
  ok,
} from "./robberyFixtures";
import { offerCareerLead, tryDial } from "../systems/RobberyCareer";
import { startRobbery } from "../systems/Robbery";
import { serialize, deserialize } from "../persistence/SaveSystem";
import { record } from "../core/EventLog";
import {
  robberyPlaceView,
  robberyDiscoveryView,
  relationshipView,
  playerText,
  eventView,
  actionView,
} from "../presentation/PlayerInformation";
import { CareerPlace, CareerControls, CareerPerson } from "../ui/RobberyCareer";
import { ActionCard } from "../ui/ActionCard";
import { ActionsHub } from "../ui/ActionsHub";
import { ActivityFeed } from "../ui/ActivityFeed";
import { NarrativeNotifications } from "../ui/NarrativeNotifications";
import { InventoryWallet } from "../ui/InventoryWallet";
import {
  OrganizationPanel,
  NeighborhoodStrategy,
  BusinessPanel,
} from "../ui/StrategyPanels";
import { PlugEntry } from "../ui/PlugEntry";
import { EmploymentSummary } from "../ui/EmploymentSummary";
import { StreetSessionStart } from "../ui/StreetSession";
import { SkillsView } from "../ui/SkillsView";
import { EncounterScene } from "../ui/EncounterScene";
import { CREW_CONVERSATION } from "../content/crewEncounters";
import type { GameState, EncounterInstance } from "../core/GameState";

const noop = () => {};
const render = (c: any, props: any) =>
  renderToStaticMarkup(createElement(c, props));
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
function home(started = true) {
  let s = base(12);
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.rio.1"));
  const j = s.robberies!.jobs.at(-1)!;
  s = shop(s, "home");
  s = crew(s, j.id);
  at(s, j.location);
  if (!started) return s;
  const result = startRobbery(s, j.id);
  expect(result.error).toBeNull();
  return result.state;
}
function crewEncounter(s: GameState): EncounterInstance {
  return {
    id: "encounter-test",
    definitionId: "crew-conversation",
    participants: ["mega"],
    createdDay: s.day,
    status: "active",
    selectedResponses: [],
    followUpPending: false,
    deferred: false,
  };
}

describe("player information boundary", () => {
  it("does not hand target loot tables, risk calculations or cooldown records to cards", () => {
    const s = base();
    at(s, "rio.courtyard");
    const view = robberyPlaceView(s, "rio.courtyard");
    expect(view.targets.filter((t) => t.kind === "home")).toHaveLength(3);
    for (const t of view.targets) {
      expect(t).not.toHaveProperty("pool");
      expect(t).not.toHaveProperty("risk");
      expect(t).not.toHaveProperty("cooldown");
    }
    const html = text(
      render(CareerPlace, { s, location: "rio.courtyard", change: noop }),
    );
    expect(html).toContain("electronics or personal valuables");
    expect(html).not.toMatch(
      /Gaming console|Plain chain|High-end chain|\bPC\b|next eligible|lick-/,
    );
  });
  it("different RNG, private cash and unrevealed loot produce identical pre-discovery UI", () => {
    const a = home(),
      b = structuredClone(a);
    b.rng = 99999;
    b.activeRobbery!.seed = 2;
    const c = b.activeRobbery!.career!;
    c.roll = 0.999;
    c.riskRoll = 0.001;
    c.cash = 99999;
    c.dial.target = 99;
    c.goods = c.goods.map((g) => ({
      ...g,
      itemId: "art",
      quantity: 7,
      value: 9999,
    }));
    expect(robberyDiscoveryView(a)).toEqual(robberyDiscoveryView(b));
    expect(render(CareerControls, { s: a, change: noop, input: noop })).toBe(
      render(CareerControls, { s: b, change: noop, input: noop }),
    );
    expect(
      render(CareerPlace, { s: a, location: "rio.courtyard", change: noop }),
    ).toBe(
      render(CareerPlace, { s: b, location: "rio.courtyard", change: noop }),
    );
  });
  it("reveals goods only as real searches occur, with persistence across save/load", () => {
    let s = home();
    const contents = structuredClone(s.activeRobbery!.career!.goods);
    expect(robberyDiscoveryView(s).goods).toEqual([]);
    s = input(s, "patient");
    expect(robberyDiscoveryView(s).goods.map((g) => g.ref)).toEqual(
      contents.filter((g) => g.beat <= 1 && !g.locked).map((g) => g.id),
    );
    s = input(s, "search");
    expect(robberyDiscoveryView(s).goods.map((g) => g.ref)).toEqual(
      contents.filter((g) => g.beat <= 2 && !g.locked).map((g) => g.id),
    );
    const loaded = deserialize(serialize(s));
    expect(robberyDiscoveryView(loaded)).toEqual(robberyDiscoveryView(s));
    expect(loaded.activeRobbery!.career!.goods).toEqual(contents);
  });
  it("a visible locked safe discloses neither its contents nor their value/load before opening", () => {
    let s = input(input(input(home(), "patient"), "search"), "search");
    const c = s.activeRobbery!.career!;
    expect(c.goods.some((g) => g.locked)).toBe(true);
    expect(robberyDiscoveryView(s).lockedContainer).toBe(true);
    const a = render(CareerControls, { s, change: noop, input: noop });
    const other = structuredClone(s);
    for (const g of other.activeRobbery!.career!.goods.filter((g) => g.locked))
      Object.assign(g, { itemId: "art", value: 9999, quantity: 19 });
    expect(
      render(CareerControls, { s: other, change: noop, input: noop }),
    ).toBe(a);
    expect(text(a)).toContain("contents unknown");
    s = ok(
      tryDial(s, s.activeRobbery!.id, s.activeRobbery!.cursor, c.dial.target),
    );
    expect(robberyDiscoveryView(s).lockedContainer).toBe(false);
    expect(
      robberyDiscoveryView(s).goods.some(
        (g) => g.ref === c.goods.find((g) => g.locked)!.id,
      ),
    ).toBe(true);
  });
  it("read-only projection preserves mechanics, RNG, inventories and save compatibility", () => {
    const s = input(home(), "patient");
    const before = serialize(s);
    robberyPlaceView(s, "rio.courtyard");
    robberyDiscoveryView(s);
    relationshipView(s, "mega");
    actionView(s, { type: "recruit", actor: s.playerId, target: "mega" });
    s.events.forEach((e) => eventView(s, e));
    expect(serialize(s)).toBe(before);
    expect(deserialize(before).activeRobbery).toEqual(s.activeRobbery);
  });
  it("private scores stay contextual across contacts, cards and encounter responses", () => {
    const a = base(),
      b = structuredClone(a);
    for (const s of [a, b]) {
      s.characters.mega.relationships.player.grievance = 0;
    }
    a.characters.mega.relationships.player.trust = 46;
    b.characters.mega.relationships.player.trust = 49;
    b.characters.mega.traits.ambition = 99;
    b.characters.mega.traits.loyalty = 1;
    expect(relationshipView(a, "mega")).toEqual(relationshipView(b, "mega"));
    const props = (s: GameState) => ({
      s,
      category: "Connects",
      setCategory: noop,
      focus: "mega",
      setFocus: noop,
      findPerson: noop,
      findPlace: noop,
    });
    expect(render(ActionsHub, props(a))).toBe(render(ActionsHub, props(b)));
    const e = crewEncounter(a);
    const responses = CREW_CONVERSATION.responses(b, e);
    expect(responses.map((r) => r.detail).join(" ")).not.toMatch(
      /\d+% (?:reliability|chance)|Likely refusal|loyalty|ambition/,
    );
    expect(
      text(
        render(EncounterScene, {
          s: b,
          encounter: e,
          respond: noop,
          dismiss: noop,
        }),
      ),
    ).not.toMatch(/Trust \d|\d+% (?:success|reliability)|Likely refusal/);
  });
  it("does not expose exact action odds, but preserves AP and known requirements", () => {
    const s = base();
    const html = text(
      render(ActionCard, {
        s,
        action: {
          type: "negotiate",
          actor: "player",
          target: "dizzy",
          incidentId: "the-chains",
        },
        onAction: noop,
      }),
    );
    expect(html).toContain("1 AP");
    expect(html).toContain("uncertain");
    expect(html).not.toMatch(/\d+%|Success chance/);
    expect(playerText(s, "Requires Combat rank 2 and Robbery rank 2.")).toBe(
      "Requires Combat rank 2 and Robbery rank 2.",
    );
    expect(
      playerText(s, "Requires 35 organizational standing and 35 sponsor trust"),
    ).toContain("35 organizational standing");
  });
  it("legacy event IDs and private thresholds are translated in feed, notifications and encounters", () => {
    const s = base();
    const e = record(
      s,
      "crew",
      "Mega accepted lick-812; trust +4, grievance -3.",
      ["player", "mega"],
      ["player"],
      { title: "Job accepted", importance: "major" },
    );
    const hidden = record(
      s,
      "crew",
      "SECRET FUTURE DECISION",
      ["mega"],
      ["mega"],
    );
    expect(eventView(s, hidden)).toBeNull();
    for (const html of [
      render(ActivityFeed, { s }),
      render(NarrativeNotifications, { s, acknowledge: noop, view: noop }),
    ]) {
      expect(text(html)).toContain("Mega accepted");
      expect(text(html)).not.toMatch(
        /lick-812|trust \+4|grievance -3|SECRET FUTURE/,
      );
    }
    const encounter = { ...crewEncounter(s), sourceEventId: hidden.id };
    expect(
      text(
        render(EncounterScene, { s, encounter, respond: noop, dismiss: noop }),
      ),
    ).not.toContain("SECRET FUTURE");
    expect(
      playerText(s, "Requires 45 earned trust and no personal beef."),
    ).not.toMatch(/45/);
  });
  it("keeps agreed crew shares, debt, deadlines, carried quantities and earned progression exact", () => {
    const planned = home(false);
    person(planned, "mega");
    expect(
      text(render(CareerPerson, { s: planned, id: "mega", change: noop })),
    ).toContain("25%");
    let s = home();
    person(s, "mega");
    s.robberyCareer!.claims.push({
      id: "claim-test",
      jobId: s.activeRobbery!.jobId,
      member: "mega",
      amount: 123,
      paid: 23,
      dueDay: 7,
      warned: false,
    });
    expect(
      text(render(CareerPerson, { s, id: "mega", change: noop })),
    ).toContain("$100");
    const wallet = text(
      render(InventoryWallet, { s, change: noop, open: noop }),
    );
    expect(wallet).toMatch(/slots|load/);
    expect(wallet).not.toContain("home.rio.1");
    expect(
      text(render(SkillsView, { character: s.characters.player })),
    ).toContain("Rank 2/4");
  });
  it("covers jobs, suppliers, businesses, politics and trapping without private forecasts or debug labels", () => {
    const s = base();
    at(s, "rio.courtyard");
    const pages = [
      render(EmploymentSummary, { s }),
      render(PlugEntry, { s, id: "dizzy", open: noop }),
      render(BusinessPanel, { s, onChange: noop }),
      render(OrganizationPanel, { s, onChange: noop }),
      render(NeighborhoodStrategy, { s, zone: "rio", onChange: noop }),
      render(StreetSessionStart, {
        s,
        location: "rio.courtyard",
        change: noop,
        busy: false,
        onStart: noop,
      }),
    ];
    for (const html of pages)
      expect(text(html)).not.toMatch(
        /(?:trust|loyalty) \d|\d+ (?:trust|loyalty)|seed:|next eligible|candidateDays|\d+% (?:success|reliability)|Demand \d+ · competition/,
      );
    expect(text(pages[1])).toContain("$90 cash / $102 consignment");
    expect(text(pages[2])).toContain("maintenance costs $120");
  });
});

describe("disclosure regression contracts", () => {
  it("keeps contractual amounts intact when dialogue also mentions trust", () => {
    const s = base();
    const quote =
      "$12 buys three days here. That doesn't buy my trust or Pablo's time.";
    expect(playerText(s, quote)).toBe(quote);
    expect(playerText(s, "$102 owed by day 7. We need to rebuild trust.")).toBe(
      "$102 owed by day 7. We need to rebuild trust.",
    );
  });
  it("keeps multiple supplier contracts distinct across save/load without internal agreement IDs", () => {
    const s = base();
    expect(supplierError(s, "mega", "consignment")).toBeNull();
    acquire(s, "mega", "consignment");
    s.day++;
    s.ap = 2;
    expect(supplierError(s, "mega", "consignment")).toBeNull();
    acquire(s, "mega", "consignment");
    expect(s.street.agreements).toHaveLength(2);
    const [a, b] = s.street.agreements;
    repay(s, b.id, 25);
    const translated = playerText(
      s,
      `Repay ${a.id} · $${a.balance} · due day ${a.dueDay}; Part-pay ${b.id} · $${b.balance}`,
    );
    expect(translated).toContain("pack 1 from Cuzzo");
    expect(translated).toContain("pack 2 from Cuzzo");
    expect(translated).toContain(`$102 · due day ${a.dueDay}`);
    expect(translated).toContain("$77");
    expect(translated).not.toMatch(/agreement-\d/);
    expect(playerText(deserialize(serialize(s)), a.id)).toBe(
      playerText(s, a.id),
    );
  });
  it("UI modules cannot read RNG, future rolls, target pools or exact odds directly", () => {
    for (const relative of ["../ui/", "../board/ui/"]) {
      const root = fileURLToPath(new URL(relative, import.meta.url));
      for (const path of readdirSync(root, { recursive: true }).filter(
        (p) => typeof p === "string" && /\.tsx?$/.test(p),
      )) {
        const source = readFileSync(join(root, String(path)), "utf8");
        expect(source, String(path)).not.toMatch(
          /\b(?:s|state)\.rng|\.riskRoll\b|\.seed\b|\.pool\b|\b(?:actionSuccessChance|assignmentChance|transactionChance|careerChance)\b/,
        );
      }
    }
  });
});
