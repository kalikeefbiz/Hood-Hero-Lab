import { test, expect, type Page } from "@playwright/test";
import { newGame } from "../src/core/Simulation";
import { acquire } from "../src/systems/StreetEconomy";
import { presenceOf } from "../src/board/presence";
import { serialize, SAVE_KEY, AUTO_KEY } from "../src/persistence/SaveSystem";
import { startStreetSession } from "../src/systems/StreetSessions";
import { dismissEncounter } from "./helpers";

const state = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).state,
    AUTO_KEY,
  );
async function load(page: Page, atSpot = false, session = false) {
  let s = newGame("Morgan", "south", 123);
  acquire(s, "mega", "consignment");
  s.ap = 2; // fixture has a prepared lot and two untouched activity AP.
  for (const e of s.encounters) e.status = "closed";
  if (atSpot)
    s.presence = { ...presenceOf(s), location: "south.the-lot", zone: "south" };
  if (session) {
    s = startStreetSession(s, "south.the-lot").state;
    s.activeSession!.beats.forEach((b) => {
      b.kind = "buyer";
      b.seed = 2;
    });
  }
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
  const ack = page.getByRole("button", { name: "Acknowledge", exact: true });
  while (await ack.count()) await ack.click();
}

async function nav(page: Page, name: string) {
  const button = page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true });
  await expect
    .poll(
      async () => {
        if ((await button.getAttribute("aria-current")) !== "page")
          await button.click();
        return button.getAttribute("aria-current");
      },
      { timeout: 15000, intervals: [500, 800, 1200] },
    )
    .toBe("page");
}

async function spot(page: Page) {
  // Accessible City location list also serves the WebGL fallback.
  await page
    .getByRole("region", { name: "Places in Southside" })
    .getByRole("button", { name: /The Lot/ })
    .click();
}

test("City presence, approaching visitor, paid outcomes, mid-session reload, and repeat session", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await load(page);
  await spot(page);
  const start = page.getByRole("button", { name: "Start trapping — 1 AP" });
  await expect(start).toBeDisabled();
  const go = page.getByRole("button", { name: "Go here", exact: true });
  await go.click();
  await expect
    .poll(
      async () => {
        const current = await state(page);
        if (
          current.presence?.location !== "south.the-lot" &&
          (await go.isEnabled())
        ) {
          await page.waitForTimeout(800);
          await go.click();
        }
        return (await state(page)).presence?.location;
      },
      { timeout: 20000 },
    )
    .toBe("south.the-lot");
  await dismissEncounter(page);
  await expect(start).toBeEnabled({ timeout: 15000 });
  const before = await state(page);
  await start.click();
  const panel = page.getByRole("region", { name: "Trapping session" });
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await state(page)).ap).toBe(before.ap - 1);
  const queue = (await state(page)).activeSession.beats;
  expect(queue.length).toBeGreaterThanOrEqual(4);
  expect(queue.length).toBeLessThanOrEqual(6);
  const stage = page.locator(".board-stage[data-session-visitor]");
  await expect(stage).toBeVisible();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: info.outputPath("visitor-approaching.png") });
  await panel.getByRole("button", { name: "Skip visitor" }).click();
  // Capture a real paused checkpoint; an active timer is allowed to settle while a screenshot runs.
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).activeSession.status)
    .toBe("paused");
  const settled = (await state(page)).activeSession.cursor;
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(
    panel.getByRole("button", { name: "Continue session" }),
  ).toBeVisible();
  expect((await state(page)).activeSession.cursor).toBe(settled);
  expect((await state(page)).activeSession.beats).toEqual(queue);
  await panel.getByRole("button", { name: "Continue session" }).click();
  for (let i = 0; i < 6; i++) {
    const skip = panel.getByRole("button", { name: "Skip visitor" });
    if (!(await skip.count())) break;
    await skip.click();
  }
  const after = await state(page);
  expect(after.activeSession.status).toBe("ended");
  expect(after.presence.location).toBe("south.the-lot");
  expect(after.ap).toBe(before.ap - 1);
  expect(
    after.characters.player.wallet.clean +
      after.characters.player.wallet.illicit -
      before.characters.player.wallet.clean -
      before.characters.player.wallet.illicit,
  ).toBe(after.activeSession.totals.gross - after.activeSession.totals.loss);
  expect(after.characters.player.skillProgress.xp.trapper).toBe(
    after.activeSession.totals.xp,
  );
  await page.screenshot({ path: info.outputPath("session-summary.png") });
  await panel.getByRole("button", { name: "Dismiss session summary" }).click();
  if (
    after.street.lots[0].remaining > 0 &&
    after.street.markets.south.used < 6
  ) {
    await page.getByRole("button", { name: "Show details" }).click();
    await expect(start).toBeEnabled();
    await start.click();
    await expect.poll(async () => (await state(page)).ap).toBe(0);
    await panel.getByRole("button", { name: "Leave session" }).click();
  }
});

