import { test, expect, type Page } from "@playwright/test";
import { newGame } from "../src/tests/legacyGame";
import { serialize, SAVE_KEY, AUTO_KEY } from "../src/persistence/SaveSystem";
import { dismissEncounter } from "./helpers";

const state = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, AUTO_KEY);

// Screenshot pass helper: keep exchange cards up long enough for the slow software renderer.
async function holdCards(page: Page) {
  await page.addInitScript(() => {
    const set = window.setTimeout;
    (window as unknown as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number) =>
      set(fn, ms === 2600 ? 600000 : ms)) as typeof setTimeout;
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = ".exchange-card,.exchange-card *{animation:none!important;opacity:1!important}";
      document.head.append(st);
    });
  });
}

async function load(page: Page) {
  const s = newGame("Morgan", "south", 123);
  const p = s.characters[s.playerId];
  if (!p.known.includes("mega")) p.known.push("mega");
  if (!p.connections.includes("mega")) p.connections.push("mega");
  s.characters.mega.relationships[p.id] = { ...s.characters.mega.relationships[p.id], trust: 35 };
  for (const e of s.encounters) e.status = "closed";
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await page.evaluate(({ key, raw }) => { localStorage.clear(); localStorage.setItem(key, raw); }, { key: SAVE_KEY, raw: serialize(s) });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
}

async function openPlugFromCity(page: Page) {
  const city = page.getByRole("navigation").getByRole("button", { name: "City", exact: true });
  if ((await city.getAttribute("aria-current")) !== "page") await city.click();
  const details = page.getByRole("button", { name: "Show details" });
  if (await details.count()) await details.click();
  const close = page.getByRole("button", { name: "Hide details" });
  // Your own card lists your plugs; tap one to find them on the board.
  // The neighborhood card lists the plugs found there; tap one to find them.
  const plugs = page.getByRole("group", { name: /^(Your plugs|Plugs in )/ });
  await expect(plugs.first()).toBeVisible({ timeout: 15000 });
  await plugs.first().getByRole("button", { name: /Cuzzo/ }).click();
  await expect(page.locator('[aria-label="Plug"]')).toBeVisible();
  void close;
}

test("find a plug in the city, take a pack, pay him back: each exchange shows", async ({ page }) => {
  test.setTimeout(300000);
  await holdCards(page);
  await load(page);
  await openPlugFromCity(page);
  await page.screenshot({ path: "test-results/plug-card.png" });
  await page.getByRole("button", { name: "Talk terms with Cuzzo" }).click();
  await page.getByRole("button", { name: /Accept consignment/ }).click();

  const pack = page.locator(".exchange-card").filter({ hasText: /Received from/ });
  await expect(pack).toBeVisible({ timeout: 15000 });
  let s = await state(page);
  const lot = s.street.lots.at(-1);
  const packText = (await pack.innerText()).toUpperCase();
  expect(packText).toContain(`${lot.received}× PINK MAGIC`);
  expect(packText).toContain("RECEIVED FROM CUZZO");
  expect(packText).toContain(`$${lot.owed} OWED BY DAY ${lot.dueDay}`.toUpperCase());
  await page.screenshot({ path: "test-results/plug-pack.png" });
  // A deal made in the city keeps you in the city.
  const back = page.getByRole("button", { name: /Return to City|Acknowledge/ });
  if (await back.count()) await back.first().click();
  await expect(page.getByRole("navigation").getByRole("button", { name: "City", exact: true })).toHaveAttribute("aria-current", "page");

  // Give the player cash for a repayment and pay part of it back from the city.
  await page.evaluate(() => document.querySelectorAll(".exchange-card").forEach((n) => n.remove()));
  // Back in the City, tap Cuzzo himself on the map.
  await page.getByRole("navigation").getByRole("button", { name: "City", exact: true }).click();
  await page.getByRole("button", { name: "Talk to Cuzzo" }).click();
  await expect(page.locator('[aria-label="Plug"]')).toBeVisible();
  await page.getByRole("button", { name: "Talk repayment with Cuzzo" }).click();
  await page.getByRole("button", { name: /Make partial payment/ }).click();
  const paid = page.locator(".exchange-card").filter({ hasText: /Paid to Cuzzo/ });
  await expect(paid).toBeVisible({ timeout: 15000 });
  s = await state(page);
  const a = s.street.agreements.find((a: { debtor: string }) => a.debtor === s.playerId);
  const paidText = (await paid.innerText()).toUpperCase();
  expect(paidText).toContain(`−$${a.repaid}`);
  expect(paidText).toContain(`$${a.balance} STILL OWED`);
  await page.screenshot({ path: "test-results/plug-repay.png" });
});
