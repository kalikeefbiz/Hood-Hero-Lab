// Move tiling textures that many GLBs repeat (asphalt, sidewalk, concrete, brick, fence...)
// out of the GLBs into one shared folder. Each material records what it needs in
// extras.shared; src/strip/sharedTextures.ts loads each file once and hands the same
// GPU texture to every material that asks for it. Alpha-tested textures (chainlink,
// grass, leaves) stay embedded: they are tiny and lost their alpha when shared.
// node share_textures.mjs <tex out dir> <glb...>
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SHARED = new Set(['asphalt_albedo', 'asphalt_normal', 'sidewalk_albedo', 'sidewalk_normal', 'concrete_albedo', 'concrete_normal',
  'yard_albedo', 'roof_albedo', 'brick_albedo', 'brick_normal', 'siding_normal', 'shingles',
  'windows_atlas', 'doors_atlas', 'windows_emissive']);
// the two big tiling normal maps are re-encoded at 512 with RDO (were 1024, 1.3 MB each)
const REENCODE = { asphalt_normal: 512, sidewalk_normal: 512 };
const [, , outDir, ...files] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const imageDecoder = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
async function encodeNormal(name, size) {
  const d = new Document(); d.createBuffer();
  const png = await sharp(`/tmp/lj/tex/${name}.png`).resize(size, size).png().toBuffer();
  const t = d.createTexture(name).setImage(png).setMimeType('image/png');
  d.createMaterial('m').setNormalTexture(t);
  await d.transform(ktx2({ isUASTC: true, isNormalMap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 2, generateMipmap: true, isPerceptual: false, imageDecoder }));
  return d.getRoot().listTextures()[0].getImage();
}
const slots = [['map', 'getBaseColorTexture', 'setBaseColorTexture', 'getBaseColorTextureInfo'],
  ['normalMap', 'getNormalTexture', 'setNormalTexture', 'getNormalTextureInfo'],
  ['emissiveMap', 'getEmissiveTexture', 'setEmissiveTexture', 'getEmissiveTextureInfo']];
const written = new Set(fs.readdirSync(outDir).map((f) => f.replace(/\.ktx2$/, '')));
for (const f of files) {
  const doc = await io.read(f);
  let moved = 0;
  for (const m of doc.getRoot().listMaterials()) {
    const shared = {};
    for (const [slot, get, set, info] of slots) {
      const t = m[get]();
      const name = t && t.getName();
      if (!t || !SHARED.has(name)) continue;
      if (m[info]().getTexCoord() !== 0) throw new Error(`${f} ${m.getName()} ${slot} uses texcoord ${m[info]().getTexCoord()}`);
      if (!written.has(name)) {
        const bytes = REENCODE[name] ? await encodeNormal(name, REENCODE[name]) : t.getImage();
        fs.writeFileSync(path.join(outDir, name + '.ktx2'), bytes);
        written.add(name);
      }
      shared[slot] = name;
      if (slot === 'normalMap') shared.normalScale = m.getNormalScale();
      m[set](null); moved++;
    }
    if (Object.keys(shared).length) m.setExtras({ ...m.getExtras(), shared });
  }
  await doc.transform(prune());
  const before = fs.statSync(f).size;
  await io.write(f, doc);
  console.log(path.basename(f), (before / 1048576).toFixed(2), '->', (fs.statSync(f).size / 1048576).toFixed(2), 'MB,', moved, 'slots');
}
for (const n of written) console.log('shared', n, (fs.statSync(path.join(outDir, n + '.ktx2')).size / 1024 | 0), 'KB');
