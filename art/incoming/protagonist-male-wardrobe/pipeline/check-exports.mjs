import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4 } from 'three';

const [bodyFile, ...files] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const bodyDoc = (await io.read(bodyFile)).getRoot();
const [bodySkin] = bodyDoc.listSkins();
const bodyJoints = new Map(bodySkin.listJoints().map((joint) => [joint.getName(), joint]));
const clips = bodyDoc.listAnimations().map((clip) => clip.getName()).sort();
assert.deepEqual(clips,['Idle','Run','Walk']);
const records = [];

function difference(a,b) {
  return Math.max(...a.map((v,i) => Math.abs(v-b[i])));
}

for (const file of files) {
  const raw = await readFile(file);
  const glb = JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString('utf8'));
  assert(glb.extensionsRequired.includes('EXT_meshopt_compression'));
  assert(glb.extensionsRequired.includes('KHR_mesh_quantization'));
  assert(glb.extensionsRequired.includes('KHR_texture_basisu'));
  assert.equal(glb.skins.length, 1);
  assert.equal(glb.meshes.length, 1);
  assert.equal(glb.materials.length, 1);
  assert.equal(glb.animations?.length ?? 0, 0);
  const root = (await io.read(file)).getRoot();
  const [skin] = root.listSkins();
  const bones = skin.listJoints();
  assert.equal(bones.length,bodyJoints.size);
  assert.equal(new Set(bones.map((joint) => joint.getName())).size,bones.length);
  const ibm = skin.getInverseBindMatrices();
  assert(ibm.getCount()===bones.length);
  let maxRestTransformDiff = 0;
  let maxBindResidual = 0;
  const quantFrames = bones.map((joint,i) => new Matrix4().fromArray(joint.getWorldMatrix())
    .multiply(new Matrix4().fromArray(ibm.getElement(i, []))).toArray());
  for (const [i,joint] of bones.entries()) {
    const name=joint.getName();
    const canonical=bodyJoints.get(name);
    assert(canonical,`Unknown joint ${name}`);
    assert.equal(joint.getParentNode()?.getName(),canonical.getParentNode()?.getName());
    maxRestTransformDiff=Math.max(maxRestTransformDiff,difference(joint.getWorldMatrix(),canonical.getWorldMatrix()));
    maxBindResidual=Math.max(maxBindResidual,difference(quantFrames[i],quantFrames[0]));
  }
  assert(maxRestTransformDiff < .002, `Rest mismatch: ${maxRestTransformDiff}`);
  assert(maxBindResidual < .0001,`Wearable inverse-binds use inconsistent coordinate frames: ${file}`);
  const [[primitive]] = root.listMeshes().map((mesh) => mesh.listPrimitives());
  assert(primitive.getAttribute('TEXCOORD_0'),`Missing UV atlas: ${file}`);
  assert(primitive.getAttribute('TANGENT'),`Missing material tangents: ${file}`);
  const images = root.listTextures();
  assert(images.length>=1 && images.every((texture) => texture.getMimeType()==='image/ktx2'));
  records.push({id:root.listMeshes()[0].getName(), bytes:(await stat(file)).size,
    triangles:primitive.getIndices().getCount()/3, jointCount:bones.length,
    maxRestTransformDiff,maxBindResidual, materialCount:glb.materials.length,
    textures: images.map((texture) => texture.getSize()) });
}
console.log(JSON.stringify(records,null,2));
