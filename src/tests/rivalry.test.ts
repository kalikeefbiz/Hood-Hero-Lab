import { describe, expect, it } from "vitest";
import { newGame } from "../core/Simulation";
import { advanceDay } from "../core/TimeSystem";
import { player, type GameState } from "../core/GameState";
import { resolveTerritories, rivalControl } from "../systems/Territory";
import { advanceFactions } from "../systems/Factions";
import { politicalAction, politicalError } from "../systems/Politics";
import { marketAccess } from "../systems/StreetEconomy";
import { businessAction, advanceBusinesses } from "../systems/Businesses";
import { serialize, deserialize } from "../persistence/SaveSystem";
import { rivalryView, eventView } from "../presentation/PlayerInformation";
import { validateAction } from "../core/ActionEngine";
import { threatenedReservoir } from "./rivalryFixtures";
import { legitimateProgress, evaluateEnd } from "../systems/EndConditions";

function resolveDays(s: GameState, days: number) {
  for (let i = 0; i < days; i++) {
    s.day++;
    resolveTerritories(s);
  }
  return s;
}

describe("living rivalry consequences", () => {
  it("warns before a sustained victory, displaces funds once, and persists access and business losses", () => {
    let s = threatenedReservoir();
    s = businessAction(s, "laundry", "buy").state;
    const funds = s.factions.blocks.resources;
    resolveDays(s, 1);
    expect(s.zones.reservoir.controller).toBe("blocks");
    const warning = s.events.find(
      (e) => e.title === "The Reservoir: Rival pressure",
    )!;
    expect(warning).toBeTruthy();
    expect(eventView(s, warning)?.text).toContain("local traders");
    expect(marketAccess(s, s.playerId, "reservoir")).toBeNull();
    resolveDays(s, 6);
    expect(s.zones.reservoir.controller).toBe("angels");
    expect(s.factions.blocks.resources).toBe(funds - 60);
    expect(s.factions.blocks.instability).toBe(26);
    expect(s.strategic.territories.reservoir.changes).toHaveLength(1);
    expect(marketAccess(s, s.playerId, "reservoir")).toContain("Rival control");
    expect(rivalryView(s, "reservoir")).toContain("loses customers");
    expect(s.end).toBeNull();
    s = deserialize(serialize(s));
    const before = serialize(s);
    resolveTerritories(s);
    expect(serialize(s)).toBe(before); // No replayed penalties on load or same-day calls.
    expect(marketAccess(s, s.playerId, "reservoir")).toContain("Rival control");
    const neutral = structuredClone(s);
    player(neutral).affiliation = null;
    s.day++;
    neutral.day++;
    advanceBusinesses(s);
    advanceBusinesses(neutral);
    expect(s.strategic.businesses[0].lastNet).toBeLessThan(
      neutral.strategic.businesses[0].lastNet,
    );
    expect(s.ledger.at(-2)?.amount).toBe(
      s.strategic.businesses[0].history[0].revenue,
    );
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("existing challenges reverse a defeat; the same unsupported foothold stays lost", () => {
    let s = resolveDays(threatenedReservoir(), 7);
    const passive = structuredClone(s);
    for (let d = 0; d < 60 && s.zones.reservoir.controller !== "blocks"; d++) {
      s.day++;
      s.ap = 2;
      if (!politicalError(s, "challenge", "reservoir", "contact-blocks")) {
        const result = politicalAction(
          s,
          "challenge",
          "reservoir",
          "contact-blocks",
        );
        expect(result.error).toBeNull();
        s = result.state;
      }
      resolveTerritories(s);
    }
    resolveDays(passive, s.day - passive.day);
    expect(passive.zones.reservoir.controller).toBe("angels");
    expect(s.zones.reservoir.controller).toBe("blocks");
    expect(s.strategic.territories.reservoir.changes.map((c) => c.to)).toEqual([
      "angels",
      "blocks",
    ]);
    expect(player(s).wallet.clean).toBeLessThan(player(passive).wallet.clean);
    expect(s.strategic.contributions.blocks).toBeGreaterThan(0);
    expect(rivalControl(s, "reservoir", player(s))).toBe(false);
    expect(marketAccess(s, s.playerId, "reservoir")).toBeNull();
    const reloaded = deserialize(serialize(s));
    expect(rivalControl(reloaded, "reservoir", player(reloaded))).toBe(false);
    expect(rivalryView(reloaded, "reservoir")).not.toContain("loses customers");
  });

  it("support, operations, cooperation and priorities influence independent faction choices", () => {
    const s = threatenedReservoir();
    s.strategic.territories.reservoir.factions.blocks.support = 25;
    for (const action of [
      "support",
      "operation",
      "cooperate",
      "priority",
    ] as const) {
      const result = politicalAction(s, action, "reservoir", "contact-blocks");
      expect(result.error).toBeNull();
      expect(
        result.state.strategic.territories.reservoir.factions.blocks.support,
      ).toBeGreaterThan(25);
      if (action === "priority") {
        result.state.day++;
        advanceFactions(result.state);
        expect(result.state.strategic.strategies.blocks.target).toBe(
          "reservoir",
        );
      }
    }
  });

  it("neutral and allied residents keep lawful access, and rivalry never awards a terminal defeat", () => {
    const s = resolveDays(threatenedReservoir(), 7);
    player(s).affiliation = null;
    expect(rivalControl(s, "reservoir", player(s))).toBe(false);
    expect(marketAccess(s, s.playerId, "reservoir")).toBeNull();
    expect(validateAction(s, { actor: s.playerId, type: "gig" })).toBeNull();
    expect(politicalError(s, "community", "reservoir")).toBeNull();
    expect(businessAction(s, "laundry", "buy").error).toBeNull();
    expect(rivalryView(s, "reservoir")).not.toContain(
      "A rival organization controls",
    );
    player(s).affiliation = "muds"; // Angels' actual ally.
    expect(rivalControl(s, "reservoir", player(s))).toBe(false);
    expect(evaluateEnd(s)).toBeNull();
    player(s).affiliation = null;
    player(s).wallet.clean = 120000;
    let lawful = businessAction(s, "laundry", "buy").state;
    for (let d = 0; d < 35; d++) lawful = advanceDay(lawful);
    expect(lawful.strategic.businesses[0].totalNet).toBeGreaterThan(0);
    expect(legitimateProgress(lawful).missing).toEqual([]);
    expect(lawful.end).toBeNull(); // Retirement remains voluntary.
  });
});

it.each([17, 2026, 31415])(
  "passive campaign seed %i has autonomous territorial competition",
  (seed) => {
    let s = newGame("Passive resident", "south", seed);
    for (let d = 0; d < 365; d++) s = advanceDay(s);
    expect(s.day).toBe(366);
    expect(s.end).toBeNull();
    const changes = Object.entries(s.strategic.territories).flatMap(
      ([zone, t]) =>
        t.changes.map((c) => ({ zone, day: c.day, from: c.from, to: c.to })),
    );
    expect(changes.length).toBeGreaterThan(0);
    const angels = s.strategic.strategies.angels.history;
    expect(
      angels.some((h) => h.zone === "reservoir" && h.kind === "contest"),
    ).toBe(true);
    for (const f of Object.values(s.factions)) {
      expect(s.strategic.strategies[f.id].history.length).toBeGreaterThan(20);
      expect(f.resources).toBeGreaterThanOrEqual(0);
      expect(f.leaders).toEqual(
        newGame("Canon", "south", seed).factions[f.id].leaders,
      );
    }
    console.log(
      "PASSIVE RIVALRY",
      JSON.stringify({
        seed,
        day: s.day,
        changes,
        decisions: Object.fromEntries(
          Object.entries(s.strategic.strategies).map(([f, p]) => [
            f,
            p.history.reduce((n: Record<string, number>, h) => {
              n[h.kind] = (n[h.kind] ?? 0) + 1;
              return n;
            }, {}),
          ]),
        ),
      }),
    );
  },
  120000,
);
