#!/usr/bin/env node
// Renders review sheets of a character delivery in three.js, the renderer the game uses, with the
// city's day and night lighting. Claude reviews deliveries from these same sheets, so a builder
// sees exactly what the reviewer will see. Blender renders (Cycles, EEVEE, Workbench) hide
// texture and seam problems that three.js shows.
//
//   node scripts/review-character.mjs art/incoming/<id>                  delivery → <id>/previews/threejs/
//   node scripts/review-character.mjs --raw meshy/model.glb [--bust] [--yaw 180] [--out dir]
//                                                                        unprocessed Meshy file
//
// Delivery: one face sheet (face and neck close-ups, day, night, run frame) and one body sheet
// per head (modular characters such as the protagonist) or one of each (everyone else).
// --raw: the Meshy output before any processing, for the "before" shots in docs/CHARACTER_PIPELINE.md.
//   --bust frames a head-and-shoulders model; --yaw turns the model if it doesn't face the camera.
//
// Needs the repo's npm packages (npm ci) and a Chromium for Playwright. No GPU needed: it uses
// SwiftShader. Set CHROMIUM_PATH if Playwright can't find its browser.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const rawFile = opt("--raw"), yaw = opt("--yaw") ?? "0", outOpt = opt("--out"), bust = flag("--bust");
const dir = args[0] && resolve(args[0]);
if (!rawFile && !dir) {
  console.error("usage: node scripts/review-character.mjs art/incoming/<id>\n       node scripts/review-character.mjs --raw <file.glb> [--bust] [--yaw deg] [--out dir]");
  process.exit(2);
}

// Pages to render: [output file, query string].
const jobs = [];
const fs = (p) => `/@fs${resolve(p)}`;
if (rawFile) {
  const name = basename(rawFile, ".glb");
  const out = resolve(outOpt ?? join(dirname(rawFile), "review"));
  const base = `raw=${encodeURIComponent(fs(rawFile))}&yaw=${yaw}${bust ? "&kind=bust" : ""}`;
  jobs.push([join(out, `${name}_raw_face.png`), `${base}&sheet=face`], [join(out, `${name}_raw_body.png`), `${base}&sheet=body`]);
} else {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const out = resolve(outOpt ?? join(dir, "previews", "threejs"));
  const base = `dir=${encodeURIComponent(fs(dir))}`;
  const heads = manifest.modular ? Object.keys(manifest.modular.heads) : [null];
  for (const h of heads) {
    const tag = h ? `${manifest.id}_${h}` : manifest.id, hq = h ? `&head=${h}` : "";
    jobs.push([join(out, `${tag}_face.png`), `${base}${hq}&sheet=face`], [join(out, `${tag}_body.png`), `${base}${hq}&sheet=body`]);
  }
}

const server = await createServer({
  root: repo, configFile: false, logLevel: "error",
  server: { port: 0, fs: { strict: false } },
});
await server.listen();
const { port } = server.httpServer.address();

const launchArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
let browser;
try {
  browser = await chromium.launch({ args: launchArgs, executablePath: process.env.CHROMIUM_PATH || undefined });
} catch (e) {
  if (!existsSync("/opt/pw-browsers/chromium")) throw e;
  browser = await chromium.launch({ args: launchArgs, executablePath: "/opt/pw-browsers/chromium" });
}

let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1260, height: 840 } });
  for (const [file, qs] of jobs) {
    await page.goto(`http://localhost:${port}/scripts/review-character.html?${qs}`);
    const state = await page.waitForFunction("window.reviewDone || window.reviewError", null, { timeout: 240_000 })
      .then(() => page.evaluate("window.reviewError || null"));
    if (state) { console.log(`FAIL  ${basename(file)}: ${state}`); failed++; continue; }
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
