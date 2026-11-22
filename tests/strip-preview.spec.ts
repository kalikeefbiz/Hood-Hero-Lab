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

test("tap Lil Jay's, answer Quanny, buy, work for Mr. Lewis; nothing is saved", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));

  await tapPin(page, "reservoir.lil-jays");
  const card = page.locator(".place");
  await expect(card.locator("h2")).toHaveText("Lil Jay's Market");
  await expect(card.locator(".people .chip")).toHaveText(["Quanny", "Mr. Lewis"]);
  await expect(card.locator(".fixture")).toContainText("Preview fixture");

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

  await card.locator(".act[data-command=lewisDelivery]:not([disabled])").click();
  await expect(card.locator(".result")).toContainText("Mr. Lewis");
  await expect(card.locator(".result .deltas")).toContainText("+$38 clean");
  await expect(card.locator(".status")).toContainText("0 AP");

  // A refused action stays visible with the engine's reason, folded away.
  await expect(card.locator(".blocked summary")).toContainText("Not available now");

  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(storageBefore);
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
