import { test, expect, type Page } from "@playwright/test";
import { AUTO_KEY, SAVE_KEY, serialize } from "../src/persistence/SaveSystem";
import { type GameState } from "../src/core/GameState";
import { inventoryOf } from "../src/systems/Inventory";
import { boardPeople } from "../src/board/people";
import { LOCATIONS } from "../src/board/locations";
import { tapUntil, navigate, dismissEncounter } from "./helpers";
const state = (page: Page): Promise<GameState> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state, AUTO_KEY);
async function clearFeedback(page: Page) {
  await dismissEncounter(page);
  const ack = page.getByRole("button", { name: "Acknowledge", exact: true });
  for (let i = 0; i < 12 && (await ack.count()); i++) {
    const before = await ack.count();
    await tapUntil(page, ack.first(), async () => (await ack.count()) < before);
  }
}
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
  await clearFeedback(page);
  await navigate(page, "City");
}
async function place(page: Page, id: string) {
  await clearFeedback(page);
  const show = page.getByRole("button", { name: "Show details" });
  if (await show.isVisible())
    await tapUntil(page, show, () =>
      page.locator(".board-inspector").isVisible(),
    );
  const l = LOCATIONS.find((l) => l.id === id)!,
    s = await state(page),
    districts = page.locator(".district-chips");
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
  await clearFeedback(page);
}

import {
  base,
  ranks,
  shop,
  person,
  at,
  ok,
  crew,
} from "../src/tests/robberyFixtures";
import {
  offerCareerLead,
  careerChance,
  offerTarget,
} from "../src/systems/RobberyCareer";
import { startRobbery } from "../src/systems/Robbery";

