import { test, expect } from "@playwright/test";
import { dismissEncounter, honest } from "./helpers";
import { newGame } from "../src/core/Simulation";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";

const ap = (page: import("@playwright/test").Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state.ap as number,
    AUTO_KEY,
  );

test("taps queued while the page is frozen never fire; the next tap does", async ({
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
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  // Freeze the main thread for 1.5 s, and tap three times while frozen.
  await page.evaluate(() =>
    setTimeout(() => {
      const t = performance.now();
      while (performance.now() - t < 1500);
    }, 0),
  );
  await page.waitForTimeout(100);
  await Promise.all([
    page.mouse.click(x, y),
    page.mouse.click(x, y),
    page.mouse.click(x, y),
  ]);
  await page.waitForTimeout(2500);
  expect(await ap(page)).toBe(before);
  // A tap on the responsive page works normally.
  await button.click();
  await expect.poll(() => ap(page)).toBe(before - 1);
});
