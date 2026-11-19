import { expect, test, type Page } from "@playwright/test";
import type { BoardRenderer } from "../src/board/BoardRenderer";
import { MARKET, canWalkReservoir } from "../src/board/reservoirWalk";
import { ITEMS } from "../src/content/economy";
import { cash, player, type GameState } from "../src/core/GameState";
import { newGame } from "../src/core/Simulation";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";
import { tapUntil } from "./helpers";

test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });

const snapshot = (page: Page): Promise<GameState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, AUTO_KEY);

const camera = (page: Page) => page.evaluate(() =>
  (window as unknown as Window & { __stixxBoard: BoardRenderer }).__stixxBoard.debugState);

async function hold(page: Page, key: string, done: () => Promise<boolean>) {
  await page.keyboard.down(key);
  try {
    await expect.poll(done, { intervals: [50, 75, 100], timeout: 15000 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

for (const outcome of ["escalate", "retreat"] as const) {
  test(`Reservoir walkabout · ${outcome} and return to the board`, async ({ page, browserName }, info) => {
    test.setTimeout(120000);
    const s = newGame("Morgan", "south", 9009);
    s.acknowledgedEvents = s.events.map((e) => e.id);
    for (const e of s.encounters) {
      e.status = "pending";
      e.deferred = true;
    }
    await page.goto("/");
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw),
      { key: SAVE_KEY, raw: serialize(s) });
    await page.reload();
    await page.getByRole("button", { name: "Resume saved game" }).tap();
    await expect(page.locator(".board-canvas")).toBeVisible({ timeout: 30000 });
    const crumbs = page.getByRole("group", { name: "Board location" });
    await tapUntil(page, crumbs.getByRole("button", { name: "Stixx City", exact: true }),
      () => page.getByRole("button", { name: "Select The Reservoir" }).isVisible());
    const entry = page.getByRole("button", { name: "Walk the Reservoir" });
    await tapUntil(page, page.getByRole("button", { name: "Select The Reservoir" }), () => entry.isVisible());
    const board = page.getByRole("button", { name: "Return to board" });
    await tapUntil(page, entry, () => board.isVisible());
    const stick = page.getByLabel("Drag to walk");
    await expect(stick).toBeVisible();
    const talk = page.getByRole("button", { name: "Speak to Quanny" });
    const shop = page.getByRole("button", { name: "Shop at Lil Jay’s" });
    await expect(talk).toHaveCount(0);
    await expect(shop).toHaveCount(0);
    const initial = await camera(page);
    const initialX = initial.street![0];
    const box = (await stick.boundingBox())!;
    const dock = (await page.getByRole("navigation").boundingBox())!;
    expect(box.y + box.height).toBeLessThan(dock.y);
    expect(box.width).toBeGreaterThanOrEqual(44);

    if (browserName === "chromium") {
      // Send a native touch drag. WebKit's Playwright API exposes tap only.
      const cdp = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      try {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 38, y }] });
        await expect.poll(async () => (await camera(page)).street![0]).toBeGreaterThan(initialX + 1);
      } finally {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
      }
    }
    if (!(await talk.isVisible())) await hold(page, "ArrowRight", () => talk.isVisible());
    const beforeCollision = await camera(page);
    await hold(page, "ArrowUp", async () => (await camera(page)).street![2] < beforeCollision.street![2] - 1);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(800);
    await page.keyboard.up("ArrowUp");
    const collision = (await camera(page)).street!;
    expect(canWalkReservoir(collision[0], collision[2])).toBe(true);
    expect(canWalkReservoir(collision[0], collision[2] - 0.6)).toBe(false);
    expect(Math.abs((await camera(page)).target[0] - collision[0])).toBeLessThan(1.5);
    expect((await snapshot(page)).ap).toBe(s.ap);
    if (!(await talk.isVisible())) await hold(page, "ArrowDown", () => talk.isVisible());

    const conversation = page.getByRole("dialog", { name: "Character encounter" });
    await tapUntil(page, talk, () => conversation.isVisible());
    await expect(conversation).toContainText("Aye, where you from?");
    await conversation.getByRole("button", { name: /Ion bang/ }).tap();
    await expect(conversation).toContainText("What you got?");
    await tapUntil(page, conversation.getByRole("button", { name: "Close conversation" }),
      async () => !(await conversation.isVisible()));
    const met = await snapshot(page);
    expect(met.quanny.claim).toBe("unaffiliated");
    expect(player(met).known).toContain("quanny");

    if (!(await shop.isVisible())) await hold(page, "ArrowRight", () => shop.isVisible());
    const market = page.getByRole("dialog", { name: "Lil Jay’s Market" });
    await tapUntil(page, shop, () => market.isVisible());
    const item = market.locator("[data-action=buy]").filter({ hasText: ITEMS.necessities.name });
    await expect(item).toContainText(`1 AP · $${ITEMS.necessities.price}`);
    await item.getByRole("button", { name: "Take action" }).tap();
    await expect.poll(async () => (await snapshot(page)).ap).toBe(s.ap - 1);
    const bought = await snapshot(page);
    expect(cash(player(bought))).toBe(cash(player(met)) - ITEMS.necessities.price);
    expect(bought.events.some((e) => e.text.includes("bought " + ITEMS.necessities.name.toLowerCase()))).toBe(true);
    expect(bought.presence?.location).toBe(MARKET);

    // Quanny steps into the first known-contact slot after the introduction.
    // Move out from the storefront before approaching him again.
    const storefrontZ = (await camera(page)).street![2];
    await hold(page, "ArrowDown", async () => (await camera(page)).street![2] > storefrontZ + 1);
    const approach = page.getByRole("button", { name: "Approach Quanny" });
    if (!(await approach.isVisible())) await hold(page, "ArrowRight", () => approach.isVisible());
    const confrontation = page.getByRole("region", { name: "Street confrontation" });
    await tapUntil(page, approach, () => confrontation.isVisible());
    const escalate = confrontation.getByRole("button", { name: "Dismiss them disrespectfully" });
    await expect(escalate).toBeVisible();
    await page.screenshot({ path: info.outputPath("confrontation.png") });
    const frames: number[] = await page.evaluate(() => new Promise((resolve) => {
      const intervals: number[] = [];
      let previous = performance.now();
      function frame(now: number) {
        intervals.push(now - previous);
        previous = now;
        if (intervals.length < 30) requestAnimationFrame(frame);
        else resolve(intervals);
      }
      requestAnimationFrame(frame);
    }));
    console.log(info.project.name, "30-frame mean ms", frames.reduce((sum, value) => sum + value, 0) / frames.length);
    await info.attach("frame intervals", { body: JSON.stringify(frames), contentType: "application/json" });
    if (outcome === "retreat") {
      await hold(page, "ArrowLeft", async () => !(await escalate.isVisible()));
      await expect(confrontation).toContainText("Out of speaking range");
      await hold(page, "ArrowRight", () => escalate.isVisible());
      await hold(page, "ArrowLeft", async () => !(await confrontation.isVisible()));
    } else {
      await tapUntil(page, escalate, async () => !(await confrontation.isVisible()));
    }
    const after = await snapshot(page);
    const scene = after.danger.scenes.find((row) => row.npc === "quanny")!;
    expect(scene.status).toBe("resolved");
    const result = after.encounters.find((e) => e.dangerSceneId === scene.id)!;
    expect(result.selectedResponses.at(-1)?.id).toBe(outcome === "retreat" ? "leave" : "disrespect");
    expect(result.selectedResponses.at(-1)?.eventIds.length).toBeGreaterThan(0);
    if (outcome === "escalate") {
      expect(after.danger.conflicts.find((c) => c.id === scene.conflictId)?.participants).toContain("quanny");
      expect(after.characters.quanny.relationships.player.grievance).toBeGreaterThan(met.characters.quanny.relationships.player.grievance);
    }
    if (await board.isVisible()) await tapUntil(page, board, async () => !(await stick.isVisible()));
    await expect(crumbs).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Resume saved game" }).tap();
    await expect(page.locator(".game-shell")).toBeVisible();
    const restored = await snapshot(page);
    expect(restored.danger).toEqual(after.danger);
    expect(restored.ap).toBe(after.ap);
    expect(restored.events.map((e) => e.id)).toEqual(after.events.map((e) => e.id));
    expect(restored.presence?.location).toBe(MARKET);
    expect(await stick.count()).toBe(0);
    await expect(page.locator(".board-canvas")).toBeVisible({ timeout: 30000 });
    await info.attach("board camera", { body: JSON.stringify(await camera(page)), contentType: "application/json" });
  });
}
