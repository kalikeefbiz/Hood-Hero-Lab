// Build the undershirt face selection from the compressed tee index buffers.
// The open front and collar still show the tee. The covered back and sleeves
// stay occluded through all poses. Removing the jacket restores all tee faces.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const [maskPath] = process.argv.slice(2);
const mask = JSON.parse(await readFile(maskPath));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const variants = ['tee-white', 'tee-stixx-black'];
const underlay = {};
for (const id of variants) {
  const doc = await io.read(new URL(`../models/tops/${id}.glb`, import.meta.url).pathname);
  const root = doc.getRoot();
  const [skin] = root.listSkins();
  const [[primitive]] = root.listMeshes().map(mesh => mesh.listPrimitives());
  const meshDecode = new Matrix4().fromArray(skin.listJoints()[0].getWorldMatrix())
    .multiply(new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(0, [])));
  const positions = primitive.getAttribute('POSITION');
  const points = Array.from({length: positions.getCount()}, (_, i) =>
    new Vector3().fromArray(positions.getElement(i, [])).applyMatrix4(meshDecode));
  const indices = primitive.getIndices().getArray();

  function behindOpening({ x, y: height, z: forward }) {
    // Front-facing portion of the fitted crewneck. At the taller collar
    // the jacket's opening narrows, while it widens toward the hem.
    const collar = Math.min(1, Math.max(0, (height - 1.39) / .10));
    return forward > .018 && Math.abs(x) <= .097 - .051 * collar;
  }

  const ranges = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (![indices[i], indices[i + 1], indices[i + 2]].some(j => behindOpening(points[j]))) continue;
    const ordinal = i / 3;
    const last = ranges.at(-1);
    if (last && last[0] + last[1] === ordinal) last[1]++;
    else ranges.push([ordinal, 1]);
  }
  const visible = ranges.reduce((sum, [, count]) => sum + count, 0);
  assert(visible > 0 && visible < indices.length / 9, `Unexpected tee underlay size for ${id}`);
  underlay[id] = ranges;
}
mask.wearables['windbreaker-black-open'].visibleTopRanges = underlay;
await writeFile(maskPath, JSON.stringify(mask) + '\n');
