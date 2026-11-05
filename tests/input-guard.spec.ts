import { test, expect } from "@playwright/test";
import { dismissEncounter, honest } from "./helpers";
import { newGame } from "../src/core/Simulation";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";

// What a queued tap is (stale device timestamp, heartbeat gap, the frames
// after a freeze) is covered in src/tests/inputGuard.test.ts. A desktop test
// browser stamps simulated taps when it processes them, so it cannot replay a
// phone's queued touches; these checks make sure the guard never eats a tap
// the player makes on a page that is visibly working.

const ap = (page: import("@playwright/test").Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.ap as number,
    AUTO_KEY,
  );

test("a tap right after a freeze ends, once the page has drawn, goes through once", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await page.evaluate(
    ({ key, raw }) => {
      localStorage.clear();
      localStorage.setItem(key, raw);
    },
    { key: SAVE_KEY, raw: serialize(newGame("Morgan", "south")) },
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  await honest(page);
  const button = page
    .locator(".action-card")
    .filter({
      has: page.getByRole("heading", { name: "Pick up a gig", exact: true }),
    })
    .getByRole("button");
  await expect(button).toBeEnabled();
  const before = await ap(page);
  // A 1.5 s freeze, as a heavy board build would cause.
  await page.evaluate(() =>
    setTimeout(() => {
      const t = performance.now();
      while (performance.now() - t < 1500);
    }, 0),
  );
  await page.waitForTimeout(1700);
  // Playwright waits for the button to be drawn and stable, like a player.
  await button.click();
  await expect.poll(() => ap(page)).toBe(before - 1);
  await page.waitForTimeout(500);
  expect(await ap(page)).toBe(before - 1);
});
