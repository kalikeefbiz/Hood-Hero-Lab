import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

const [baselineArg, outputArg, ...requested] = process.argv.slice(2);
const baseline = resolve(baselineArg);
const output = resolve(outputArg);
const wardrobe = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', wardrobe)));
const starter = ['tee-white', 'jeans-denim-standard', 'court-sneakers-white'];
const ids = requested.length ? requested : Object.keys(manifest.modular.wearables);
const mode = process.env.WARDROBE_REVIEW_MODE || 'both';
if (!['both', 'stills', 'cycles'].includes(mode)) throw Error(`Unknown review mode ${mode}`);
const comparisonWidth = 250;
const height = 320;

await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false, logLevel: 'error', server: { port: 0, hmr: false, watch: null },
  plugins: [{
    name: 'wardrobe-review-baseline',
    configureServer(server) {
      server.middlewares.use('/baseline', (req, res, next) => {
        const path = req.url.split('?')[0];
        if (!/^\/(body-masks\.json|models\/[a-z]+\/[a-z0-9-]+\.glb)$/.test(path)) return next();
        res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'model/gltf-binary');
        createReadStream(join(baseline, path)).on('error', () => res.destroy()).pipe(res);
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const { port } = server.httpServer.address();
  const url = `http://localhost:${port}/art/incoming/protagonist-male-wardrobe/pipeline/round5-review.html`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const before = await browser.newPage({ viewport: { width: comparisonWidth, height } });
  const after = await browser.newPage({ viewport: { width: comparisonWidth, height } });
  for (const [page, path] of [[before, `${url}?before`], [after, url]]) {
    page.on('pageerror', error => console.error(error));
    await page.goto(path);
    await page.waitForFunction(() => window.round5Ready, null, { timeout: 90000 });
  }
  const shots = {
    top: [['Front',.25,'body'],['Back',2.8,'body'],['Neckline',.12,'neckline'],['Rear shoulder',2.6,'shoulders'],['Hem and sleeve',.8,'torsoHem']],
    outerwear: [['Front',.25,'body'],['Back',2.8,'body'],['Neckline',.12,'neckline'],['Rear shoulder',2.6,'shoulders'],['Hem and sleeve',.8,'torsoHem']],
    bottom: [['Front',.25,'legs'],['Back',2.8,'legs'],['Waist & hem',.9,'torsoHem'],['Left cuff',.7,'ankles'],['Right cuff',2.8,'ankles']],
    footwear: [['Front',.25,'body'],['Toe',.35,'ankles'],['Outside',1.45,'ankles'],['Heel',2.8,'ankles'],['Opposite side',-.8,'ankles']],
  };
  const clips = await after.evaluate(() => window.clips);
  const reports = {};
  for (const id of ids) {
    const slot = id === 'starter' ? 'top' : manifest.modular.wearables[id].slot;
    const outfit = id === 'starter' ? starter : [
      id === 'shorts-athletic' || slot === 'footwear' ? 'shorts-athletic' : starter[1],
      slot === 'top' ? id : starter[0],
      slot === 'footwear' ? id : starter[2],
      ...(slot === 'outerwear' || (slot === 'bottom' && id !== 'shorts-athletic') ? [id] : []),
    ];
    const beforeReport = await before.evaluate(ids => window.equip(ids), outfit);
    const afterReport = await after.evaluate(ids => window.equip(ids), outfit);
    if (mode !== 'cycles') {
      const tiles = [];
      const rowHeight = height + 25;
      const columns = id === 'shorts-athletic' ? [
        ...shots.bottom.slice(0, 3), ['Front cuff', .7, 'knees'], ['Rear cuff', 2.8, 'knees'],
      ] : shots[slot];
      for (const [column, [label, angle, view]] of columns.entries()) {
        for (const [row, page] of [before, after].entries()) {
          await page.evaluate(args => window.draw(...args), ['Idle', 2, angle, view]);
          const left = column * comparisonWidth;
          tiles.push({ input: await page.screenshot(), left, top: row * rowHeight + 25 });
          const tag = `${row === 0 ? 'Before' : 'Round 5 fit'} · ${label}`;
          tiles.push({ input: Buffer.from(`<svg width="${comparisonWidth}" height="25"><text x="9" y="17" font-family="sans-serif" font-size="14" fill="#fff">${tag.replaceAll('&','&amp;')}</text></svg>`),
            left, top: row * rowHeight });
        }
      }
      await sharp({ create: { width: columns.length * comparisonWidth, height: 2 * rowHeight, channels: 3, background: '#232a33' } })
        .composite(tiles).png().toFile(join(output, `${id}-comparison.png`));

    }
    if (mode === 'stills') {
      console.log(id, 'comparison');
      continue;
    }

    const view = id === 'starter' ? 'body' : { top: 'torso', outerwear: 'torso', bottom: 'legs', footwear: 'stride' }[slot];
    const frameCounts = {};
    const fps = id === 'starter' ? 30 : 24;
    const width = 176;
    const videoHeight = 224;
    await after.evaluate(([width, height]) => window.recordingSize(width, height, true), [width, videoHeight]);
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe',
      '-probesize', '32', '-analyzeduration', '0', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-threads', '2',
      '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(output, `${id}-cycles.mp4`)],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    const finished = once(ffmpeg, 'close');
    for (const name of ['Idle', 'Walk', 'Run']) {
      const duration = clips[name];
      const repeat = id !== 'starter' && name === 'Idle' ? 3 : 1;
      const frames = Math.ceil(duration * fps / repeat);
      frameCounts[name] = { seconds: duration, framesPerView: frames + 1 };
      for (let i = 0; i <= frames; i++) {
        const time = duration * i / frames;
        const frame = await after.evaluate(args => window.drawPair(...args), [name, time, view, width, videoHeight]);
        const jpeg = Buffer.from(frame, 'base64');
        for (let copy = 0; copy < (i === frames ? 1 : repeat); copy++) {
          if (!ffmpeg.stdin.write(jpeg)) await once(ffmpeg.stdin, 'drain');
        }
      }
    }
    ffmpeg.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw Error(`Could not record ${id} (${code})`);
    await after.evaluate(([width, height]) => window.recordingSize(width, height, false), [comparisonWidth, height]);
    reports[id] = { outfit, before: beforeReport, after: afterReport, clips: frameCounts };
    await writeFile(join(output, 'report.json'), JSON.stringify(reports, null, 2) + '\n');
    console.log(id, JSON.stringify(frameCounts));
  }
} finally {
  await browser?.close();
  await server.close();
}
