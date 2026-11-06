import { test, expect, type Page, type Locator } from "@playwright/test";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";
import { newGame } from "../src/core/Simulation";
import { newGame as legacyGame } from "../src/tests/legacyGame";
import { boardPeople } from "../src/board/people";
import { LOCATIONS } from "../src/board/locations";
import { dismissEncounter, tapUntil } from "./helpers";
import type { GameState } from "../src/core/GameState";
import { offerRobbery } from "../src/systems/Robbery";
import { connect } from "../src/systems/Relationships";
import { presenceOf } from "../src/board/presence";
const state = (page: Page): Promise<GameState> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state, AUTO_KEY);
async function click(
  page: Page,
  button: Locator,
  done: () => Promise<boolean>,
) {
  await tapUntil(page, button, done, 45000);
}
async function enterPattern(page: Page, pattern: number[]) {
  const colors = ["Amber", "Blue", "Violet"];
  for (let i = 0; i < pattern.length; i++) {
    const expected = `Your sequence: ${pattern
      .slice(0, i + 1)
      .map((n) => colors[n])
      .join(" → ")}`;
    await click(
      page,
      page.getByRole("button", { name: colors[pattern[i]], exact: true }),
      async () => page.getByText(expected, { exact: true }).isVisible(),
    );
  }
}
async function close(page: Page) {
  for (let i = 0; i < 8; i++) {
    const d = page.getByRole("dialog", {
      name: "Character encounter",
      exact: true,
    });
    if (!(await d.count())) break;
    const crew = d.getByRole("button", { name: "Hear the crew out" });
    if (await crew.count()) {
      await click(
        page,
        crew,
        async () =>
          (await state(page)).encounters.find(
            (e) => e.definitionId === "trio-aftermath",
          )?.status === "acknowledged",
      );
      continue;
    }
    if (
      await d
        .getByRole("button", { name: "Take Flacco’s six Pink Magic" })
        .count()
    )
      return;
    await click(
      page,
      d.getByRole("button", { name: "Close conversation" }),
      async () => !(await d.count()),
    );
  }
  const ack = page.getByRole("button", { name: "Acknowledge", exact: true });
  for (let n = 0; n < 10 && (await ack.count()); n++) {
    const before = await ack.count();
    await click(page, ack.first(), async () => (await ack.count()) < before);
  }
}
async function details(page: Page) {
  const show = page.getByRole("button", { name: "Show details" });
  if (await show.isVisible())
    await click(page, show, async () =>
      page.locator(".board-inspector").isVisible(),
    );
}
async function place(page: Page, id: string) {
  await close(page);
  await details(page);
  const s = await state(page),
    l = LOCATIONS.find((l) => l.id === id)!;
  if (
    !(await page
      .getByRole("group", { name: "Five neighborhoods of Stixx City" })
      .isVisible())
  )
    await click(
      page,
      page
        .getByRole("group", { name: "Board location" })
        .getByRole("button", { name: "Stixx City", exact: true }),
      async () =>
        page
          .getByRole("group", { name: "Five neighborhoods of Stixx City" })
          .isVisible(),
    );
  await click(
    page,
    page
      .getByRole("group", { name: "Five neighborhoods of Stixx City" })
      .getByRole("button", { name: new RegExp(s.zones[l.zone].name) }),
    async () =>
      page
        .getByRole("region", { name: `Places in ${s.zones[l.zone].name}` })
        .isVisible(),
  );
  const list = page.getByRole("region", {
    name: `Places in ${s.zones[l.zone].name}`,
  });
  await click(
    page,
    list.getByRole("button", {
      name: new RegExp(l.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    }),
    async () =>
      page.getByRole("region", { name: l.name, exact: true }).isVisible(),
  );
  const go = page.getByRole("button", { name: "Go here", exact: true });
  if (await go.count())
    await click(
      page,
      go,
      async () => (await state(page)).presence?.location === id,
    );
  await close(page);
  const aftermath = page.getByRole("button", { name: "Hear the crew out" });
  if (await aftermath.count())
    await click(
      page,
      aftermath,
      async () =>
        (await state(page)).encounters.find(
          (e) => e.definitionId === "trio-aftermath",
        )?.status === "acknowledged",
    );
}
async function person(page: Page, id: string) {
  const s = await state(page),
    p = boardPeople(s).find((p) => p.id === id)!;
  await place(page, p.placeId);
  const b = page
    .locator(".board-people")
    .getByRole("button", { name: new RegExp(p.name) });
  await click(page, b, async () => page.locator(".person-card").isVisible());
}
async function endDay(page: Page) {
  const before = (await state(page)).day;
  page.on("dialog", async (d) => d.accept());
  await click(
    page,
    page.getByRole("button", { name: "End day", exact: true }),
    async () => (await state(page)).day > before,
  );
  page.removeAllListeners("dialog");
  await close(page);
}
async function resume(page: Page, s: GameState) {
  await page.goto("/");
  await page.evaluate(
    ({ key, raw }) => {
      localStorage.clear();
      localStorage.setItem(key, raw);
    },
    { key: SAVE_KEY, raw: serialize(s) },
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await close(page);
}
async function startFresh(page: Page, choice: "promise" | "decline") {
  await page.goto("/");
  await page.locator('input[name="home"][value="south"]').check();
  await page.getByLabel("What do people call you?").fill("Morgan");
  await page.getByRole("button", { name: "Enter Stixx City" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Character encounter",
    exact: true,
  });
  await click(
    page,
    dialog.getByRole("button", {
      name:
        choice === "promise"
          ? /I’ll help you get it back/
          : /I can’t get involved/,
    }),
    async () => (await state(page)).streetLife?.decision === choice,
  );
  await close(page);
  await place(page, "south.food-mart");
  await click(
    page,
    page.locator('[data-action="apply"]').getByRole("button"),
    async () => !!(await state(page)).streetLife?.workEvent,
  );
  await close(page);
}
test("fresh promise → physical application → queued Day 3 six → real Lot session with reload", async ({
  page,
}, info) => {
  test.setTimeout(720000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startFresh(page, "promise");
  expect((await state(page)).characters.player.wallet.clean).toBe(125);
  await click(
    page,
    page.locator('[data-action="acceptJob"]').getByRole("button"),
    async () => !!(await state(page)).employment.length,
  );
  await endDay(page);
  await click(
    page,
    page.locator('[data-action="work"]').getByRole("button"),
    async () => (await state(page)).ap === 0,
  );
  await close(page);
  await endDay(page);
  const gift = page.getByRole("button", {
    name: "Take Flacco’s six Pink Magic",
  });
  // The queued scene is explicitly reopened if the ordinary close helper deferred it.
  if (!(await gift.isVisible())) {
    const pending = page.getByRole("button", {
      name: "Hear from Flacco about Cuzzo",
    });
    if (await pending.count()) await pending.first().click();
  }
  if (!(await gift.isVisible())) {
    await endDay(page);
  }
  await click(
    page,
    gift,
    async () => !!(await state(page)).streetLife?.giftLot,
  );
  await close(page);
  const gifted = await state(page);
  expect(gifted.street.lots[0].received).toBe(6);
  expect(gifted.street.lots[0].cost).toBe(0);
  await place(page, "south.the-lot");
  await click(
    page,
    page.getByRole("button", { name: "Start trapping — 1 AP", exact: true }),
    async () => (await state(page)).activeSession?.status === "active",
  );
  const session = page.getByRole("region", {
    name: "Trapping session",
    exact: true,
  });
  await expect(session).toBeVisible();
  const pause = session.getByRole("button", { name: "Pause", exact: true });
  if (await pause.count())
    await click(
      page,
      pause,
      async () => (await state(page)).activeSession?.status !== "active",
    );
  const checkpoint = await state(page);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await close(page);
  await click(
    page,
    page.getByRole("button", { name: "Continue session", exact: true }),
    async () => (await state(page)).activeSession?.status !== "paused",
  );
  for (let n = 0; n < 6; n++) {
    const a = (await state(page)).activeSession!;
    if (a.status === "ended") break;
    await click(
      page,
      page.getByRole("button", { name: "Skip visitor", exact: true }),
      async () => (await state(page)).activeSession!.cursor > a.cursor,
    );
  }
  const after = await state(page);
  expect(after.streetLife?.lesson).toBe("complete");
  expect(after.ap).toBe(checkpoint.ap);
  expect(after.street.lots).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("mega-lesson.png") });
  await click(
    page,
    page.getByRole("button", { name: "Dismiss session summary" }),
    async () => !(await state(page)).activeSession,
  );
  await click(
    page,
    page.getByRole("button", {
      name: "Open The Chains storyline",
      exact: true,
    }),
    async () =>
      page
        .getByRole("button", { name: /Pay to return the chains/ })
        .isVisible(),
  );
  await click(
    page,
    page.getByRole("button", { name: /Pay to return the chains/ }),
    async () =>
      (await state(page)).incidents["the-chains"].status === "resolved",
  );
  await close(page);
  await person(page, "dizzy");
  const hear = page.getByRole("button", { name: "Hear the crew out" });
  if (await hear.count())
    await click(
      page,
      hear,
      async () =>
        (await state(page)).encounters.find(
          (e) => e.definitionId === "trio-aftermath",
        )?.status === "acknowledged",
    );
  await close(page);
  for (
    let i = 0;
    i < 5 &&
    ((await state(page)).characters.dizzy.relationships.player?.trust ?? 0) <
      35;
    i++
  ) {
    if ((await state(page)).ap === 0) await endDay(page);
    await person(page, "dizzy");
    const before = (await state(page)).ap;
    await click(
      page,
      page.locator('.person-card [data-action="contact"]').getByRole("button"),
      async () => (await state(page)).ap < before,
    );
    await close(page);
  }
  if ((await state(page)).ap === 0) await endDay(page);
  await person(page, "dizzy");
  await click(
    page,
    page.getByRole("button", {
      name: "Ask for a Rio street introduction · 1 AP",
    }),
    async () => !!(await state(page)).streetLife?.rioContact,
  );
  await person(page, "contact-angels");
  await click(
    page,
    page.getByRole("button", { name: "Agree and pay $12 territory tribute" }),
    async () => (await state(page)).streetLife!.tribute.length === 1,
  );
  await person(page, "dizzy");
  await click(
    page,
    page.getByRole("button", { name: "Ask about an optional robbery job" }),
    async () => !!(await state(page)).robberies?.jobs.length,
  );
  for (const [location, label, item] of [
    ["south.food-mart", "Buy Gloves · $8 · 1 AP", "gloves"],
    ["nawf.street-market", "Buy Mask · $12 · 1 AP", "mask"],
  ] as const) {
    if ((await state(page)).ap === 0) await endDay(page);
    await place(page, location);
    await click(
      page,
      page.getByRole("button", { name: label }),
      async () => (await state(page)).robberies!.items[item] === 1,
    );
  }
  if ((await state(page)).ap === 0) await endDay(page);
  await place(page, "rio.courtyard");
  await click(
    page,
    page.getByRole("button", { name: "Begin Strong-arm session · 1 AP" }),
    async () => !!(await state(page)).activeRobbery,
  );
  await click(
    page,
    page.getByRole("button", { name: "Wait and watch · lower pressure" }),
    async () => (await state(page)).activeRobbery!.cursor === 1,
  );
  const pattern = (await state(page)).activeRobbery!.pattern;
  await enterPattern(page, pattern);
  await click(
    page,
    page.getByRole("button", { name: "Commit sequence once" }),
    async () => (await state(page)).activeRobbery!.cursor === 2,
  );
  await click(
    page,
    page.getByRole("button", { name: "Leave with partial proceeds · safer" }),
    async () => (await state(page)).activeRobbery!.status === "ended",
  );
  expect((await state(page)).robberies!.history).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: info.outputPath("fresh-career-first-robbery.png"),
  });
});
test("decline cash starter and one-AP City trapping", async ({ page }) => {
  test.setTimeout(240000);
  await startFresh(page, "decline");
  await person(page, "mega");
  await click(
    page,
    page.getByRole("button", { name: "Talk terms with Cuzzo" }),
    async () =>
      page.getByRole("button", { name: /Accept cash purchase/ }).isVisible(),
  );
  await expect(
    page.getByRole("button", { name: /Accept consignment/ }),
  ).toBeDisabled();
  await click(
    page,
    page.getByRole("button", { name: /Accept cash purchase/ }),
    async () => !!(await state(page)).streetLife?.starterLot,
  );
  await close(page);
  expect((await state(page)).characters.player.wallet.clean).toBe(35);
  await endDay(page);
  await place(page, "south.the-lot");
  await click(
    page,
    page.getByRole("button", { name: "Start trapping — 1 AP" }),
    async () => !!(await state(page)).activeSession,
  );
  expect((await state(page)).streetLife?.lesson).toBe("started");
});
test("earned contact → City preparation shops → real robbery puzzle → persisted outcome on 360px", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 360, height: 780 });
  let s = legacyGame("Morgan", "south", 123);
  for (const e of s.encounters) e.status = "closed";
  connect(s, "player", "dizzy");
  s.characters.dizzy.relationships.player.trust = 40;
  const personAt = boardPeople(s).find((p) => p.id === "dizzy")!;
  const l = LOCATIONS.find((l) => l.id === personAt.placeId)!;
  s.presence = { ...presenceOf(s), location: l.id, zone: l.zone };
  await resume(page, s);
  await person(page, "dizzy");
  await click(
    page,
    page.getByRole("button", { name: "Ask about an optional robbery job" }),
    async () => !!(await state(page)).robberies?.jobs.length,
  );
  await place(page, "south.food-mart");
  await click(
    page,
    page.getByRole("button", { name: "Buy Gloves · $8 · 1 AP" }),
    async () => (await state(page)).robberies!.items.gloves === 1,
  );
  await place(page, "nawf.street-market");
  await click(
    page,
    page.getByRole("button", { name: "Buy Mask · $12 · 1 AP" }),
    async () => (await state(page)).robberies!.items.mask === 1,
  );
  await endDay(page);
  await place(page, "rio.courtyard");
  await click(
    page,
    page.getByRole("button", { name: "Begin Strong-arm session · 1 AP" }),
    async () => !!(await state(page)).activeRobbery,
  );
  await expect(
    page.getByRole("region", { name: "Robbery session", exact: true }),
  ).toBeVisible();
  const paid = (await state(page)).ap;
  await click(
    page,
    page.getByRole("button", { name: "Wait and watch · lower pressure" }),
    async () => (await state(page)).activeRobbery?.cursor === 1,
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await close(page);
  await click(
    page,
    page.getByRole("button", { name: "Continue robbery session" }),
    async () => (await state(page)).activeRobbery?.status === "active",
  );
  const a = (await state(page)).activeRobbery!;
  await enterPattern(page, a.pattern);
  await click(
    page,
    page.getByRole("button", { name: "Commit sequence once" }),
    async () => (await state(page)).activeRobbery?.cursor === 2,
  );
  await click(
    page,
    page.getByRole("button", { name: "Leave with partial proceeds · safer" }),
    async () => (await state(page)).activeRobbery?.status === "ended",
  );
  const result = await state(page);
  if (result.characters.player.status === "active")
    expect(result.ap).toBe(paid);
  else {
    expect(result.ap).toBe(0);
    expect(result.robberies!.history[0].outcome).toBe("failed");
    expect(
      result.street.custody.some(
        (c) => c.character === "player" && c.status === "held",
      ) || result.danger.injuries.some((i) => !i.discharged),
    ).toBe(true);
  }
  expect(result.robberies!.history).toHaveLength(1);
  expect(result.characters.player.skillProgress!.milestones.certified).toBe(1);
  await page.screenshot({ path: info.outputPath("robbery-outcome.png") });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  expect((await state(page)).robberies!.history).toHaveLength(1);
});
