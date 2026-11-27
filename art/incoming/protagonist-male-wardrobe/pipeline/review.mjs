#!/usr/bin/env node
// node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs <out-dir> <items> [sheet...]
//   items: comma list of id:relative/path.glb (relative to art/incoming/protagonist-male-wardrobe), or "none"
//   sheets: body (default), detail
// Renders review.html in headless Chromium (SwiftShader) and writes <out-dir>/<sheet>.png plus report.json.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const [outDir, items = "none", ...sheets] = process.argv.slice(2);
const extra = process.env.REVIEW_QS ? `&${process.env.REVIEW_QS}` : "";
if (!outDir) { console.error("usage: review.mjs <out-dir> <items> [sheet...]"); process.exit(2); }
const out = resolve(outDir); mkdirSync(out, { recursive: true });
const server = await createServer({ root: repo, configFile: false, logLevel: "error", server: { port: 0, fs: { strict: false } } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1300 } });
page.on("console", (m) => { if (m.type() === "error") console.error("page:", m.text()); });
let report;
for (const sheet of sheets.length ? sheets : ["body"]) {
  const it = items === "none" ? "" : items;
  await page.goto(`http://localhost:${port}/art/incoming/protagonist-male-wardrobe/pipeline/review.html?sheet=${sheet}&items=${encodeURIComponent(it)}${extra}`);
  await page.waitForFunction(() => window.reviewDone || window.reviewError, null, { timeout: 600000 });
  const err = await page.evaluate(() => window.reviewError);
  if (err) { console.error("review failed:", err); process.exitCode = 1; break; }
  report = await page.evaluate(() => window.reviewReport);
  const canvas = await page.$("body");
  await page.screenshot({ path: join(out, `${sheet}.png`), clip: await page.evaluate(() => { const c = document.getElementById("c"); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  console.log("wrote", join(out, `${sheet}.png`));
}
if (report) writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
await browser.close(); await server.close();
