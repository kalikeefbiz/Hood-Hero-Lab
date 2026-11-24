import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium, devices } = require("@playwright/test");
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const browser = await chromium.launch({ executablePath: chromiumPath,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("http://127.0.0.1:4176/art/incoming/character-pipeline-pilot/preview/");
  await page.waitForFunction(() => !!window.pilot);
  await page.locator("#model").selectOption("b");
  await page.locator("#clothing").tap();
  await page.locator("#skeleton").tap();
  await page.locator("#light").selectOption("Night");
  await page.locator("#frame").selectOption("Close-up");
  await page.locator("#view").selectOption("Rear");
  const pass = await page.evaluate(() => {
    const b = pilot.views.find(view => view.id === "b");
    const weights = () => Object.fromEntries(b.gltf.animations.map(clip => {
      const action = b.mixer.clipAction(clip);
      return [clip.name, action.isRunning() ? action.getEffectiveWeight() : 0];
    }));
    const series = [];
    const select = document.querySelector("#clip");
    select.value = "Walk";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return new Promise(resolve => {
      let start;
      const sample = (now) => {
        start ??= now;
        series.push(weights());
        if (now - start < 1500) requestAnimationFrame(sample);
        else resolve({
          viewport: [innerWidth, innerHeight],
          touch: navigator.maxTouchPoints > 0,
          collapsedToOnePanel: document.querySelectorAll(".panel").length === 1,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          skeletonVisible: b.skeleton.visible,
          outfitHidden: !b.gltf.scene.getObjectByName("tee-white").visible,
          idleWalkOverlapSamples: series.filter(w => [w.Idle, w.Walk].every(x => x > 0 && x < 1)).length,
          settledWeights: series.at(-1),
        });
      };
      requestAnimationFrame(sample);
    });
  });
  await writeFile(process.argv[2], JSON.stringify({ ...pass, errors }, null, 2) + "\n");
  if (!pass.touch || !pass.collapsedToOnePanel || !pass.noHorizontalOverflow || !pass.skeletonVisible ||
      !pass.outfitHidden || !pass.idleWalkOverlapSamples || pass.settledWeights.Walk !== 1 ||
      pass.settledWeights.Idle !== 0 || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
