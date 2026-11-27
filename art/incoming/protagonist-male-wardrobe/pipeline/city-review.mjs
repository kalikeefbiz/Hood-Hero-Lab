#!/usr/bin/env node
// node art/incoming/protagonist-male-wardrobe/pipeline/city-review.mjs <out-dir>
// The benchmark outfit in the real city (strip.html) at iPhone size: idle, walking, running, night.
import { createServer } from "vite"; import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs"; import { resolve, dirname, join } from "node:path"; import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."); const out = resolve(process.argv[2] ?? "city-review"); mkdirSync(out, { recursive: true });
const items = [["tee-white", "models/tops/tee-white.glb"], ["jeans-denim-standard", "models/bottoms/jeans-denim-standard.glb"], ["court-sneakers-white", "models/footwear/court-sneakers-white.glb"]];
const server = await createServer({ root: repo, logLevel: "error", server: { port: 0 } }); await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const night of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`http://localhost:${port}/strip.html${night ? "?night" : ""}`);
  await page.waitForFunction(() => window.__strip?.walk?.avatarLoaded?.(), null, { timeout: 600000 });
  await page.evaluate((items) => { window.__wardrobeQuery = { head: "face-01", complexion: "complexion-01", items }; }, items);
  await page.addScriptTag({ type: "module", url: "/art/incoming/protagonist-male-wardrobe/pipeline/city-inject.js" });
  await page.waitForFunction(() => window.__wardrobeReady, null, { timeout: 600000 });
  await page.waitForTimeout(4000);
  const tag = night ? "night" : "dusk";
  await page.screenshot({ path: join(out, `city_${tag}_idle.png`), timeout: 600000 }); console.log("wrote", tag, "idle");
  if (night) { await page.close(); continue; }
  await page.keyboard.down("w"); await page.waitForTimeout(2500); await page.screenshot({ path: join(out, `city_${tag}_walk.png`), timeout: 600000 }); console.log("wrote walk");
  await page.keyboard.down("Shift"); await page.waitForTimeout(2500); await page.screenshot({ path: join(out, `city_${tag}_run.png`), timeout: 600000 }); console.log("wrote run");
  await page.keyboard.up("Shift"); await page.keyboard.up("w"); await page.close();
}
await browser.close(); await server.close();
