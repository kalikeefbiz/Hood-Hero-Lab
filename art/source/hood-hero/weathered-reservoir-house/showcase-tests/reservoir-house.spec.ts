import { expect, test } from "@playwright/test";

// The canvas renders at 1× on phones. Exercise that buffer size without
// supersampling the browser compositor on software-rendered CI runners.
test.use({ deviceScaleFactor: 1 });

test("isolated Reservoir house exposes mobile walk, orbit, detail, lighting and rendering metrics", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("reservoir-house.html");
  const walk = page.getByRole("button", { name: "Walk", exact: true });
  await expect(walk).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("canvas")).toHaveJSProperty("width", 390);

  await page.getByRole("button", { name: "360° orbit" }).tap();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "orbit");
  const select = page.getByLabel("View", { exact: true });
  for (const view of ["siding", "windows", "roof", "porch", "side", "rear"]) {
    await select.selectOption(view);
    await expect(select).toHaveValue(view);
    await expect(page.locator("body")).toHaveAttribute("data-mode", "inspect");
  }

  await walk.tap();
  await expect(page.locator("#joystick")).toBeVisible();
  const stick = (await page.locator("#joystick").boundingBox())!;
  await page.touchscreen.tap(stick.x + stick.width / 2, stick.y + 12);
  await page.keyboard.down("KeyW");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "walk");
  await page.keyboard.up("KeyW");
  await walk.tap();
  await expect(page.locator("#joystick")).toBeHidden();

  await page.getByRole("button", { name: "Night", exact: true }).tap();
  await expect(page.locator("body")).toHaveAttribute("data-light", "night");
  await page.getByText("Performance", { exact: true }).tap();
  await expect(page.locator("#stats")).toContainText(
    /390 × \d+ px.*FPS.*house triangles/,
    { timeout: 25_000 },
  );

  await page.getByRole("button", { name: "Night", exact: true }).tap();
  await expect(page.locator("body")).toHaveAttribute("data-light", "day");
  expect(errors).toEqual([]);
});
