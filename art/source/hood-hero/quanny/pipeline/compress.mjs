import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [,, src, dst, texSize='1024', keepNormal='1'] = process.argv;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
for (const m of root.listMaterials()) {
  const mr = m.getMetallicRoughnessTexture();
  if (mr) { m.setMetallicRoughnessTexture(null); }
  m.setMetallicFactor(0); m.setRoughnessFactor(0.75);
  if (keepNormal !== '1') m.setNormalTexture(null);
}
const imageDecoder = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
const S = parseInt(texSize);
await doc.transform(dedup(), prune(), resample(),
  textureCompress({ encoder: sharp, targetFormat: 'png', resize: [S, S] }));
await doc.transform(
  ktx2({ slots: /baseColorTexture/, isUASTC: false, qualityLevel: 200, generateMipmap: true, isPerceptual: true, imageDecoder }),
  ktx2({ slots: /normalTexture/, isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true, isPerceptual: false, imageDecoder }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
console.log('wrote', dst);
