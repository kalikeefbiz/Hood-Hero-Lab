import {
  expect,
  errors,
  test,
  type Page,
  type Locator,
} from "@playwright/test";
// Baseline UI tests intentionally put aside the opening conversation first.
// Modal behavior itself is exercised in encounters.spec.ts.
export async function dismissEncounter(page: Page) {
  await expect(page.locator(".game-shell")).toBeVisible();
  const modal = page.getByRole("dialog", { name: "Character encounter" });
  if (await modal.count())
    await tapUntil(
      page,
      modal.getByRole("button", { name: "Close conversation" }),
      async () => (await modal.count()) === 0,
    );
}

/** Retap a user command only while its expected state has not been acknowledged.
 * The input guard may deliberately reject a tap during software-rendered stalls.
 * Callers must identify the same operation (including a specific visitor cursor).
 */
export async function tapUntil(
  page: Page,
  button: Locator,
  acknowledged: () => Promise<boolean>,
  timeout = 20000,
) {
  await expect
    .poll(
      async () => {
        if (await acknowledged()) return true;
        const enabled = await button
          .isEnabled({ timeout: 500 })
          .catch((error) => {
            if (error instanceof errors.TimeoutError) return false;
            throw error;
          });
        if ((await button.isVisible()) && enabled) {
          await page.waitForTimeout(400); // Let the guarded post-stall window finish.
          if (!(await acknowledged())) {
            try {
              // The iPhone projects dispatch a native touch gesture atomically.
              // Separate emulated mouse down/up commands can age during software WebGL frames.
              if (test.info().project.use.hasTouch)
                await button.tap({ timeout: 5000 });
              else await button.click({ timeout: 5000 });
            } catch (error) {
              if (!(error instanceof errors.TimeoutError)) throw error;
            }
          }
        }
        return acknowledged();
      },
      { timeout, intervals: [500, 800, 1200] },
    )
    .toBe(true);
}

/** A discarded stale tap is intentional. Retap navigation after the guard settles,
 * then assert the destination before using its controls. Never bypass the input guard. */
export async function navigate(page: Page, name: string) {
  const button = page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true });
  await tapUntil(
    page,
    button,
    async () => (await button.getAttribute("aria-current")) === "page",
    30000,
  );
}
export async function category(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect
    .poll(
      async () => {
        if ((await button.getAttribute("aria-pressed")) !== "true")
          await button.click();
        return button.getAttribute("aria-pressed");
      },
      { timeout: 15000, intervals: [500, 800, 1200] },
    )
    .toBe("true");
}
export async function honest(page: Page) {
  await navigate(page, "Actions");
  await category(page, "Honest");
}
export async function connects(page: Page, person?: string) {
  await navigate(page, "Actions");
  await category(page, "Connects");
  if (person)
    await page
      .getByLabel("Connected contacts", { exact: true })
      .selectOption(person);
}
export async function storyline(page: Page) {
  await dismissEncounter(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "City", exact: true })
    .click();
  await dismissEncounter(page);
  await page
    .getByRole("button", { name: "Open The Chains storyline", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Character encounter" });
  const clarify = modal.getByRole("button", { name: /Tell me what happened/ });
  if (await clarify.count()) await clarify.click();
}
export async function storyAction(page: Page, type: string) {
  await storyline(page);
  const names: Record<string, RegExp> = {
    buyback: /Pay to return the chains/,
    negotiate: /Talk down the demand/,
    settlement: /Bring the dispute to Pablo/,
    recover: /Attempt property recovery/,
  };
  await page
    .getByRole("dialog", { name: "Character encounter" })
    .getByRole("button", { name: names[type] })
    .click();
}
