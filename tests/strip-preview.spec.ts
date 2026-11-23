import { test, expect, type Page } from "@playwright/test";

// The Reservoir integration preview (strip.html?select, developer location selector): physical anchors open Codex's location API on an
// isolated test campaign. Tapping uses the real on-screen pin position.

async function ready(page: Page) {
  await page.goto("strip.html?select");
  await page.waitForFunction(() => !document.querySelector("#progress"), null, { timeout: 180_000 });
}
const settled = (page: Page) =>
  page.waitForFunction(() => !(window as any).__strip.preview.flying(), null, { timeout: 30_000 });

async function tapPin(page: Page, id: string) {
  const pos = await page.evaluate((i) => (window as any).__strip.preview.screenOf(i), id);
  expect(pos?.visible, `${id} pin on screen`).toBe(true);
  await page.mouse.click(pos.x, pos.y);
  await settled(page);
}

test("tap Lil Jay's: people come from the NPC simulation, answers and purchases come from the engine; nothing is saved", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));

  await tapPin(page, "reservoir.lil-jays");
  const card = page.locator(".place");
  await expect(card.locator("h2")).toHaveText("Lil Jay's Market");
  // 08:05: the simulation has Quanny posted up outside.
  await expect(card.locator(".people .chip")).toContainText(["Quanny"]);

  // Arrival opened the engine's Quanny introduction; its answers come first.
  await card.locator(".act[data-command=respondEncounter]:not([disabled])").first().click();
  await expect(card.locator(".result")).toContainText("Quanny");
  for (let i = 0; i < 3; i++) {
    const more = card.locator(".actions > .act[data-command=respondEncounter]:not([disabled])");
    if (!(await more.count())) break;
    await more.first().click();
  }

  await card.locator(".act[data-target=necessities]:not([disabled])").click();
  await expect(card.locator(".result .deltas")).toHaveText("−1 AP · −$16 clean");
  await expect(card.locator(".blocked summary")).toContainText("Not available now");

  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(storageBefore);
});

test("presence follows the simulation: Quanny walks off and his actions go; Mr. Lewis arrives and his work appears", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  await tapPin(page, "reservoir.lil-jays");
  const card = page.locator(".place");
  // Answer Quanny's introduction so the card isn't held by an open conversation.
  for (let i = 0; i < 4; i++) {
    const r = card.locator(".actions > .act[data-command=respondEncounter]:not([disabled])");
    if (!(await r.count())) break;
    await r.first().click();
  }
  await expect(card.locator(".act[data-command=socialize][data-target=quanny]")).toHaveCount(1);

  // Speed the neighborhood clock up. Quanny leaves for Blocc Boy Blvd at 09:30.
  await page.evaluate(() => (window as any).__strip.sim.setSpeedMultiplier(10));
  await page.waitForFunction(
    () => !(window as any).__strip.sim.peopleHere("reservoir.lil-jays").some((p: any) => p.characterId === "quanny"),
    null, { timeout: 120_000 },
  );
  // The card re-reads presence: Quanny is no longer here, and the engine refuses his actions.
  await expect(card.locator(".people .chip", { hasText: "Quanny" })).toHaveCount(0, { timeout: 5_000 });
  await expect(card.locator(".act[data-target=quanny]:not([disabled])")).toHaveCount(0);

  // Mr. Lewis's shift: once the simulation has him at the market, the engine offers his work.
  await page.waitForFunction(
    () => (window as any).__strip.sim.peopleHere("reservoir.lil-jays").some((p: any) => p.characterId === "mr-lewis"),
    null, { timeout: 120_000 },
  );
  await page.evaluate(() => (window as any).__strip.sim.setSpeedMultiplier(1));
  await expect(card.locator(".people .chip")).toContainText(["Mr. Lewis"], { timeout: 5_000 });
  await card.locator(".act[data-command=lewisDelivery]:not([disabled])").click();
  await expect(card.locator(".result")).toContainText("Mr. Lewis");
  await expect(card.locator(".result .deltas")).toContainText("+$38 clean");
});

test("every street's places are reachable from the selector; homes show households and scenery says so", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  await page.click("#places");
  const sheet = page.locator(".places");
  await expect(sheet.locator("h3")).toHaveText([
    "Lil Bit Lane", "Blocc Boy Boulevard", "Big Mouth Boulevard", "Dirty Money Drive", "No Refund Road",
  ]);

  await sheet.locator('.pick[data-anchor="reservoir.water-tower"]').click();
  await settled(page);
  await expect(page.locator(".place .politics .big")).toHaveText("Blocc Boys");

  await page.click("#places");
  await sheet.locator('.pick[data-anchor="res-home-04"]').click();
  await settled(page);
  await expect(page.locator(".place h2")).toContainText("Mr. Lewis's home");
  await expect(page.locator(".place .household")).toContainText("Mr. Lewis");

  await page.click("#places");
  await sheet.locator('.pick[data-anchor="res-store-barber"]').click();
  await settled(page);
  await expect(page.locator(".place .empty")).toContainText("Scenery for now");

  // Touch targets stay thumb-sized on a phone.
  const close = await page.locator(".place .close").boundingBox();
  expect(close!.height).toBeGreaterThanOrEqual(44);
});
