import { expect, type Page } from "@playwright/test";
// Baseline UI tests intentionally put aside the opening conversation first.
// Modal behavior itself is exercised in encounters.spec.ts.
export async function dismissEncounter(page: Page) {
  await expect(page.locator(".game-shell")).toBeVisible();
  const modal = page.getByRole("dialog", { name: "Character encounter" });
  for (let i = 0; i < 8 && (await modal.count()); i++)
    await modal.getByRole("button", { name: "Close conversation" }).click();
}

/** A discarded stale tap is intentional. Retap navigation after the guard settles,
 * then assert the destination before using its controls. Never bypass the input guard. */
export async function navigate(page: Page, name: string) {
  const button = page.getByRole('navigation').getByRole('button', {name, exact:true});
  await expect.poll(async()=>{
    if(await button.getAttribute('aria-current') !== 'page') await button.click();
    return button.getAttribute('aria-current');
  },{timeout:15000,intervals:[500,800,1200]}).toBe('page');
}
export async function honest(page: Page) {
  await navigate(page, 'Actions');
  await page.getByRole('button', {name:'Honest', exact:true}).click();
}
export async function connects(page: Page, person?: string) {
  await navigate(page, 'Actions');
  await page.getByRole('button', {name:'Connects', exact:true}).click();
  if(person) await page.getByLabel('Connected contacts', {exact:true}).selectOption(person);
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
