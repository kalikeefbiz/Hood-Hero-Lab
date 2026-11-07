import { test, expect, type Page } from "@playwright/test";
import { newGame } from "../src/tests/legacyGame";
import { serialize, SAVE_KEY } from "../src/persistence/SaveSystem";
import { dismissEncounter, navigate } from "./helpers";

/**
 * Regression: every game-state change re-sent the board's people, and the
 * board re-copied the rigged characters each time without freeing them. GPU
 * memory grew with every action until iOS froze and needed a refresh,
 * worst on returning to City from another tab.
 */
const gpu = (page: Page) =>
  page.evaluate(() => {
    const b = (window as unknown as { __stixxBoard: { renderer: { info: { memory: { textures: number; geometries: number } } } } }).__stixxBoard;
    return { ...b.renderer.info.memory };
  });

test("board GPU memory stays flat across actions and tab switches", async ({ page }) => {
  test.setTimeout(240000);
  const s = newGame("Morgan", "south", 2026);
  s.encounters.forEach((e) => (e.status = "closed"));
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await page.evaluate(
    ({ key, raw }) => {
      localStorage.clear();
      localStorage.setItem(key, raw);
    },
    { key: SAVE_KEY, raw: serialize(s) },
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  // One round to let models load and settle.
  const round = async () => {
    await navigate(page, "Wallet");
    await navigate(page, "City");
    await page.getByRole("button", { name: "End day" }).click();
    await dismissEncounter(page);
    await page.waitForTimeout(1200);
  };
  await round();
  const settled = await gpu(page);
  for (let i = 0; i < 5; i++) await round();
  const after = await gpu(page);
  expect(after.textures).toBeLessThanOrEqual(settled.textures + 1);
  expect(after.geometries).toBeLessThanOrEqual(settled.geometries + 2);
});
