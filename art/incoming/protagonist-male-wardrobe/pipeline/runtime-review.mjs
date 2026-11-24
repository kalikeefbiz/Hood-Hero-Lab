import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const [output, canonical] = process.argv.slice(2);
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, logLevel: 'error', server: { port: 0 } });
let browser;
try {
  await server.listen();
  const {port} = server.httpServer.address();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 500, height: 660 } });
  const url = `http://localhost:${port}/art/incoming/protagonist-male-wardrobe/pipeline/runtime-review.html`;
  await page.goto(canonical ? `${url}?canonical=${encodeURIComponent(canonical)}` : url);
  await page.waitForFunction(() => window.outfitReport || window.outfitError, null, { timeout: 90000 });
  const error = await page.evaluate(() => window.outfitError);
  if (error) throw new Error(error);
  const report = await page.evaluate(() => window.outfitReport);
  await writeFile(resolve(output,'threejs.json'), JSON.stringify(report,null,2)+'\n');
  for (const [label, ...args] of [
    ['idle','Idle',2,.22], ['walk','Walk',.20,-.60], ['run','Run',.18,.67],
    ['back','Idle',2,2.85], ['shoes','Walk',.47,.95,'shoes'], ['tee','Run',.20,-.47,'tee'],
  ]) {
    await page.evaluate((params) => window.outfitFrame(...params), args);
    await page.screenshot({ path: resolve(output,`threejs-${label}.png`) });
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
