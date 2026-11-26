import { expect, test, type Page } from "@playwright/test";
import { AUTO_KEY, serialize } from "../src/persistence/SaveSystem";
import type { GameState } from "../src/core/GameState";
import { newGame } from "../src/core/Simulation";
import { tapUntil } from "./helpers";
const state = (page: Page): Promise<GameState> =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state,
    AUTO_KEY,
  );

async function resumeCampaign(page: Page) {
  const resume = page.getByRole("button", { name: "Resume saved game" });
  const ap = page.locator(".ap b");
  await tapUntil(page, resume, () => ap.isVisible());
}

test("City stays active at zero AP, then saves and resumes the dawn refill", async ({
  page,
}) => {
  const campaign = newGame("Clock playtest", "south", 2026, { openCity: true });
  campaign.ap = 0;
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: AUTO_KEY, raw: serialize(campaign) },
  );
  await page.clock.install();
  await page.goto("./");
  await resumeCampaign(page);
  await expect(page.locator(".ap b")).toHaveText("0/3");
  // Wait for the foreground timer to start before changing the browser clock.
  await expect
    .poll(async () => (await state(page)).cycleElapsedMs, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.clock.fastForward(300_000);
  await expect
    .poll(async () => (await state(page)).cycleElapsedMs, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(300_000);
  expect((await state(page)).ap).toBe(0);
  expect((await state(page)).day).toBe(1);

  await page.clock.fastForward(420_000);
  await expect(page.locator(".ap b")).toHaveText("3/3");
  await expect.poll(async () => (await state(page)).day).toBe(2);

  await page.reload();
  await resumeCampaign(page);
  await expect(page.locator(".ap b")).toHaveText("3/3");
  expect((await state(page)).day).toBe(2);
  expect((await state(page)).incidents["the-chains"]).toBeUndefined();
});