function readyHome() {
  for (let seed = 1; seed < 100; seed++) {
    let s = base(seed);
    ranks(s);
    person(s, "dizzy");
    s = ok(offerCareerLead(s, "dizzy", "home.reservoir.2"));
    const j = s.robberies!.jobs.at(-1)!;
    s = shop(s, "home");
    s = crew(s, j.id);
    at(s, j.location);
    const started = startRobbery(s, j.id).state;
    if (started.activeRobbery!.career!.roll < careerChance(started)) return s;
  }
  throw new Error("No suitable deterministic browser fixture");
}
for (const width of [390, 360])
  test(`City home loot → pause/reload → pawn, ${width}px touch`, async ({
    page,
  }, info) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width, height: 780 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await resume(page, readyHome());
    await place(page, "reservoir.homes");
    await tapUntil(
      page,
      page.getByRole("button", { name: "Begin Home invasion session · 1 AP" }),
      async () => !!(await state(page)).activeRobbery,
    );
    const region = page.getByRole("region", {
      name: "Robbery session",
      exact: true,
    });
    const ap = (await state(page)).ap;
    await tapUntil(
      page,
      region.getByRole("button", { name: "Wait and watch · lower pressure" }),
      async () => (await state(page)).activeRobbery!.cursor === 1,
    );
    await tapUntil(
      page,
      region.getByRole("button", { name: "Pause robbery", exact: true }),
      async () => (await state(page)).activeRobbery!.status === "paused",
    );
    const goods = (await state(page)).activeRobbery!.career!.goods;
    await page.reload();
    await page.getByRole("button", { name: "Resume saved game" }).click();
    await clearFeedback(page);
    await navigate(page, "City");
    await tapUntil(
      page,
      region.getByRole("button", { name: "Continue robbery session" }),
      async () => (await state(page)).activeRobbery!.status === "active",
    );
    expect((await state(page)).activeRobbery!.career!.goods).toEqual(goods);
    await tapUntil(
      page,
      region.getByRole("button", { name: /^Take Personal computer/ }),
      async () =>
        inventoryOf(await state(page)).slots.some((x) => x.itemId === "pc"),
    );
    await tapUntil(
      page,
      region.getByRole("button", { name: "Search next room · more pressure" }),
      async () => (await state(page)).activeRobbery!.career!.revealed === 2,
    );
    await page.screenshot({ path: info.outputPath("home-loot.png") });
    await tapUntil(
      page,
      region.getByRole("button", { name: "Leave with current take" }),
      async () => (await state(page)).activeRobbery!.status === "ended",
    );
    expect((await state(page)).ap).toBe(ap);
    expect((await state(page)).robberyCareer!.claims.length).toBe(1);
    await tapUntil(
      page,
      region.getByRole("button", { name: "Return to City", exact: true }),
      async () => !(await state(page)).activeRobbery,
    );
    await place(page, "reservoir.pawn");
    const pawn = page.getByRole("button", { name: /^Pawn Personal computer/ });
    await expect(pawn).toBeVisible();
    const slot = inventoryOf(await state(page)).slots.find(
      (x) => x.itemId === "pc",
    )!;
    await tapUntil(
      page,
      pawn,
      async () =>
        !inventoryOf(await state(page)).slots.some((x) => x.id === slot.id),
    );
    expect(
      (await state(page)).robberyCareer!.cooldowns["home:reservoir"].nextDay,
    ).toBe(6);
    await page.screenshot({ path: info.outputPath("pawn-sold.png") });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

test("City named victim → physical chain → original owner sell-back has active personal beef", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  let fixture: GameState | undefined;
  for (let seed = 1; seed < 100; seed++) {
    let s = base(seed);
    ranks(s);
    s = shop(s);
    person(s, "mega");
    s = ok(offerTarget(s, "criminal.mega", "mega"));
    const started = startRobbery(s, s.robberies!.jobs.at(-1)!.id).state;
    if (started.activeRobbery!.career!.roll < careerChance(started)) {
      fixture = s;
      break;
    }
  }
  if (!fixture) throw new Error("No fixture");
  fixture.characters.mega.wallet.clean = 5000;
  await resume(page, fixture);
  await place(page, fixture.presence!.location);
  await tapUntil(
    page,
    page.getByRole("button", { name: "Begin Strong-arm session · 1 AP" }),
    async () => !!(await state(page)).activeRobbery,
  );
  const region = page.getByRole("region", {
    name: "Robbery session",
    exact: true,
  });
  await tapUntil(
    page,
    region.getByRole("button", { name: "Wait and watch · lower pressure" }),
    async () => (await state(page)).activeRobbery!.cursor === 1,
  );
  await tapUntil(
    page,
    region.getByRole("button", { name: /^Take High-end chain/ }),
    async () =>
      inventoryOf(await state(page)).slots.some(
        (x) => x.itemId === "high-chain",
      ),
  );
  await tapUntil(
    page,
    region.getByRole("button", { name: "De-escalate and finish" }),
    async () => (await state(page)).activeRobbery!.status === "ended",
  );
  await tapUntil(
    page,
    region.getByRole("button", { name: "Return to City", exact: true }),
    async () => !(await state(page)).activeRobbery,
  );
  const mega = boardPeople(await state(page)).find((p) => p.id === "mega")!;
  await place(page, mega.placeId);
  await tapUntil(
    page,
    page
      .locator(".board-people")
      .getByRole("button", { name: new RegExp(mega.name) }),
    () => page.locator(".person-card").isVisible(),
  );
  const returnedIdentity = inventoryOf(await state(page)).slots.find(
    (x) => x.itemId === "high-chain",
  )!.provenance;
  const before = (await state(page)).characters.player.notoriety;
  await tapUntil(
    page,
    page.getByRole("button", { name: /^Sell High-end chain back/ }),
    async () =>
      !inventoryOf(await state(page)).slots.some(
        (x) => x.itemId === "high-chain",
      ),
  );
  const after = await state(page);
  expect(
    after.danger.conflicts.find((c) => c.participants.includes("mega")),
  ).toMatchObject({ state: "worsening", scope: "personal", intent: "seek" });
  expect(after.characters.player.notoriety).toBe(before + 8);
  expect(
    inventoryOf(after, "mega").slots.find(
      (x) => x.provenance === `returned:${returnedIdentity}`,
    )?.quantity,
  ).toBe(1);
  await page.screenshot({ path: info.outputPath("original-owner-beef.png") });
});
