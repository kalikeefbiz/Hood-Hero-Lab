import { test, expect } from "@playwright/test";
import { threatenedReservoir } from "../src/tests/rivalryFixtures";
import { resolveTerritories } from "../src/systems/Territory";
import { serialize, SAVE_KEY, AUTO_KEY } from "../src/persistence/SaveSystem";
import { dismissEncounter, tapUntil } from "./helpers";

for (const width of [390, 320])
  test(`City rivalry warning, response at the water tower and persistence at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 844 });
    const s = threatenedReservoir();
    for (let d = 0; d < 7; d++) {
      s.day++;
      resolveTerritories(s);
    }
    expect(s.zones.reservoir.controller).toBe("angels");
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
    // Read and acknowledge the actual City notices before opening the district card.
    const notice = page.getByRole("region", { name: "Important developments" });
    let sawLoss = false,
      sawPressure = false;
    for (let i = 0; i < 10 && (await notice.isVisible()); i++) {
      const text = await notice.innerText();
      sawLoss ||=
        text.includes("Control changed") && text.includes("The Reservoir");
      sawPressure ||= text.includes("The Reservoir: Rival pressure");
      await tapUntil(
        page,
        notice.getByRole("button", { name: "Acknowledge", exact: true }),
        async () =>
          !(await notice.isVisible()) || (await notice.innerText()) !== text,
      );
    }
    expect(sawLoss).toBe(true);
    expect(sawPressure).toBe(true);
    const show = page.getByRole("button", { name: "Show details" });
    if (await show.isVisible())
      await tapUntil(page, show, () =>
        page.locator(".board-inspector").isVisible(),
      );
    const places = page.getByRole("region", {
      name: "Places in The Reservoir",
      exact: true,
    });
    await tapUntil(
      page,
      page
        .locator(".district-chips")
        .getByRole("button", { name: /The Reservoir/ }),
      () => places.isVisible(),
    );
    const tower = page.getByRole("region", {
      name: "The water tower",
      exact: true,
    });
    await tapUntil(
      page,
      places.getByRole("button", { name: /The water tower/ }),
      () => tower.isVisible(),
    );
    const neighborhood = page.getByRole("region", {
      name: "Neighborhood strategy",
    });
    await tapUntil(
      page,
      tower.getByRole("button", { name: /Read The Reservoir politics/ }),
      () => neighborhood.isVisible(),
    );
    await expect(neighborhood).toContainText("Your rivals run this neighborhood");
    // No business is owned here, so the panel must not claim one is suffering.
    await expect(neighborhood).not.toContainText("Your business here");
    await expect(neighborhood).toContainText("Gabriel’s Angels gained control");
    await neighborhood.screenshot({
      path: info.outputPath("rivalry-city.png"),
    });
    await neighborhood
      .locator("summary")
      .filter({ hasText: "Influence this neighborhood" })
      .click();
    const challenge = neighborhood.getByRole("button", {
      name: /Challenge Rival Influence/,
    });
    await expect(challenge).toBeEnabled();
    await tapUntil(page, challenge, async () => {
      const raw = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).state,
        AUTO_KEY,
      );
      return raw.strategic.lastActionDay === s.day;
    });
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).state,
      AUTO_KEY,
    );
    expect(saved.ap).toBe(s.ap - 1);
    expect(saved.characters.player.wallet.clean).toBe(
      s.characters.player.wallet.clean - 80,
    );
    expect(
      saved.strategic.territories.reservoir.factions.blocks.influence,
    ).toBeGreaterThan(
      s.strategic.territories.reservoir.factions.blocks.influence,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Resume saved game" }).click();
    await dismissEncounter(page);
    const loaded = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).state,
      AUTO_KEY,
    );
    expect(loaded.strategic).toEqual(saved.strategic);
    expect(loaded.factions).toEqual(saved.factions);
  });
