import { expect, test } from "@playwright/test";

const PREVIEW_PATH = "/src/sim/preview/index.html";

test.use({
  viewport: { width: 390, height: 844 },
  ...(process.env.CHROME_PATH
    ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
    : {}),
});

test.describe("One Living Block — isolated mobile preview (390x844)", () => {

  test("renders 5 autonomous NPCs, ?dev inspector, controls, disturbance, and off-view persistence", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`${PREVIEW_PATH}?dev`, { waitUntil: "domcontentloaded" });

    // 1. Canvas and ?dev inspector render cleanly inside phone viewport.
    await expect(page.getByTestId("sim-canvas")).toBeVisible();
    await expect(page.getByTestId("sim-dev-inspector")).toBeVisible();

    // 2. Five autonomous NPCs are present (3 canonical + 2 labeled test residents).
    for (const id of [
      "quanny",
      "mr-lewis",
      "resident-reservoir",
      "sim-resident-lilbit-04",
      "sim-resident-lilbit-06",
    ]) {
      await expect(page.getByTestId(`npc-chip-${id}`)).toBeVisible();
    }

    // 3. Speed up to 15x and verify simulation clock ticks & NPCs move autonomously.
    await page.getByTestId("btn-speed").click(); // 4x -> 15x
    await expect(page.getByTestId("btn-speed")).toContainText("15×");

    const before = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: {
          getPoses: () => { id: string; x: number; z: number }[];
          getSnapshot: () => { clock: { tickCount: number; minuteOfDay: number } };
        };
      }).__livingBlock;
      return {
        ticks: api.getSnapshot().clock.tickCount,
        poses: api.getPoses().map((p) => ({ id: p.id, x: p.x, z: p.z })),
      };
    });

    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: {
          getPoses: () => { id: string; x: number; z: number }[];
          getSnapshot: () => { clock: { tickCount: number; minuteOfDay: number } };
        };
      }).__livingBlock;
      return {
        ticks: api.getSnapshot().clock.tickCount,
        poses: api.getPoses().map((p) => ({ id: p.id, x: p.x, z: p.z })),
      };
    });

    expect(after.ticks).toBeGreaterThan(before.ticks + 10);
    const totalMoved = after.poses.reduce((sum, p, i) => {
      const prev = before.poses[i]!;
      return sum + Math.hypot(p.x - prev.x, p.z - prev.z);
    }, 0);
    expect(totalMoved).toBeGreaterThan(3);

    // 4. Trigger environmental disturbance and verify reaction.
    await page.getByTestId("btn-disturbance").click();
    await page.waitForTimeout(250);
    const hasDisturbance = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: {
          getSnapshot: () => { disturbances: unknown[]; npcs: { goal: { activity: string } }[] };
        };
      }).__livingBlock;
      const snap = api.getSnapshot();
      return (
        snap.disturbances.length > 0 &&
        snap.npcs.some((n) => n.goal.activity === "react_disturbance")
      );
    });
    expect(hasDisturbance).toBe(true);

    // Optional screenshot hook for verification runs.
    if (process.env.SIM_PREVIEW_SHOT) {
      await page.screenshot({ path: process.env.SIM_PREVIEW_SHOT, fullPage: false });
    }

    // 5. Leave block -> 1 Hz off-view persistence -> Return without resetting.
    await page.getByTestId("btn-area").click();
    await expect(page.getByTestId("offview-banner")).toBeVisible();
    await expect(page.getByTestId("sim-status")).toContainText("1 Hz Off-View");

    const ticksLeft = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: { getSnapshot: () => { clock: { tickCount: number } } };
      }).__livingBlock;
      return api.getSnapshot().clock.tickCount;
    });

    await page.waitForTimeout(600);

    const ticksOffview = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: { getSnapshot: () => { clock: { tickCount: number } } };
      }).__livingBlock;
      return api.getSnapshot().clock.tickCount;
    });
    expect(ticksOffview).toBeGreaterThan(ticksLeft);

    await page.getByTestId("btn-area").click();
    await expect(page.getByTestId("offview-banner")).toBeHidden();
    await expect(page.getByTestId("sim-status")).toContainText("20 Hz Active");

    // 6. Pause freezes tick advancement.
    await page.getByTestId("btn-pause").click();
    const pausedTick = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: { getSnapshot: () => { clock: { tickCount: number } } };
      }).__livingBlock;
      return api.getSnapshot().clock.tickCount;
    });
    await page.waitForTimeout(300);
    const pausedTickLater = await page.evaluate(() => {
      const api = (window as unknown as {
        __livingBlock: { getSnapshot: () => { clock: { tickCount: number } } };
      }).__livingBlock;
      return api.getSnapshot().clock.tickCount;
    });
    expect(pausedTickLater).toBe(pausedTick);

    expect(errors).toEqual([]);
  });

  test("omits dev inspector when ?dev query flag is absent", async ({ page }) => {
    await page.goto(PREVIEW_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("sim-canvas")).toBeVisible();
    await expect(page.getByTestId("sim-dev-inspector")).toHaveCount(0);
  });
});
