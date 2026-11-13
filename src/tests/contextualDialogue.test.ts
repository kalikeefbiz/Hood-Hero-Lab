import { describe, expect, it } from "vitest";
import { newGame } from "./legacyGame";
import { DANGER_ENCOUNTER } from "../content/dangerEncounters";
import { QUANNY_ENCOUNTER } from "../content/quannyEncounters";
import { FLACCO_GIFT } from "../content/streetLifeEncounters";
import { sceneDialogue } from "../systems/Danger";
import type { StreetScene } from "../systems/DangerState";

const setup = (motive: StreetScene["motive"]) => {
  const s = newGame("Dialogue", "south", 2026);
  const scene: StreetScene = {
    id: "context",
    npc: "mega",
    location: "south",
    day: s.day,
    motive,
    status: "open",
  };
  s.danger.scenes.push(scene);
  const e = { ...s.encounters[0], dangerSceneId: scene.id };
  return { s, e, scene };
};
describe("contextual dialogue without rule changes", () => {
  it("offers concern acknowledgements for disputes, not friendly family meetings", () => {
    const { s, e, scene } = setup("family");
    const rows = () => DANGER_ENCOUNTER.responses(s, e);
    expect(rows().some((r) => r.id === "apologize")).toBe(false);
    expect(rows().find((r) => r.id === "explain")?.label).toContain("Mega");
    scene.motive = "history";
    expect(rows().some((r) => r.id === "apologize")).toBe(true);
    expect(sceneDialogue(s, scene)).not.toContain("undefined");
  });
  it("only offers affiliation disclosure in introductions and only with an affiliation", () => {
    const { s, e, scene } = setup("introduction");
    s.characters[s.playerId].affiliation = null;
    expect(
      DANGER_ENCOUNTER.responses(s, e).some((r) => r.id === "identify"),
    ).toBe(false);
    s.characters[s.playerId].affiliation = "angels";
    expect(
      DANGER_ENCOUNTER.responses(s, e).some((r) => r.id === "identify"),
    ).toBe(true);
    scene.motive = "debt";
    expect(
      DANGER_ENCOUNTER.responses(s, e).some((r) => r.id === "identify"),
    ).toBe(false);
    expect(sceneDialogue(s, scene)).toContain("no balance left");
  });
  it("does not invent membership or an unresolved dispute in Quanny's business menu", () => {
    const { s, e } = setup("introduction");
    s.quanny.business = "open";
    s.quanny.claim = "blocks";
    expect(
      QUANNY_ENCOUNTER.responses(s, e).find((r) => r.id === "leave")?.label,
    ).toBe("Catch you later.");
    s.quanny.business = "blocked";
    expect(
      QUANNY_ENCOUNTER.responses(s, e).find((r) => r.id === "leave")?.label,
    ).toBe("Leave it unresolved");
  });
  it("keeps gift terms outside Flacco's dialogue", () => {
    const { s, e } = setup("family");
    expect(FLACCO_GIFT.dialogue(s, e)).not.toContain(
      "introduction still comes first",
    );
    expect(FLACCO_GIFT.responses(s, e)[0].detail).toContain(
      "no payment or debt",
    );
  });
});

import { WORKPLACE_ENCOUNTER } from "../content/workplaceEncounters";
import { SUPPLIER_ENCOUNTER } from "../content/streetEncounters";
import { record } from "../core/EventLog";
import { megaDialogue } from "../content/encounters";
import { TRIO_AFTERMATH } from "../content/streetLifeEncounters";
import { CREW_CONVERSATION } from "../content/crewEncounters";

it("retains concrete workplace consequences outside player speech", () => {
  const { s, e } = setup("introduction");
  const event = record(s, "social", "A difficult shift", [s.playerId]);
  event.title = "Difficult shift";
  e.sourceEventId = event.id;
  const rows = WORKPLACE_ENCOUNTER.responses(s, e);
  expect(rows.map((r) => r.id)).toEqual(["push", "flag", "skip"]);
  expect(rows.find((r) => r.id === "skip")?.detail).toContain("−3 reliability");
  event.title = "Coworker request";
  expect(WORKPLACE_ENCOUNTER.responses(s, e).map((r) => r.id)).toEqual([
    "help",
    "skip",
  ]);
  event.title = "Extra work offer";
  expect(
    WORKPLACE_ENCOUNTER.responses(s, e).find((r) => r.id === "extra")?.detail,
  ).toContain("+$18");
});
it("keeps supplier prices accessible without narrating gross calculations", () => {
  const { s, e } = setup("family");
  e.participants = ["mega"];
  expect(SUPPLIER_ENCOUNTER.dialogue(s, e)).not.toContain("Expected gross");
  expect(
    SUPPLIER_ENCOUNTER.responses(s, e).find((r) => r.id === "cash")?.label,
  ).toContain("$90");
  expect(
    SUPPLIER_ENCOUNTER.responses(s, e).find((r) => r.id === "consignment")
      ?.label,
  ).toContain("$102");
  expect(
    SUPPLIER_ENCOUNTER.responses(s, e).find((r) => r.id === "leave")?.detail,
  ).toContain("remain in place");
});
it("preserves Chains outcomes and the trio's established response to recovery", () => {
  const { s, e } = setup("family");
  expect(megaDialogue(s, e)).toContain("Can you help");
  s.incidents["the-chains"].status = "resolved";
  s.incidents["the-chains"].resolution = "recovered";
  s.incidents["the-chains"].resolvedBy = s.playerId;
  expect(megaDialogue(s, e)).toContain("My chain’s back");
  expect(TRIO_AFTERMATH.dialogue(s, e)).toContain("challenged all three");
  expect(FLACCO_GIFT.dialogue(s, e)).not.toContain("use that to help Cuz");
});
it("crew conversation acknowledges an existing commitment", () => {
  const { s, e } = setup("family");
  e.participants = ["flacco"];
  s.characters.flacco.availableDay = s.day + 2;
  expect(CREW_CONVERSATION.dialogue(s, e)).toContain("committed until");
});

import { addGrievance } from "../systems/Danger";
it("keeps robbery history as context and acknowledges reconciliation", () => {
  const { s, e, scene } = setup("history");
  const c = addGrievance(
    s,
    "mega",
    s.playerId,
    "Robbed my property",
    "robbery-event",
    50,
  );
  scene.conflictId = c.id;
  expect(DANGER_ENCOUNTER.responses(s, e)[0].detail).toContain(
    "Robbed my property",
  );
  expect(sceneDialogue(s, scene)).toContain("still something between us");
  c.state = "settled";
  expect(sceneDialogue(s, scene)).toContain("talked things through");
  expect(
    DANGER_ENCOUNTER.responses(s, e).some((r) => r.id === "apologize"),
  ).toBe(false);
});
