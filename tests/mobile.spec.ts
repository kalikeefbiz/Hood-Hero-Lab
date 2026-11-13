import { tapUntil, navigate } from "./helpers";
import { AUTO_KEY } from "../src/persistence/SaveSystem";
import { openJournal } from "./journal";
import { honest, connects, storyAction, storyline } from "./helpers";
import { dismissEncounter } from "./helpers";
import type { GameState } from "../src/core/GameState";
import { test, expect } from "@playwright/test";
const state = (page: import("@playwright/test").Page): Promise<GameState> =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state,
    AUTO_KEY,
  );
const nav = navigate;
async function endDay(page: import("@playwright/test").Page) {
  const before = await state(page);
  await tapUntil(
    page,
    page.getByRole("button", { name: "End day", exact: true }),
    async () => (await state(page)).day === before.day + 1,
  );
  await dismissEncounter(page);
  expect((await state(page)).day).toBe(before.day + 1);
}
async function start(
  page: import("@playwright/test").Page,
  home = "Southside",
) {
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await page.getByLabel("What do people call you?").fill("Morgan");
  await page.getByRole("radio", { name: home, exact: false }).check();
  await page.getByRole("button", { name: "Enter Stixx City" }).click();
  await dismissEncounter(page);
  await expect(page.getByRole("heading", { name: "Morgan" })).toBeVisible();
}
async function action(page: import("@playwright/test").Page, title: string) {
  if (title.includes("Buy back")) {
    await storyAction(page, "buyback");
    return;
  }
  if (title === "Reach out") await connects(page, "mega");
  else await honest(page);
  const before = await state(page);
  const button = page
    .locator(".action-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button");
  await tapUntil(
    page,
    button,
    async () => (await state(page)).ap === before.ap - 1,
  );
}
async function noOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("phone gameplay: contact, lawful income, days, save and load", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, "Downtown");
  await noOverflow(page);
  await nav(page, "Actions");
  await nav(page, "Actions");

  await action(page, "Reach out");
  await expect(page.getByRole("status")).toContainText("Trust grew");
  await nav(page, "Actions");
  await page.getByRole("button", { name: "Honest", exact: true }).click();
  await action(page, "Pick up a gig");
  await expect(page.locator(".ap b")).toHaveText("0/2");
  await endDay(page);
  await expect(page.locator(".day")).toHaveText("DAY 02");
  await page.getByLabel("Save game", { exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved day 2");
  await action(page, "Pick up a gig");
  await endDay(page);
  await expect(page.locator(".day")).toHaveText("DAY 03");
  await page.getByLabel("Load game", { exact: true }).click();
  await expect(page.locator(".day")).toHaveText("DAY 02");
  await expect(page.locator(".ap b")).toHaveText("2/2");
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  await expect(page.locator(".day")).toHaveText("DAY 02");
  for (const name of ["City", "People", "Actions", "Set", "Wallet"]) {
    await nav(page, name);
    await noOverflow(page);
  }
  await page.screenshot({
    path: `test-results/${test.info().project.name}-activity.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("buyback resolves the incident and the ordinary loop remains playable", async ({
  page,
}) => {
  await start(page);
  await storyline(page);
  const modal = page.getByRole("dialog", { name: "Character encounter" });
  await tapUntil(
    page,
    modal.getByRole("button", { name: /Let me think/ }),
    async () => (await state(page)).streetLife?.decision === "delay",
  );
  await dismissEncounter(page);

  // The City action includes a walk. Ending the day during that walk used to
  // advance to day 2 and then overwrite it with the gig's day-1 snapshot.
  await honest(page);
  const gig = page.locator('[data-action="gig"]');
  await gig.getByRole("button").tap();
  await expect(
    page.getByRole("button", { name: "End day", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => (await state(page)).employmentSearch.player.lastGigDay)
    .toBe(1);
  let s = await state(page);
  expect(s.day).toBe(1);
  expect(s.ap).toBe(1);
  expect(s.characters.player.wallet).toEqual({ clean: 163, illicit: 0 });
  expect(s.presence?.location).toBe("downtown.docks");
  expect(s.streetLife?.workEvent).toBeTruthy();
  expect(s.progression.cleanEarned).toBe(38);
  await expect(gig.getByRole("button")).toBeDisabled();

  await endDay(page);
  expect((await state(page)).ap).toBe(2);
  await action(page, "Pick up a gig");
  await endDay(page);
  await action(page, "Reach out");
  expect((await state(page)).ap).toBe(1);
  await action(page, "Buy back · $150");
  await dismissEncounter(page);
  s = await state(page);
  expect(s.day).toBe(3);
  expect(s.ap).toBe(0);
  expect(s.incidents["the-chains"].resolution).toBe("buyback");
  expect(s.properties.chains.possession).toEqual({
    kind: "character",
    id: "mega",
  });
  expect(s.characters.player.wallet).toEqual({ clean: 15, illicit: 0 });
  expect(s.streetLife?.workEvent).toBeTruthy();
  await nav(page, "City");
  await openJournal(page);
  await page.getByText("Completed storylines", { exact: true }).click();
  await expect(page.locator(".situation-history")).toContainText("resolved");
  await page.getByLabel("Save game", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  expect((await state(page)).incidents["the-chains"].resolution).toBe(
    "buyback",
  );
  await endDay(page);
  await action(page, "Pick up a gig");
  await expect(page.getByRole("status")).toContainText("$38");
  s = await state(page);
  expect(s.ap).toBe(1);
  expect(s.presence?.location).toBe("downtown.docks");
  expect(s.progression.cleanEarned).toBe(114);
  await expect(page.locator('[data-action="gig"] button')).toBeDisabled();
  await nav(page, "Set");
  await endDay(page);
  await nav(page, "Set");
  await page
    .getByRole("button", { name: "Interact with Flacco", exact: true })
    .click();
  await page.getByRole("button", { name: /^Paid local work/ }).click();
  await endDay(page);
  await nav(page, "Set");
  await expect(page.locator("main")).toContainText("Paid local work");
  await nav(page, "Wallet");
  await expect(page.locator("main")).toContainText("Reserved compensation");
  await noOverflow(page);
});
test("mobile city and new game remain readable at narrow widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await noOverflow(page);
  await page
    .getByLabel("What do people call you?")
    .fill("A long player name for testing");
  await page.getByRole("button", { name: "Enter Stixx City" }).click();
  await dismissEncounter(page);
  await noOverflow(page);
  await tapUntil(
    page,
    page.getByRole("button", { name: "Select The Nawf" }),
    async () =>
      (await page.locator(".zone-details").textContent())!.includes(
        "The Blips",
      ),
  );
  await expect(page.locator(".zone-details")).toContainText("The Blips");
  await expect(page.locator(".zone-details")).toContainText("Mudgang");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-city.png`,
    fullPage: true,
  });
});
