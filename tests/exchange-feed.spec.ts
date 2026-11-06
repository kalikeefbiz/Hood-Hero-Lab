import { test, expect, type Page } from "@playwright/test";
import { newGame } from "../src/tests/legacyGame";
import { acquire } from "../src/systems/StreetEconomy";
import { presenceOf } from "../src/board/presence";
import { serialize, SAVE_KEY, AUTO_KEY } from "../src/persistence/SaveSystem";
import { startStreetSession } from "../src/systems/StreetSessions";
import { dismissEncounter } from "./helpers";

const state = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, AUTO_KEY);

async function trapping(page: Page, hold = false) {
  if (hold)
    // Screenshot pass only: keep cards up so the slow software renderer can capture one.
    await page.addInitScript(() => {
      const set = window.setTimeout;
      (window as unknown as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number) =>
        set(fn, ms === 2600 ? 600000 : ms)) as typeof setTimeout;
      document.addEventListener("DOMContentLoaded", () => {
        const st = document.createElement("style");
        st.textContent = ".exchange-card{animation:none!important;opacity:1!important}";
        document.head.append(st);
      });
    });
  let s = newGame("Morgan", "south", 123);
  acquire(s, "mega", "consignment");
  for (const e of s.encounters) e.status = "closed";
  s.presence = { ...presenceOf(s), location: "south.the-lot", zone: "south" };
  s = startStreetSession(s, "south.the-lot").state;
  s.activeSession!.beats.forEach((b, i) => {
    b.kind = "buyer";
    b.seed = 2 + i;
  });
  await page.goto(process.env.PLAYWRIGHT_BASE_PATH || "/");
  await page.evaluate(({ key, raw }) => { localStorage.clear(); localStorage.setItem(key, raw); }, { key: SAVE_KEY, raw: serialize(s) });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await dismissEncounter(page);
  const ack = page.getByRole("button", { name: "Acknowledge", exact: true });
  while (await ack.count()) await ack.click();
  const resume = page.getByRole("button", { name: "Continue session" });
  if (await resume.count()) await resume.click();
}

test("screenshot: exchange card on an iPhone-sized board", async ({ page }) => {
  test.setTimeout(240000);
  await trapping(page, true);
  await expect(page.locator(".exchange-card").first()).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: "test-results/exchange-feed.png" });
  // Never a tap target: the session controls underneath still take taps.
  for (const sel of [".exchange-feed", ".exchange-card", ".exchange-side img"])
    expect(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: /Continue session|Resume/ })).toBeVisible();
});

test("a street sale shows the merchandise given and the cash received, then clears", async ({ page }) => {
  test.setTimeout(240000);
  await trapping(page);
  const card = page.locator(".exchange-card").first();
  await expect(card).toBeVisible({ timeout: 90000 });
  const id = await card.getAttribute("data-transaction");
  const text = await card.innerText();
  const t = (await state(page)).street.transactions.find((x: { id: string }) => x.id === id);
  expect(t.sold).toBeGreaterThan(0);
  expect(text).toContain(`${t.sold}× PINK MAGIC`.toUpperCase());
  expect(text.toUpperCase()).toContain("GIVEN");
  expect(text).toContain(`+$${t.gross}`);
  expect(text.toUpperCase()).toContain("ILLICIT CASH RECEIVED");
  // Not a tap target, and gone on its own within ~3 s.
  await expect(page.locator(`.exchange-card[data-transaction="${id}"]`)).toHaveCount(0, { timeout: 4000 });
  // Failed visits never show money.
  const failures = (await state(page)).street.transactions.filter((x: { sold: number }) => !x.sold);
  for (const f of failures)
    await expect(page.locator(`.exchange-card[data-transaction="${f.id}"]`)).toHaveCount(0);
});
