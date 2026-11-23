import { test, expect, type Page, type CDPSession } from "@playwright/test";

// Player controller preview (strip.html, default walk mode, NPCs from the living simulation): a temporary avatar driven by the
// on-screen touch stick, colliding with the map, followed by the camera, walking up to a real
// door and using the engine there. Chromium sends genuine touch events through CDP.

const LIL_JAYS_FRONT = 0.95; // z of Lil Jay's front wall (cityMap WALLS "lil-jays")

async function ready(page: Page) {
  await page.goto("strip.html");
  await page.waitForFunction(
    () => !document.querySelector("#progress") && (window as any).__strip.walk?.avatarLoaded(),
    null,
    { timeout: 180_000 },
  );
}
const player = (page: Page) => page.evaluate(() => {
  const w = (window as any).__strip.walk;
  const p = w.player();
  return { x: p.x, z: p.z, motion: p.motion, nearby: p.nearby.map((a: any) => a.id), anim: w.avatarState(), offered: w.offered(), cam: w.camera() };
});

/** A finger on the stick: angle in degrees (0 = up/forward, 90 = right), fraction of full tilt. */
async function makeStick(page: Page) {
  const pad = (await page.locator("#pad").boundingBox())!;
  const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2, r = pad.width / 2;
  let cdp: CDPSession | null = null;
  try { cdp = await page.context().newCDPSession(page); } catch { cdp = null; }
  const at = (deg: number, tilt: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + Math.sin(a) * r * tilt, y: cy - Math.cos(a) * r * tilt };
  };
  let down = false;
  return {
    async hold(deg: number, tilt: number) {
      const p = at(deg, tilt);
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: down ? "touchMove" : "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      } else {
        if (!down) { await page.mouse.move(cx, cy); await page.mouse.down(); }
        await page.mouse.move(p.x, p.y);
      }
      down = true;
    },
    async release() {
      if (!down) return;
      if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      else await page.mouse.up();
      down = false;
    },
  };
}

test("walk and run with the touch stick, collide with a wall, camera follows and stays out of buildings, then use Lil Jay's", async ({ page }) => {
  test.setTimeout(420_000);
  await ready(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
  const start = await player(page);
  expect(start.motion).toBe("idle");
  expect(start.anim).toBe("idle");

  const stick = await makeStick(page);

  // Walk forward (the camera starts behind the player, looking west along Lil Bit Lane).
  await stick.hold(0, 0.55);
  await page.waitForFunction(() => (window as any).__strip.walk.player().motion === "walk", null, { timeout: 30_000 });
  expect((await player(page)).anim).toBe("walk");

  // Push to the edge: run.
  await stick.hold(0, 1);
  await page.waitForFunction(() => (window as any).__strip.walk.player().motion === "run", null, { timeout: 60_000 });
  expect((await player(page)).anim).toBe("run");

  // Keep going until we're in front of Lil Jay's door; the prompt offers it.
  await stick.hold(0, 0.6);
  await page.waitForFunction(() => (window as any).__strip.walk.player().x < 1.0, null, { timeout: 120_000 });
  await stick.release();
  await page.waitForFunction(() => (window as any).__strip.walk.player().motion === "idle", null, { timeout: 30_000 });
  const atDoor = await player(page);
  expect(atDoor.nearby).toContain("reservoir.lil-jays");
  expect(atDoor.offered).toBe("reservoir.lil-jays");
  // Either the door, or Quanny if the simulation has him right beside you there.
  await expect(page.locator("#prompt")).toHaveText(/Go in · Lil Jay's Market|Talk to Quanny/);

  // Blocked: push right (north, into the store front) and stay outside the wall.
  await stick.hold(90, 0.7);
  await page.waitForTimeout(4_000);
  const blocked = await player(page);
  expect(blocked.z).toBeGreaterThanOrEqual(LIL_JAYS_FRONT + 0.3 - 0.01);
  await stick.release();

  // Swing the camera round so the store is behind the player: it pulls in instead of going inside.
  const canvas = (await page.locator("#strip").boundingBox())!;
  const y = canvas.height * 0.35;
  await page.mouse.move(canvas.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(canvas.width * 0.25 + 150, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1_500);
  const cam = (await player(page)).cam;
  const insideStore = cam.x > -4.04 && cam.x < 4.79 && cam.z > -10.05 && cam.z < LIL_JAYS_FRONT && cam.y < 7.5;
  expect(insideStore, JSON.stringify(cam)).toBe(false);
  expect(cam.shown).toBeLessThan(cam.distance);

  // Use the door: the engine's arrival runs and its real actions show.
  await page.locator("#prompt").click();
  const card = page.locator(".place");
  await expect(card.locator("h2")).toHaveText("Lil Jay's Market");
  await card.locator(".act[data-command=respondEncounter]:not([disabled])").first().click();
  await expect(card.locator(".result")).toContainText("Quanny");
  for (let i = 0; i < 3; i++) {
    const more = card.locator(".actions > .act[data-command=respondEncounter]:not([disabled])");
    if (!(await more.count())) break;
    await more.first().click();
  }
  await card.locator(".act[data-target=necessities]:not([disabled])").click();
  await expect(card.locator(".result .deltas")).toHaveText("−1 AP · −$16 clean");

  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(storageBefore);
});

test("pins point the way in walk mode; they never teleport the player", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  const before = await player(page);
  const pos = await page.evaluate(() => (window as any).__strip.preview.screenOf("reservoir.lil-jays"));
  expect(pos.visible).toBe(true);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator(".toast")).toContainText("walk up to it");
  const after = await player(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
  await expect(page.locator(".place")).toBeHidden();
  await expect(page.locator("#places")).toBeHidden();
});

test("NPCs move on their own; walk up to Quanny and talk to him through the engine", async ({ page }) => {
  test.setTimeout(420_000);
  await ready(page);
  const npcs = () => page.evaluate(() => (window as any).__strip.sim.getNpcs().map((n: any) => ({ id: n.id, x: n.x, z: n.z, loco: n.locomotion })));
  const first = await npcs();
  expect(first).toHaveLength(5);
  // Software rendering here is slow; run the neighborhood clock fast for a moment.
  await page.evaluate(() => (window as any).__strip.sim.setSpeedMultiplier(10));
  await page.waitForTimeout(6_000);
  await page.evaluate(() => (window as any).__strip.sim.setSpeedMultiplier(1));
  const later = await npcs();
  const moved = later.filter((n: any) => { const a = first.find((f: any) => f.id === n.id); return Math.hypot(n.x - a.x, n.z - a.z) > 0.5; });
  expect(moved.length, "some NPCs walk while the player stands still").toBeGreaterThan(0);

  // Quanny is posted up outside Lil Jay's at 08:05; walk toward him until the prompt offers him.
  const stick = await makeStick(page);
  await stick.hold(0, 0.5);
  await page.waitForFunction(() => (window as any).__strip.walk.offeredPerson() === "quanny", null, { timeout: 120_000 });
  await stick.release();
  await expect(page.locator("#prompt")).toHaveText("Talk to Quanny");
  await page.locator("#prompt").click();
  const card = page.locator(".place");
  await expect(card.locator(".people .chip")).toContainText(["Quanny"]);
  await card.locator(".act[data-command=respondEncounter]:not([disabled])").first().click();
  await expect(card.locator(".result")).toContainText("Quanny");
});
