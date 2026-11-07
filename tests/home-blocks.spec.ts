import { test, expect, type Page } from "@playwright/test";
import { newGame } from "../src/tests/legacyGame";
import { serialize, SAVE_KEY } from "../src/persistence/SaveSystem";
import { dismissEncounter, tapUntil } from "./helpers";

type Board = { homeScreenPoint(t: string): { x: number; y: number } | null };
const point = (page: Page, target: string) =>
  page.evaluate(
    (t) => (window as unknown as { __stixxBoard: Board }).__stixxBoard.homeScreenPoint(t),
    target,
  );

/** Each residential block has three houses; tapping one opens its own card. */
test("tapping a house on a home block opens that house's target card", async ({ page }) => {
  test.setTimeout(120000);
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
  const districts = page.locator(".district-chips");
  if (!(await districts.isVisible()))
    await tapUntil(
      page,
      page.getByRole("group", { name: "Board location" }).getByRole("button", { name: "Stixx City", exact: true }),
      () => districts.isVisible(),
    );
  const list = page.getByRole("region", { name: `Places in ${s.zones.reservoir.name}` });
  await tapUntil(page, districts.getByRole("button", { name: new RegExp(s.zones.reservoir.name) }), () => list.isVisible());
  await tapUntil(page, list.getByRole("button", { name: /Reservoir homes/ }), () =>
    page.getByRole("region", { name: "Reservoir homes", exact: true }).isVisible(),
  );
  await page.waitForTimeout(1500); // camera flight
  for (const n of [1, 2, 3]) {
    const target = `home.reservoir.${n}`;
    await expect
      .poll(async () => {
        const p = await point(page, target);
        if (!p) return false;
        // Hide the sheet so the house itself is under the finger.
        const hide = page.getByRole("button", { name: "Hide details" });
        if (await hide.isVisible()) await hide.click();
        const onBoard = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS",
          p,
        );
        if (!onBoard) return false;        await page.touchscreen.tap(p.x, p.y);
        return page
          .locator(`.target-card.focused[data-target="${target}"]`)
          .waitFor({ timeout: 3000 })
          .then(() => 1, () => 0);
      }, { timeout: 30000 })
      .toBe(1);
  }
  await page.screenshot({ path: test.info().outputPath("home-block.png") });
});
