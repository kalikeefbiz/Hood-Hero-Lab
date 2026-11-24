// Run with the repository's installed Playwright. Start the preview server first.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [output, url = "http://127.0.0.1:4176/art/incoming/character-pipeline-pilot/preview/"] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 840 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  await mkdir(output, { recursive: true });
  await page.goto(url);
  await page.waitForFunction(() => window.pilot || !document.querySelector("#status").textContent.startsWith("Loading"));
  if (!(await page.evaluate(() => !!window.pilot))) throw Error(await page.locator("#status").innerText() + errors.join("\n"));
  const frame = (options, t) => page.evaluate(([o, time]) => window.pilot.frame(o, time), [options, t]);
  const capture = (name) => page.locator("#stage").screenshot({ path: resolve(output, name), timeout: 25_000 });

  for (const view of ["Front", "Side", "Rear"]) {
    await frame({ clip: "Idle", view, clothing: true }, 0);
    await capture(`${view.toLowerCase()}.png`);
  }
  await frame({ clip: "Idle", view: "Front", frame: "Close-up", clothing: true }, 0);
  await capture("close-up.png");
  await frame({ clip: "Bind", view: "Front", frame: "Full body", skeleton: true, clothing: false }, 0);
  await capture("bind.png");
  await frame({ clip: "Run", view: "¾", frame: "Gameplay", skeleton: false, light: "Night", clothing: true }, .18);
  await capture("night-gameplay.png");
  const statistics = await page.evaluate(() => window.pilot.stats);
  await page.setViewportSize({ width: 390, height: 844 });
  await frame({ clip: "Walk", model: "b", view: "Side", frame: "Full body", light: "Day", clothing: true }, .28);
  await page.screenshot({ path: resolve(output, "phone-sized.png") });
  const phone = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    triangles: window.pilot.stats.b.triangles,
    drawCalls: window.pilot.stats.b.calls,
  }));
  if (phone.overflow) throw Error("Phone viewport overflows");
  await writeFile(resolve(output, "browser.json"), JSON.stringify({ errors, statistics, phone }, null, 2) + "\n");
  if (errors.length) throw Error(errors.join("\n"));

  if (process.env.PILOT_RECORD === "1") {
    await page.setViewportSize({ width: 960, height: 740 });
    for (const [clip, seconds] of [["Idle", 8], ["Walk", 4], ["Run", 3]]) {
      const directory = resolve(output, clip);
      await mkdir(directory, { recursive: true });
      for (let i = 0; i < seconds * 15; i++) {
        await frame({ model: "all", clip, view: clip === "Idle" ? "¾" : "Side", clothing: true }, i / 15);
        await capture(`${clip}/${String(i).padStart(4, "0")}.png`);
      }
    }
  }
} finally {
  await browser.close();
}
