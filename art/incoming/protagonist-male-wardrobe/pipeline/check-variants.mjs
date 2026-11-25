import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../models/',import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const report = {};
for (const [base,variant] of [
  ['tops/tee-white','tops/tee-stixx-black'],
  ['footwear/court-sneakers-white','footwear/court-sneakers-black'],
]) {
  const [a,b] = await Promise.all([base,variant].map((name) => io.read(dir+name+'.glb')));
  const ap = a.getRoot().listMeshes()[0].listPrimitives()[0];
  const bp = b.getRoot().listMeshes()[0].listPrimitives()[0];
  const accessors = ['POSITION','NORMAL','TEXCOORD_0','TANGENT','JOINTS_0','WEIGHTS_0'];
  for (const attr of accessors) {
    assert.deepEqual(bp.getAttribute(attr).getArray(),ap.getAttribute(attr).getArray(),`${variant} ${attr}`);
  }
  assert.deepEqual(bp.getIndices().getArray(),ap.getIndices().getArray(),variant);
  const inverse = (doc) => doc.getRoot().listSkins()[0].getInverseBindMatrices().getArray();
  assert.deepEqual(inverse(a),inverse(b),variant);
  const skin = a.getRoot().listSkins()[0];
  assert.deepEqual(skin.listJoints().map((j) => j.getName()),
    b.getRoot().listSkins()[0].listJoints().map((j) => j.getName()),variant);
  const textureHash = (primitive) => createHash('sha256')
    .update(primitive.getMaterial().getBaseColorTexture().getImage()).digest('hex');
  assert.notEqual(textureHash(ap),textureHash(bp),variant);
  report[variant.split('/')[1]]={base:base.split('/')[1], identicalAccessors:accessors,
    identicalIndexBuffer:true, identicalInverseBinds:true, distinctBaseColor:true};
}
console.log(JSON.stringify(report,null,2));
