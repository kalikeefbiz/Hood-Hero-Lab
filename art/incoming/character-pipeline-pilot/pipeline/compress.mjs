// Run a copy of this entry point from the external npm tools directory.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, quantize, meshopt, textureCompress } from "@gltf-transform/functions";
import { ktx2 } from "ktx2-encoder/gltf-transform";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const [source, destination] = process.argv.slice(2);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(source);
const root = doc.getRoot();
for (const material of root.listMaterials()) {
  if (material.getName().startsWith("MPFB_Body.")) material.setAlphaMode("OPAQUE");
}
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    const path = channel.getTargetPath();
    const node = channel.getTargetNode().getName();
    if (path === "scale" || (path === "translation" && node !== "pelvis")) channel.dispose();
  }
}
const imageDecoder = async (buf) => {
  const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};
await doc.transform(dedup(), prune(), resample(),
  textureCompress({ encoder: sharp, targetFormat: "png", resize: [1024, 1024] }),
  ktx2({ slots: /baseColorTexture/, isUASTC: false, qualityLevel: 200,
    generateMipmap: true, isPerceptual: true, imageDecoder }),
  ktx2({ slots: /normalTexture/, isUASTC: true, isNormalMap: true,
    generateMipmap: true, needSupercompression: true, imageDecoder }),
  quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(destination, doc);
