import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { newGame } from "./legacyGame";
import type { EncounterInstance } from "../core/GameState";
import { CHARACTER_ART, characterArt, type Expression } from "../ui/characterArt";
import { flaccoExpression } from "../ui/flaccoExpression";

const all: Expression[] = ["neutral", "proposing", "confident", "strategizing", "concerned", "skeptical"];
const scene = (definitionId: string, over: Partial<EncounterInstance> = {}) =>
  ({
    id: "e1",
    definitionId,
    participants: ["flacco"],
    status: "active",
    selectedResponses: [],
    followUpPending: false,
    deferred: false,
    ...over,
  }) as unknown as EncounterInstance;

describe("Flacco portraits", () => {
  it("has a real image for every expression", () => {
    const s = newGame("Morgan", "south", 1);
    const paths = new Set<string>();
    for (const x of all) {
      const art = characterArt(s, "flacco", x)!;
      expect(existsSync(`public/${art.path}`)).toBe(true);
      paths.add(art.path);
    }
    expect(paths.size).toBe(6);
    expect(characterArt(s, "flacco")!.path).toBe(CHARACTER_ART.flacco.neutral.path);
  });
  it("other characters fall back sensibly for the side-eye", () => {
    const s = newGame("Morgan", "south", 1);
    expect(characterArt(s, "quanny", "skeptical")!.path).toBe(CHARACTER_ART.quanny.concerned.path);
    expect(characterArt(s, "mega", "skeptical")).not.toBeNull();
  });
  it("matches his mood to the moment", () => {
    const s = newGame("Morgan", "south", 1);
    const answered = { selectedResponses: [{ id: "receive", day: 3, eventIds: [] }] };
    expect(flaccoExpression(s, scene("flacco-six"), "confident")).toBe("proposing");
    expect(flaccoExpression(s, scene("flacco-six", answered), "confident")).toBe("confident");
    expect(flaccoExpression(s, scene("life-flacco-follow"), "confident")).toBe("confident");
    expect(flaccoExpression(s, scene("life-flacco-set"), "confident")).toBe("skeptical");
    expect(flaccoExpression(s, scene("crew-offer"), "proposing")).toBe("proposing");
    expect(flaccoExpression(s, scene("crew-conversation"), "strategizing")).toBe("strategizing");
    expect(
      flaccoExpression(s, scene("crew-offer", { selectedResponses: [{ id: "decline", day: 3, eventIds: [] }] }), "proposing"),
    ).toBe("skeptical");
  });
});
