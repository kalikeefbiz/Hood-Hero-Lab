import { test, expect, type Page } from "@playwright/test";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";
import { newGame } from "../src/tests/legacyGame";
import { type GameState } from "../src/core/GameState";
import { receivePhysical, gain, inventoryOf } from "../src/systems/Inventory";
import { RESIDENCES } from "../src/systems/Residences";
import { boardPeople } from "../src/board/people";
import { presenceOf } from "../src/board/presence";
import { LOCATIONS } from "../src/board/locations";
import { skillsOf } from "../src/systems/Skills";
import { tapUntil, navigate } from "./helpers";
const state = (page: Page): Promise<GameState> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state, AUTO_KEY);
async function resume(page: Page, s: GameState) {
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
  await navigate(page, "City");
}
async function place(page: Page, id: string) {
  const show = page.getByRole("button", { name: "Show details" });
  if (await show.isVisible())
    await tapUntil(page, show, () =>
      page.locator(".board-inspector").isVisible(),
    );
  const l = LOCATIONS.find((l) => l.id === id)!,
    s = await state(page),
    districts = page.getByRole("group", {
      name: "Five neighborhoods of Stixx City",
    });
  if (!(await districts.isVisible()))
    await tapUntil(
      page,
      page
        .getByRole("group", { name: "Board location" })
        .getByRole("button", { name: "Stixx City", exact: true }),
      () => districts.isVisible(),
    );
  const list = page.getByRole("region", {
    name: `Places in ${s.zones[l.zone].name}`,
  });
  await tapUntil(
    page,
    districts.getByRole("button", { name: new RegExp(s.zones[l.zone].name) }),
    () => list.isVisible(),
  );
  await tapUntil(
    page,
    list.getByRole("button", {
      name: new RegExp(l.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    }),
    () => page.getByRole("region", { name: l.name, exact: true }).isVisible(),
  );
  const go = page.getByRole("button", { name: "Go here", exact: true });
  if (await go.count())
    await tapUntil(
      page,
      go,
      async () => (await state(page)).presence?.location === id,
    );
}
test("City residence and member cards enforce slot/load rules and real equipment bonuses", async ({
  page,
}) => {
  const s = newGame("Inventory review", "south", 2026),
    residence = RESIDENCES.find((r) => r.zone === "south")!;
  s.characters.player.wallet.clean = 5000;
  s.encounters.forEach((e) => (e.status = "closed"));
  s.presence = { ...presenceOf(s), location: residence.id, zone: "south" };
  receivePhysical(s, s.playerId, gain("law-19"));
  receivePhysical(s, s.playerId, gain("music"));
  const member = "flacco";
  skillsOf(s.characters[member]).milestones.certified = 1;
  // 12 load, leaving exactly room for the Law-19; a second heavy transfer must fail.
  receivePhysical(s, member, gain("smokes", 12));
  await resume(page, s);
  await place(page, residence.id);
  // Buy the home from its own card in the city.
  const forSale = page.getByRole("region", { name: "Residence" });
  await tapUntil(
    page,
    forSale.getByRole("button", { name: /^Buy for \$/ }),
    async () => !!(await state(page)).residences?.[residence.id],
  );
  const home = page.getByRole("region", { name: "Your residence" });
  await home.getByRole("group", { name: "On you" }).getByRole("button", { name: /Pocket music player ×1/ }).click();
  await expect(home.getByText(/→ \d+\/40 load/)).toBeVisible(); // safe load preview
  await tapUntil(
    page,
    home.getByRole("button", { name: "Put in safe 1" }),
    async () =>
      !!(await state(page)).residences![residence.id].safe.slots.some(
        (x) => x.itemId === "music",
      ),
  );
  // Hand a Law-19 to a Set member in person, then have them carry it.
  const person = boardPeople(await state(page)).find((n) => n.id === member)!;
  await place(page, person.placeId);
  await tapUntil(
    page,
    page
      .locator(".board-people")
      .getByRole("button", { name: new RegExp(person.name) }),
    () => page.locator(".person-card").isVisible(),
  );
  const gear = page.locator(".member-inventory");
  await gear.getByRole("group", { name: "You" }).getByRole("button", { name: /^Law-19 ×1/ }).click();
  await tapUntil(
    page,
    gear.getByRole("button", { name: /^Give .* 1$/ }),
    async () =>
      inventoryOf(await state(page), member).slots.some(
        (x) => x.itemId === "law-19",
      ),
  );
  await tapUntil(
    page,
    gear.getByRole("button", { name: "Have them carry Law-19" }),
    async () =>
      (await state(page)).characters[member].equipment?.equipped === "law-19",
  );
  await expect(gear.getByText(/Attack \+2 · Defense \+1/)).toBeVisible();
  await expect(gear.getByText(/15\/15 load/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("member-gear.png") });
  // A saved, valid full safe is independent of the full-load member.
  const full = await state(page);
  receivePhysical(full, full.playerId, gain("arp"));
  full.residences![residence.id].safe.slots = [];
  for (let i = 0; i < 20; i++)
    full.residences![residence.id].safe.slots.push({
      id: `safe-music-${i}`,
      kind: "possession",
      itemId: "music",
      quantity: 1,
      provenance: "browser-fixture",
    });
  await resume(page, full);
  await place(page, person.placeId);
  await tapUntil(
    page,
    page
      .locator(".board-people")
      .getByRole("button", { name: new RegExp(person.name) }),
    () => page.locator(".person-card").isVisible(),
  );
  const before = serialize(await state(page));
  const gear2 = page.locator(".member-inventory");
  await gear2.getByRole("group", { name: "You" }).getByRole("button", { name: /^ARP ×1/ }).click();
  await expect(gear2.getByRole("button", { name: /^Give .* 1$/ })).toBeDisabled();
  await expect(gear2.getByText("Need 6 more load capacity.")).toBeVisible();
  expect(serialize(await state(page))).toBe(before);
  await place(page, residence.id);
  const home2 = page.getByRole("region", { name: "Your residence" });
  await home2.getByRole("group", { name: "On you" }).getByRole("button", { name: /^ARP ×1/ }).click();
  await expect(home2.getByRole("button", { name: "Put in safe 1" })).toBeDisabled();
  await expect(home2.getByText("Need 6 more load capacity.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("safe-full.png") });
  expect(
    inventoryOf(await state(page)).slots.some((x) => x.itemId === "arp"),
  ).toBe(true);
});
