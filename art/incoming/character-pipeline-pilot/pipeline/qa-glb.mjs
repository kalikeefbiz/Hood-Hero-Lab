// Run a copy from the external npm tools directory.
import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { validateBytes } from "gltf-validator";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const results = {};
for (const path of process.argv.slice(2)) {
  const bytes = await readFile(path);
  const doc = await io.readBinary(bytes);
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  let maxWeights = 0, unweighted = 0;
  for (const mesh of meshes) for (const primitive of mesh.listPrimitives()) {
    const weights = primitive.getAttribute("WEIGHTS_0");
    if (!weights) continue;
    const weight = [];
    for (let index = 0; index < weights.getCount(); index++) {
      weights.getElement(index, weight);
      const count = weight.filter(v => v > 0).length;
      maxWeights = Math.max(maxWeights, count);
      if (count === 0) unweighted++;
    }
    if (primitive.getAttribute("WEIGHTS_1")) maxWeights = Math.max(maxWeights, 5);
  }
  const report = await validateBytes(bytes, { maxIssues: 25 });
  const extensions = root.listExtensionsUsed().map(ext => ext.extensionName);
  results[path.split("/").at(-1)] = {
    bytes: bytes.length,
    triangleCountAllMeshes: meshes.reduce((total, mesh) => total +
      mesh.listPrimitives().reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0), 0),
    materials: root.listMaterials().length,
    textures: root.listTextures().map(texture => ({
      mime: texture.getMimeType(), dimensions: texture.getSize(),
    })),
    jointsPerSkin: root.listSkins().map(skin => skin.listJoints().length),
    extensions, maxWeights, unweighted,
    clips: Object.fromEntries(root.listAnimations().map(clip => {
      const channels = clip.listChannels();
      const inputs = clip.listSamplers().map(s => s.getInput().getArray());
      const maxTime = Math.max(...inputs.map(times => times.at(-1)));
      return [clip.getName(), { duration: maxTime, channels: channels.length,
        scaleChannels: channels.filter(c => c.getTargetPath() === "scale").length,
        tracksWith30HzGrid: inputs.filter(times => times.every(t => Math.abs(t * 30 - Math.round(t * 30)) < 1e-4)).length,
        tracks: inputs.length }];
    })),
    validation: report.issues,
  };
}
console.log(JSON.stringify(results, null, 2));
