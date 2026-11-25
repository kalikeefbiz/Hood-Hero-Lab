import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const [file, output] = process.argv.slice(2);
const bytes = await readFile(file);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const root = (await io.readBinary(new Uint8Array(bytes))).getRoot();
const body = root.listNodes().find((node) => node.getName() === 'Body' && node.getSkin());
const [primitive] = body.getMesh().listPrimitives();
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
const skin = body.getSkin();
const inverse = skin.getInverseBindMatrices();
const bind = skin.listJoints().map((joint, i) => new Matrix4().fromArray(joint.getWorldMatrix())
  .multiply(new Matrix4().fromArray(inverse.getElement(i, []))));
const vertices = [];
for (let i = 0; i < position.getCount(); i++) {
  const p = new Vector3().fromArray(position.getElement(i, []));
  const j = joints.getElement(i, []);
  const w = weights.getElement(i, []);
  const result = new Vector3();
  for (let k = 0; k < j.length; k++) {
    if (w[k]) result.addScaledVector(p.clone().applyMatrix4(bind[j[k]]), w[k]);
  }
  vertices.push([result.x, -result.z, result.y]);
}
await writeFile(output, JSON.stringify({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  node: body.getName(), primitive: 0,
  indices: Array.from(primitive.getIndices().getArray()), vertices,
}));
