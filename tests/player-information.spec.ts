import { test, expect, type Page } from "@playwright/test";
import { SAVE_KEY, AUTO_KEY, serialize } from "../src/persistence/SaveSystem";
import {
  base,
  ranks,
  shop,
  person,
  at,
  ok,
  crew,
} from "../src/tests/robberyFixtures";
import { offerCareerLead } from "../src/systems/RobberyCareer";
import { record } from "../src/core/EventLog";
import { navigate, tapUntil } from "./helpers";
import type { GameState } from "../src/core/GameState";
const state = (page: Page): Promise<GameState> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state, AUTO_KEY);
async function resume(page: Page, s: GameState) {
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
  await page.locator(".board-canvas").waitFor({ timeout: 30000 });
}
function readyHome() {
  let s = base(12);
  ranks(s);
  person(s, "dizzy");
  s = ok(offerCareerLead(s, "dizzy", "home.rio.1"));
  const j = s.robberies!.jobs.at(-1)!;
  s = shop(s, "home");
  s = crew(s, j.id);
  at(s, j.location);
  return s;
}
async function openCourtyard(page: Page) {
  const districts = page.locator(".district-chips");
  const list = page.getByRole("region", {
    name: "Places in Rio Gabriel",
    exact: true,
  });
  await tapUntil(
    page,
    districts.getByRole("button", { name: /Rio Gabriel/ }),
    () => list.isVisible(),
  );
  await tapUntil(page, list.getByRole("button", { name: /Courtyard/ }), () =>
    page
      .getByRole("region", { name: "Courtyard apartments", exact: true })
      .isVisible(),
  );
}
for (const width of [390, 320])
  test(`City disclosure, actual discovery, pause and reload at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width, height: 780 });
    const s = readyHome();
    await resume(page, s);
    const show = page.getByRole("button", { name: "Show details" });
    if (await show.isVisible())
      await tapUntil(page, show, () =>
        page.locator(".board-inspector").isVisible(),
      );
    await openCourtyard(page);
    const opportunities = page.getByRole("region", {
      name: "Robbery career",
      exact: true,
    });
    await expect(opportunities.locator(".kind-home")).toHaveCount(3);
    await expect(opportunities).toContainText(
      "Contents are unknown until searched",
    );
    await expect(opportunities).not.toContainText(
      /Gaming console|Gaming PC|Plain chain|next eligible|lick-/,
    );
    await page.screenshot({
      path: info.outputPath("before-discovery-mobile.png"),
      scale: "css",
    });
    const before = await state(page);
    await tapUntil(
      page,
      page.getByRole("button", { name: "Begin Home invasion session · 1 AP" }),
      async () => !!(await state(page)).activeRobbery,
    );
    const session = page.getByRole("region", {
      name: "Robbery session",
      exact: true,
    });
    await expect(session.locator(".loot-card")).toHaveCount(0);
    await tapUntil(
      page,
      session.getByRole("button", { name: "Wait and watch · lower pressure" }),
      async () => (await state(page)).activeRobbery!.cursor === 1,
    );
    const discovered = (await state(page)).activeRobbery!.career!.goods.filter(
      (g) => g.beat <= 1 && !g.locked,
    );
    await expect(session.locator(".loot-card")).toHaveCount(discovered.length);
    await expect(session).not.toContainText(
      /lick-\d+|riskRoll|seed|\d+% success/,
    );
    await tapUntil(
      page,
      session.getByRole("button", { name: "Pause robbery", exact: true }),
      async () => (await state(page)).activeRobbery!.status === "paused",
    );
    const saved = await state(page);
    expect(saved.ap).toBe(before.ap - 1);
    await page.reload();
    await page.getByRole("button", { name: "Resume saved game" }).click();
    expect((await state(page)).activeRobbery!.career!.goods).toEqual(
      saved.activeRobbery!.career!.goods,
    );
    await page.screenshot({
      path: info.outputPath("disclosure-mobile.png"),
      scale: "css",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test("all navigation paths use contextual NPC information and readable records", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const s = base();
  record(
    s,
    "crew",
    "Mega accepted lick-812; trust +4, grievance -3.",
    ["player", "mega"],
    ["player"],
  );
  record(s, "crew", "UNREVEALED PLAN CANARY", ["mega"], ["mega"]);
  await resume(page, s);
  for (const tab of ["People", "Actions", "Set", "Wallet", "Journal", "City"]) {
    await navigate(page, tab);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(
      /UNREVEALED PLAN CANARY|Seed state|lick-812|trust \+4|grievance -3|Requires \d+ (?:earned )?trust|Trust \d|\d+% (?:success|reliability)/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await navigate(page, "Set");
  await expect(page.locator(".relationship-impression")).toContainText([
    "good terms",
  ]);
  await page.screenshot({
    path: info.outputPath("set-information-mobile.png"),
    scale: "css",
  });
});
