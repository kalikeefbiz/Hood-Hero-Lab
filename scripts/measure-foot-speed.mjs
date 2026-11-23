#!/usr/bin/env node
// Measures a character GLB's real ground speed per clip, to check a delivery's manifest
// speedMps (docs/handoff/character-review.md). Plays each clip in three.js (no renderer),
// tracks the lowest foot while it is in contact with the ground, and reports its speed.
//
//   node scripts/measure-foot-speed.mjs public/assets/models/characters/mr-lewis.glb
//   node scripts/measure-foot-speed.mjs quanny.glb quanny-walk.glb quanny-run.glb   (four-file layout)
//
// Accuracy, checked against Quanny's known speeds (walk 0.92, run 2.73 m/s):
//   walk reads within ~1% (0.91); run reads ~16% LOW (2.30), because a runner's foot is
//   barely planted. Multiply a run reading by ~1.19 before comparing with the manifest, and
//   prefer the agent's own sole measurement when it is in the PR.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const [, , file, ...extra] = process.argv;
if (!file) { console.error("usage: node scripts/measure-foot-speed.mjs <model.glb> [clip.glb ...]"); process.exit(2); }

/** Strip KTX2 textures (the motion doesn't need them, and Node has no KTX2 transcoder). */
function withoutTextures(path) {
  const b = readFileSync(path);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl));
  delete j.textures; delete j.images; delete j.samplers;
  for (const m of j.materials ?? []) { delete m.pbrMetallicRoughness?.baseColorTexture; delete m.normalTexture; delete m.emissiveTexture; }
  j.extensionsUsed = (j.extensionsUsed ?? []).filter((e) => e !== "KHR_texture_basisu");
  j.extensionsRequired = (j.extensionsRequired ?? []).filter((e) => e !== "KHR_texture_basisu");
  let js = Buffer.from(JSON.stringify(j));
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(" ")]);
  const rest = b.subarray(20 + jl);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + js.length + rest.length, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([head, js, rest]);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length);
}

await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const parse = (path) => new Promise((res, rej) => loader.parse(withoutTextures(path), "", res, rej));
const g = await parse(file);
for (const f of extra) g.animations.push(...(await parse(f)).animations);

const root = g.scene;
root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root);
console.log(`height ${(box.max.y - box.min.y).toFixed(3)} m, feet at y ${box.min.y.toFixed(3)}`);
// three.js strips dots from node names: Rigify "foot.L" becomes "footL".
const feet = [];
root.traverse((o) => { if (/^(foot[._]?[lr]|LeftFoot|RightFoot)$/i.test(o.name)) feet.push(o); });
if (feet.length !== 2) { console.error(`expected 2 foot bones, found: ${feet.map((f) => f.name).join(", ") || "none"}`); process.exit(1); }

for (const name of ["Idle", "Walk", "Run"]) {
  const clip = g.animations.find((a) => a.name === name);
  if (!clip) { console.log(`${name}: no clip named "${name}"`); continue; }
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const N = 120, dt = clip.duration / N, frames = [];
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt);
    root.updateMatrixWorld(true);
    frames.push(feet.map((f) => f.getWorldPosition(new THREE.Vector3())));
  }
  const lowest = feet.map((_, k) => Math.min(...frames.map((fr) => fr[k].y)));
  const speeds = [];
  for (let i = 1; i <= N; i++) {
    const k = frames[i][0].y <= frames[i][1].y ? 0 : 1; // the foot nearer the ground
    const a = frames[i - 1][k], c = frames[i][k];
    if (c.y < lowest[k] + 0.04) speeds.push(Math.hypot(c.x - a.x, c.z - a.z) / dt);
  }
  speeds.sort((x, y) => x - y);
  const median = speeds[Math.floor(speeds.length / 2)] ?? 0;
  const note = name === "Run" ? `  (run reads ~16% low: ~${(median * 1.19).toFixed(2)} m/s corrected)` : "";
  console.log(`${name}: ${clip.duration.toFixed(3)} s, planted-foot speed ${median.toFixed(2)} m/s${note}`);
}
