import { describe, expect, it } from "vitest";
import { HOME_TARGETS } from "../board/BoardRenderer";
import { ROBBERY_TARGETS } from "../content/robberyCareer";

describe("board home blocks", () => {
  it("draws exactly the home targets, each at its own place", () => {
    const homes = ROBBERY_TARGETS.filter((t) => t.kind === "home");
    expect(HOME_TARGETS.map((h) => h.target).sort()).toEqual(homes.map((t) => t.id).sort());
    for (const h of HOME_TARGETS)
      expect(homes.find((t) => t.id === h.target)?.location).toBe(h.place);
  });
});
