// Pack a storefront GLB for phones: UASTC for the sign atlas (legible text), ETC1S for the rest, meshopt geometry.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt, textureCompress } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [,, src, dst] = process.argv;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const imageDecoder = async (buf) => { const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
await doc.transform(dedup(), prune(), resample(), textureCompress({ encoder: sharp, targetFormat: 'png', resize: [1536, 1536] }));
await doc.transform(
  ktx2({ pattern: /_atlas/, isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: 1.5, generateMipmap: true, isPerceptual: true, imageDecoder }),
  ktx2({ pattern: /normal/, isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true, isPerceptual: false, imageDecoder }),
  ktx2({ pattern: /^(?!.*(_atlas|normal)).*$/, isUASTC: false, qualityLevel: 200, generateMipmap: true, isPerceptual: true, imageDecoder }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
console.log('wrote', dst);
