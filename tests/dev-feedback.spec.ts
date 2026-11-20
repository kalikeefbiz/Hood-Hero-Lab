import { expect, test, type Page } from "@playwright/test";
import { dismissEncounter } from "./helpers";

// Only meaningful in builds made with VITE_DEV_FEEDBACK=1 (the Lab deploy).
test.skip(!process.env.PLAYWRIGHT_DEV_FEEDBACK, "dev feedback build only");

async function start(page: Page) {
  await page.goto("/");
  await page.getByLabel("What do people call you?").fill("Morgan");
  await page.getByRole("radio", { name: "Southside", exact: false }).check();
  await page.getByRole("button", { name: "Enter Stixx City" }).click();
  await dismissEncounter(page);
  await expect(page.getByRole("heading", { name: "Morgan" })).toBeVisible();
}

test("dev note opens over the game, captures context and files an issue", async ({ page }) => {
  await start(page);
  const fab = page.getByRole("button", { name: "Dev note (N)" });
  await expect(fab).toBeVisible();
  await page.screenshot({ path: "test-results/dev-feedback-button.png" });
  // The button must not cover the bottom navigation.
  const nav = await page.locator(".bottom-nav").boundingBox();
  const box = await fab.boundingBox();
  if (nav && box) expect(box.y + box.height).toBeLessThanOrEqual(nav.y);

  // Without a token: prefilled GitHub link.
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((u: string) => {
      (window as unknown as { opened: string[] }).opened.push(u);
      return null;
    }) as typeof window.open;
  });
  await fab.click();
  const sheet = page.getByRole("dialog", { name: "Dev feedback" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Day 1");
  await page.screenshot({ path: "test-results/dev-feedback-sheet.png" });
  const send = sheet.getByRole("button", { name: "Open in GitHub" });
  await expect(send).toBeDisabled();
  await sheet.getByRole("button", { name: "Text sounds off" }).click();
  await expect(sheet.getByRole("button", { name: "Text sounds off" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByLabel("Note").fill("Cuzzo's line reads stiff");
  await send.click();
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  expect(opened[0]).toContain("github.com/kalikeefbiz/Hood-Hero-Lab/issues/new");
  expect(new URL(opened[0]).searchParams.get("body")).toContain("Cuzzo's line reads stiff");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  // With a token: screenshot upload + issue, all mocked.
  const calls: { method: string; url: string; body: unknown }[] = [];
  await page.route("https://api.github.com/**", async (route) => {
    const r = route.request();
    calls.push({ method: r.method(), url: r.url(), body: r.postDataJSON() });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(
        r.url().includes("/contents/")
          ? { content: {} }
          : { number: 42, html_url: "https://github.com/x/42", title: "t" },
      ),
    });
  });
  await page.keyboard.press("n");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Send straight from the game instead" }).click();
  await sheet.getByLabel("GitHub token").fill("test-token");
  await sheet.getByRole("button", { name: "Save token" }).click();
  await sheet.getByRole("button", { name: "Something broke" }).click();
  await sheet.getByRole("button", { name: "Send note" }).click();
  await expect(sheet).toContainText("Sent as #42");
  const issue = calls.find((c) => c.url.endsWith("/issues"))!;
  expect(issue.method).toBe("POST");
  const body = issue.body as { title: string; labels: string[]; body: string };
  expect(body.labels).toEqual(["feedback", "fb:broke"]);
  expect(body.body).toContain("| Screen | City |");
  const shot = calls.find((c) => c.url.includes("/contents/shots/"));
  if (shot) expect(body.body).toContain("feedback-shots/shots/");
  await expect(sheet).toBeHidden({ timeout: 6000 });
  await expect(fab).toBeVisible();
});
