import { test, expect } from "@playwright/test";
import { base, shop, begin } from "../src/tests/robberyFixtures";
import { serialize, SAVE_KEY, AUTO_KEY } from "../src/persistence/SaveSystem";
import type { GameState } from "../src/core/GameState";
import { tapUntil, navigate, dismissEncounter } from "./helpers";
const state = (page: import("@playwright/test").Page): Promise<GameState> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state, AUTO_KEY);

test("career encounter survives a freeze, hidden board, reduced motion and reload without spending twice", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const fixture = begin(shop(base(47)));
  await page.goto("/");
  await page.evaluate(
    ({ raw, key }) => {
      localStorage.clear();
      localStorage.setItem(key, raw);
    },
    { raw: serialize(fixture), key: SAVE_KEY },
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  await navigate(page, "City");
  const region = page.getByRole("region", {
    name: "Robbery session",
    exact: true,
  });
  await expect(region).toBeVisible();
  if ((await state(page)).activeRobbery!.status === "paused")
    await tapUntil(
      page,
      region.getByRole("button", { name: "Continue robbery session" }),
      async () => (await state(page)).activeRobbery!.status === "active",
    );
  const checkpoint = await state(page);
  await page.evaluate(() =>
    setTimeout(() => {
      const until = performance.now() + 1500;
      while (performance.now() < until) {}
    }, 0),
  );
  await page.waitForTimeout(1800);
  await tapUntil(
    page,
    region.getByRole("button", { name: "Wait and watch · lower pressure" }),
    async () => (await state(page)).activeRobbery!.cursor === 1,
  );
  await navigate(page, "People");
  await expect
    .poll(async () => (await state(page)).activeRobbery!.status)
    .toBe("paused");
  const paused = await state(page);
  await page.waitForTimeout(1000);
  expect((await state(page)).activeRobbery!.career).toEqual(
    paused.activeRobbery!.career,
  );
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  await navigate(page, "City");
  await tapUntil(
    page,
    region.getByRole("button", { name: "Continue robbery session" }),
    async () => (await state(page)).activeRobbery!.status === "active",
  );
  expect((await state(page)).activeRobbery!.career).toEqual(
    paused.activeRobbery!.career,
  );
  await tapUntil(
    page,
    region.getByRole("button", { name: "Abandon attempt" }),
    async () => (await state(page)).activeRobbery!.status === "ended",
  );
  const after = await state(page);
  expect(after.ap).toBe(checkpoint.ap);
  expect(after.robberies!.items).toEqual(checkpoint.robberies!.items);
  expect(
    after.robberies!.history.filter(
      (h) => h.jobId === checkpoint.activeRobbery!.jobId,
    ),
  ).toHaveLength(1);
  expect(after.characters.player.skillProgress!.xp.robbery).toBe(
    checkpoint.characters.player.skillProgress!.xp.robbery,
  );
});
