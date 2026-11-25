import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [folder, canonical=''] = process.argv.slice(2);
const root = fileURLToPath(new URL('../',import.meta.url));
const outfits = JSON.parse(await readFile(join(root,'validation/outfits.json'),'utf8'));
const manifest = JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const starter = manifest.starterOutfit;
const baseBytes = starter.equippedAssetBytes - starter.garmentAssetBytes;
const reports = {};
for (const [name, ids] of Object.entries(outfits)) {
  const output = join(folder,name);
  execFileSync('node',[join(root,'pipeline/runtime-review.mjs'),output,canonical,...ids],{stdio:'inherit'});
  const report = JSON.parse(await readFile(join(output,'threejs.json'),'utf8'));
  report.loadedAssetBytes = ids.reduce((bytes,id) => bytes + manifest.modular.wearables[id].bytes,baseBytes);
  reports[name] = report;
}
await writeFile(join(folder,'catalog-runtime.json'),JSON.stringify(reports,null,2)+'\n');