test("Actions gives directions only; Skills and inventory remain readable on iPhone", async ({
  page,
}, info) => {
  await load(page);
  await nav(page, "Actions");
  await page.getByRole("button", { name: "Streets", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Street operations" }),
  ).toContainText("Go to City");
  await expect(page.getByLabel("Transaction market")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Pursue local transaction/ }),
  ).toHaveCount(0);
  await nav(page, "People");
  const skills = page.getByRole("region", { name: "Morgan skills" });
  await expect(skills).toBeVisible();
  await expect(skills.locator(".skill-track")).toHaveCount(8);
  await skills.getByText("Combat · Uncertified", { exact: true }).click();
  await expect(skills).toContainText("Story certification");
  await nav(page, "Wallet");
  await expect(
    page.getByRole("region", { name: "Inventory", exact: true }),
  ).toContainText("Pink Magic");
  await expect(
    page.getByRole("region", { name: "Inventory", exact: true }),
  ).toContainText("Equipment");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("inventory-iphone.png") });
});

test("background, menu unmount, stale/double touches, reduced motion and End Day cannot duplicate outcomes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page, true, true);
  const panel = page.getByRole("region", { name: "Trapping session" });
  await panel.getByRole("button", { name: "Continue session" }).click();
  const before = await state(page);
  await nav(page, "People");
  await expect
    .poll(async () => (await state(page)).activeSession.status)
    .toBe("paused");
  const menuPaused = await state(page);
  await page.waitForTimeout(7500);
  expect((await state(page)).activeSession.cursor).toBe(
    menuPaused.activeSession.cursor,
  );
  expect((await state(page)).ap).toBe(before.ap);
  await nav(page, "City");
  await panel.getByRole("button", { name: "Continue session" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(async () => (await state(page)).activeSession.status)
    .toBe("paused");
  const paused = await state(page);
  await page.waitForTimeout(7500);
  expect((await state(page)).activeSession.cursor).toBe(
    paused.activeSession.cursor,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await panel.getByRole("button", { name: "Continue session" }).click();
  await panel.getByRole("button", { name: "Skip visitor" }).click();
  const expectedCursor = paused.activeSession.cursor + 1;
  await expect
    .poll(async () => (await state(page)).activeSession.cursor)
    .toBe(expectedCursor);
  await page.getByRole("button", { name: "End day", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).activeSession.status)
    .toBe("ended");
  expect((await state(page)).activeSession.cursor).toBe(expectedCursor);
});

test("WebGL unavailable: physically present accessible session settles the same persisted buyer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;
      return get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await load(page, true, true);
  await expect(page.locator(".board-flat")).toBeVisible();
  const panel = page.getByRole("region", { name: "Trapping session" });
  await panel.getByRole("button", { name: "Continue session" }).click();
  await panel.getByRole("button", { name: "Skip visitor" }).click();
  const after = await state(page);
  expect(after.activeSession.cursor).toBe(1);
  expect(after.street.transactions).toHaveLength(1);
  expect(after.street.transactions[0].sold).toBeGreaterThan(0);
  expect(after.activeSession.totals.xp).toBe(50);
});
