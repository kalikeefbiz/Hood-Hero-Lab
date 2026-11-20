import { describe, expect, it } from "vitest";
import {
  feedbackId,
  issueBody,
  issueLabels,
  issueTitle,
  prefilledIssueUrl,
  type FeedbackDraft,
} from "../devtools/feedback/format";

const draft = (over: Partial<FeedbackDraft> = {}): FeedbackDraft => ({
  id: "fb-2611191930-0a",
  tags: ["broke", "text"],
  note: "Quanny's line | repeats\ntwice",
  context: {
    takenAt: "2026-11-19T19:30:00.000Z",
    localTime: "11/19/2026, 11:30:00 AM",
    commit: "abc123def",
    url: "https://kalikeefbiz.github.io/Hood-Hero-Lab/",
    screen: "City",
    dialog: "Character encounter · Quanny",
    visibleText: "We got an arrangement.",
    viewport: "390×844 @3x",
    userAgent: "test",
    game: {
      day: 4, ap: 2, cash: 130, clean: 100, street: 30, stress: 12.4,
      zone: "reservoir", location: "reservoir.homes", session: null,
      robbery: null, openEncounter: "quanny-first (active)", ended: null,
    },
    errors: ["10:00:00 error: boom"],
  },
  ...over,
});

describe("dev feedback formatting", () => {
  it("makes unique, sortable ids", () => {
    const a = feedbackId(new Date("2026-11-19T19:30:00Z"), 0.1);
    expect(a).toMatch(/^fb-2611191930-[0-9a-z]{2}$/);
    expect(feedbackId(new Date("2026-11-19T19:30:00Z"), 0.9)).not.toBe(a);
  });
  it("titles and labels the issue from tags, day and note", () => {
    expect(issueTitle(draft())).toBe(
      "[Feedback] Something broke, Text sounds off · day 4: Quanny's line | repeats twice",
    );
    expect(issueLabels(draft())).toEqual(["feedback", "fb:broke", "fb:text"]);
    expect(issueTitle(draft({ tags: [], note: "" }))).toBe("[Feedback] Note · day 4");
  });
  it("puts the note, screenshot and context in the body without breaking the table", () => {
    const body = issueBody(draft(), "https://example.com/shot.jpg");
    expect(body).toContain("> Quanny's line | repeats\n> twice");
    expect(body).toContain("![Screenshot](https://example.com/shot.jpg)");
    expect(body).toContain("| Game day / AP | day 4 · 2 AP |");
    expect(body).toContain("| Where | reservoir.homes · reservoir |");
    expect(body).toContain("10:00:00 error: boom");
    expect(issueBody(draft(), null)).toContain("_No screenshot attached._");
  });
  it("handles a fresh browser with no saved game", () => {
    const d = draft();
    d.context.game = null;
    expect(issueBody(d, null)).toContain("| Game | no saved game yet |");
  });
  it("keeps the prefilled GitHub link under the URL limit", () => {
    const d = draft({ note: "x".repeat(20000) });
    const url = prefilledIssueUrl(d, 7000);
    expect(url.length).toBeLessThanOrEqual(7000);
    expect(url).toContain("labels=feedback%2Cfb%3Abroke%2Cfb%3Atext");
  });
});
