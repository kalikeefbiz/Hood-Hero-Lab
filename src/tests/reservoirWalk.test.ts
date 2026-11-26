import { expect, test } from "vitest";
import { newGame } from "../core/Simulation";
import { moveTo } from "../board/presence";
import { MARKET, canWalkReservoir, clearReservoirApproach } from "../board/reservoirWalk";
import { approachQuannyAtMarket } from "../systems/Danger";
import { currentEncounter, dismissEncounter, openEncounter, respondEncounter } from "../systems/Encounters";
import { deserialize, serialize } from "../persistence/SaveSystem";

test("market run-in uses ordinary encounter consequences and survives serialization", () => {
  let state = moveTo(newGame("Morgan", "south", 9009), MARKET);
  state = respondEncounter(state, currentEncounter(state)!.id, "claim:unaffiliated").state;
  state = dismissEncounter(state, currentEncounter(state)!.id);
  const before = state.ap;
  let injured = false;
  for (let seed = 1; seed <= 100; seed++) {
    const sample = structuredClone(state);
    sample.danger.rng = seed;
    let next = approachQuannyAtMarket(sample);
    const scene = next.danger.scenes.at(-1)!;
    next = openEncounter(next, `danger:${scene.id}`);
    next = respondEncounter(next, `danger:${scene.id}`, "disrespect").state;
    expect(next.danger.conflicts.length).toBeGreaterThan(state.danger.conflicts.length);
    expect(approachQuannyAtMarket(next)).toBe(next);
    expect(deserialize(serialize(next))).toEqual(next);
    if (next.danger.injuries.length) {
      expect(next.ap).toBe(0);
      injured = true;
      break;
    }
    expect(next.ap).toBe(before);
  }
  expect(injured).toBe(true);
  expect(approachQuannyAtMarket(newGame("Morgan", "south", 9009)).danger.scenes).toEqual([]);
});

test("walkable market streets reject lots, boundaries and interactions through lots", () => {
  expect(canWalkReservoir(-56, -35)).toBe(true);
  expect(canWalkReservoir(-56, -40)).toBe(false);
  expect(canWalkReservoir(-48, -35)).toBe(false);
  expect(clearReservoirApproach(-56, -35, -54, -35)).toBe(true);
  expect(clearReservoirApproach(-56, -35, -56, -46)).toBe(false);
});
