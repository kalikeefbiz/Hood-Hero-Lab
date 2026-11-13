import { expect, it } from "vitest";
import { newGame } from "../core/Simulation";
import { newGame as legacyGame } from "./legacyGame";
import { performActionAt, type Action } from "../core/ActionEngine";
import { advanceDay } from "../core/TimeSystem";
import { cash, player } from "../core/GameState";
import { respondEncounter } from "../systems/Encounters";
import { deserialize, serialize } from "../persistence/SaveSystem";

it.each([
  ["fresh", newGame],
  ["migrated v9", legacyGame],
] as const)(
  "%s campaign can fund the Chains and resume lawful gigs",
  (_, create) => {
    let s = create("Worker", "south");
    const opening = s.encounters.find(
      (e) => e.definitionId === "mega-chains-request",
    )!;
    const decision = respondEncounter(s, opening.id, "delay");
    expect(decision.error).toBeNull();
    s = decision.state;
    const gig: Action = { actor: s.playerId, type: "gig" };
    const buyback: Action = {
      actor: s.playerId,
      type: "buyback",
      incidentId: "the-chains",
    };
    expect(performActionAt(s, buyback, "south.towers").error).toMatch(/cash/);
    for (const day of [1, 2]) {
      const earned = performActionAt(s, gig, "downtown.docks");
      expect(earned.error).toBeNull();
      s = earned.state;
      expect(s.day).toBe(day);
      expect(s.ap).toBe(1);
      expect(s.presence?.location).toBe("downtown.docks");
      expect(s.employmentSearch.player.lastGigDay).toBe(day);
      const saved = serialize(s);
      const duplicate = performActionAt(s, gig, "nawf.street-market");
      expect(duplicate.error).toMatch(/complete/);
      expect(serialize(duplicate.state)).toBe(saved);
      s = advanceDay(deserialize(saved));
      expect(s.ap).toBe(2);
    }
    const contact = performActionAt(
      s,
      { actor: s.playerId, type: "contact", target: "mega" },
      "south.court",
    );
    expect(contact.error).toBeNull();
    s = contact.state;
    expect(s.ap).toBe(1);
    const noAP = { ...s, ap: 0 };
    expect(performActionAt(noAP, buyback, "south.towers")).toEqual({
      state: noAP,
      error: "Not enough AP or availability",
    });
    const paid = performActionAt(s, buyback, "south.towers");
    expect(paid.error).toBeNull();
    s = paid.state;
    expect(s.day).toBe(3);
    expect(s.ap).toBe(0);
    expect(cash(player(s))).toBe(15);
    expect(s.properties.chains.possession).toEqual({
      kind: "character",
      id: "mega",
    });
    expect(s.incidents["the-chains"].resolution).toBe("buyback");
    expect(s.progression.cleanEarned).toBe(76);
    if (!s.streetLife?.legacy) expect(s.streetLife?.workEvent).toBeTruthy();
    s = advanceDay(deserialize(serialize(s)));
    const continued = performActionAt(s, gig, "downtown.docks");
    expect(continued.error).toBeNull();
    s = continued.state;
    expect(s.day).toBe(4);
    expect(s.ap).toBe(1);
    expect(player(s).wallet).toEqual({ clean: 38, illicit: 0 });
    expect(s.progression.cleanEarned).toBe(114);
    expect(s.end).toBeNull();
  },
);
