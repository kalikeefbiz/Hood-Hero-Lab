// Runtime compression for character GLBs: KTX2 textures, quantized + meshopt geometry.
//
//   node compress.mjs <in.glb> <out.glb> [texSize=1024] [keepNormal=1] [--flat]
//
// Default: PBR is preserved. Base colour and emissive are encoded as sRGB KTX2; normal,
// metallic-roughness and occlusion maps are encoded as linear (non-perceptual) KTX2. Authored
// metallic/roughness factors are kept. A material that carries only glTF's unauthored defaults
// (metallic 1, roughness 1) and no metallic-roughness map is set to metallic 0, roughness 0.75.
//
//   texSize     longest edge cap for every texture (downscale only). Hero profile: 2048.
//   keepNormal  '0' strips normal maps (legacy, standard profile only).
//   --flat      legacy behaviour: drop the metallic-roughness map and force roughness 0.75.
//
// The input GLB is never modified. Keep the full-resolution source (source/<id>_source.blend with
// packed textures, or an uncompressed GLB) next to the runtime file; this script only produces the
// runtime copy. It prints which texture slots survived so you can check nothing was lost.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const argv = process.argv.slice(2);
const flat = argv.includes('--flat');
const [src, dst, texSize = '1024', keepNormal = '1'] = argv.filter((a) => !a.startsWith('--'));
if (!src || !dst) { console.error('usage: node compress.mjs <in.glb> <out.glb> [texSize=1024] [keepNormal=1] [--flat]'); process.exit(2); }
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
for (const m of root.listMaterials()) {
  if (flat) {
    m.setMetallicRoughnessTexture(null);
    m.setMetallicFactor(0); m.setRoughnessFactor(0.75);
  } else if (!m.getMetallicRoughnessTexture() && m.getMetallicFactor() === 1 && m.getRoughnessFactor() === 1) {
    m.setMetallicFactor(0); m.setRoughnessFactor(0.75);
  }
  if (keepNormal !== '1') m.setNormalTexture(null);
}
const imageDecoder = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
const S = parseInt(texSize);
await doc.transform(dedup(), prune(), resample(),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [S, S] }));
await doc.transform(
  ktx2({ slots: /baseColorTexture|emissiveTexture/, isUASTC: false, qualityLevel: 200, generateMipmap: true, isPerceptual: true, imageDecoder }),
  ktx2({ slots: /normalTexture/, isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true, isPerceptual: false, imageDecoder }),
  ktx2({ slots: /metallicRoughnessTexture|occlusionTexture/, isUASTC: true, needSupercompression: true, generateMipmap: true, isPerceptual: false, imageDecoder }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);

// Report what survived, per material, so a lost slot is visible rather than silent.
const out = await io.read(dst);
for (const m of out.getRoot().listMaterials()) {
  const slot = (name, t) => (t ? `${name} ${t.getSize()?.join('x') ?? '?'}` : null);
  const have = [slot('baseColor', m.getBaseColorTexture()), slot('normal', m.getNormalTexture()),
    slot('metalRough', m.getMetallicRoughnessTexture()), slot('occlusion', m.getOcclusionTexture()),
    slot('emissive', m.getEmissiveTexture())].filter(Boolean);
  console.log(`material "${m.getName()}": ${have.join(', ') || 'no textures'} | metallic ${m.getMetallicFactor()} roughness ${m.getRoughnessFactor()}`);
}
console.log('wrote', dst);
