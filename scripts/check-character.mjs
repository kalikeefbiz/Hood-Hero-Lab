#!/usr/bin/env node
// Checks a character delivery against docs/CHARACTER_PIPELINE.md before Claude takes it.
// No dependencies: reads the GLB container and its JSON chunk directly.
//
//   node scripts/check-character.mjs art/incoming/<id>
//
// Prints one line per check and PASS or FAIL at the end (exit code 1 on FAIL).
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/check-character.mjs art/incoming/<id>"); process.exit(2); }
const id = basename(dir.replace(/\/$/, ""));
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"}  ${msg}`); if (!cond) failed++; return cond; };

const REQUIRED_BONES = [
  "Root", "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  ...["Left", "Right"].flatMap((s) => [
    "Shoulder", "Arm", "ForeArm", "Hand", "HandFingers1", "HandFingers2", "HandThumb1", "HandThumb2",
    "UpLeg", "Leg", "Foot", "ToeBase",
  ].map((b) => s + b)),
];
const REQUIRED_EXT = ["EXT_meshopt_compression", "KHR_mesh_quantization"];
const CLIPS = { idle: "Idle", walk: "Walk", run: "Run" };

function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB (bad magic)");
  if (b.readUInt32LE(4) !== 2) throw new Error("not glTF 2.0");
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  let bin = null;
  const binStart = 20 + jsonLen;
  if (binStart + 8 <= b.length && b.readUInt32LE(binStart + 4) === 0x004e4942) {
    bin = b.subarray(binStart + 8, binStart + 8 + b.readUInt32LE(binStart));
  }
  return { json, bin, bytes: b.length };
}
const triangles = (j) =>
  (j.meshes ?? []).flatMap((m) => m.primitives).reduce((n, p) => {
    if (p.mode !== undefined && p.mode !== 4) return n;
    const acc = p.indices !== undefined ? j.accessors[p.indices] : j.accessors[p.attributes.POSITION];
    return n + Math.floor(acc.count / 3);
  }, 0);

// ---------------------------------------------------------------- files
const files = { model: `${id}.glb`, idle: `${id}-idle.glb`, walk: `${id}-walk.glb`, run: `${id}-run.glb` };
for (const f of Object.values(files)) ok(existsSync(join(dir, f)), `file ${f}`);
const manifestPath = join(dir, "manifest.json");
ok(existsSync(manifestPath), "file manifest.json");
ok(existsSync(join(dir, "source")) && readdirSync(join(dir, "source")).some((f) => f.endsWith(".blend")), "source/<id>_source.blend");
ok(existsSync(join(dir, "previews")) && readdirSync(join(dir, "previews")).length >= 3, "previews/ (bind still + walk + run)");
if (failed) { console.log("\nFAIL (missing files)"); process.exit(1); }

let manifest = {};
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) { ok(false, `manifest.json parses (${e.message})`); }
ok(manifest.id === id, `manifest.id is "${id}"`);
ok(typeof manifest.heightM === "number" && manifest.heightM > 1.2 && manifest.heightM < 2.2, `manifest.heightM in 1.2..2.2 (got ${manifest.heightM})`);
ok(manifest.bindPose === "T" || manifest.bindPose === "A", `manifest.bindPose is "T" or "A"`);
ok(Array.isArray(manifest.sourceArt) && manifest.sourceArt.length > 0, "manifest.sourceArt lists the approved art used");
ok(manifest.approvedBy === "owner", 'manifest.approvedBy is "owner"');

// ---------------------------------------------------------------- model
const model = readGlb(join(dir, files.model));
const mj = model.json;
ok(model.bytes <= 1_100_000, `model size ${(model.bytes / 1024).toFixed(0)} KB <= 1074 KB`);
for (const e of REQUIRED_EXT) ok((mj.extensionsUsed ?? []).includes(e), `model uses ${e}`);
ok((mj.extensionsUsed ?? []).includes("KHR_texture_basisu"), "model textures are KTX2 (KHR_texture_basisu)");
ok((mj.skins ?? []).length === 1, `exactly one skin (got ${(mj.skins ?? []).length})`);
ok((mj.animations ?? []).length === 0, "model has no animations (bind pose only)");
const tris = triangles(mj);
ok(tris >= 8000 && tris <= 40000, `triangles ${tris} in 8k..40k`);
ok((mj.materials ?? []).length <= 2, `materials ${(mj.materials ?? []).length} <= 2`);
const jointNames = (mj.skins?.[0]?.joints ?? []).map((i) => mj.nodes[i].name);
const allNodeNames = new Set(mj.nodes.map((n) => n.name));
const missing = REQUIRED_BONES.filter((b) => !allNodeNames.has(b));
ok(missing.length === 0, `required bones present${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
ok(jointNames.length >= 31 && jointNames.length <= 40, `skin joints ${jointNames.length} in 31..40`);
// Texture size from the KTX2 header (pixelWidth at byte 20, pixelHeight at 24).
for (const [i, img] of (mj.images ?? []).entries()) {
  if (img.bufferView === undefined || !model.bin) continue;
  const bv = mj.bufferViews[img.bufferView];
  const at = (bv.byteOffset ?? 0);
  const k = model.bin.subarray(at, at + 32);
  const isKtx2 = k[1] === 0x4b && k[2] === 0x54 && k[3] === 0x58;
  if (ok(isKtx2, `image ${i} is KTX2`)) {
    const w = k.readUInt32LE(20), h = k.readUInt32LE(24);
    ok(w <= 1024 && h <= 1024, `image ${i} ${w}x${h} <= 1024`);
  }
}

// ---------------------------------------------------------------- clips
for (const [key, name] of Object.entries(CLIPS)) {
  const c = readGlb(join(dir, files[key]));
  const cj = c.json;
  ok(c.bytes <= 120_000, `${key}: size ${(c.bytes / 1024).toFixed(0)} KB <= 117 KB`);
  ok((cj.meshes ?? []).length === 0, `${key}: no mesh (skeleton + clip only)`);
  ok((cj.animations ?? []).length === 1, `${key}: exactly one animation`);
  const a = cj.animations?.[0];
  if (!a) continue;
  ok(a.name === name, `${key}: clip named "${name}" (got "${a.name}")`);
  const targets = new Set(a.channels.map((ch) => cj.nodes[ch.target.node]?.name));
  const strangers = [...targets].filter((n) => !allNodeNames.has(n));
  ok(strangers.length === 0, `${key}: every channel targets a model bone${strangers.length ? ` (unknown: ${strangers.join(", ")})` : ""}`);
  // In place: Root may carry a constant track (exporters sample every bone; compression leaves
  // 2 keys for a track that doesn't change) but never real keyframes.
  const rootKeys = Math.max(0, ...a.channels
    .filter((ch) => cj.nodes[ch.target.node]?.name === "Root" && ch.target.path === "translation")
    .map((ch) => cj.accessors[a.samplers[ch.sampler].output].count));
  ok(rootKeys <= 2, `${key}: Root translation is constant (${rootKeys} keys; in place, no root motion)`);
  const dur = Math.max(...a.samplers.map((s) => cj.accessors[s.input].max?.[0] ?? 0));
  const m = manifest.clips?.[name];
  if (ok(!!m, `manifest.clips.${name} present`)) {
    ok(Math.abs(dur - m.seconds) < 1 / 30 + 1e-3, `${key}: length ${dur.toFixed(3)} s matches manifest ${m.seconds} s`);
    if (key === "idle") ok(m.speedMps === 0, "idle: speedMps is 0");
    else ok(m.speedMps > 0.3 && m.speedMps < 6, `${key}: speedMps ${m.speedMps} in 0.3..6`);
  }
  if (key === "walk") ok(dur >= 0.8 && dur <= 1.6, `walk: cycle ${dur.toFixed(2)} s in 0.8..1.6`);
  if (key === "run") ok(dur >= 0.5 && dur <= 0.9, `run: cycle ${dur.toFixed(2)} s in 0.5..0.9`);
  if (key === "idle") ok(dur >= 4 && dur <= 12, `idle: loop ${dur.toFixed(1)} s in 4..12`);
}

console.log(`\n${failed ? "FAIL" : "PASS"}  ${id}: ${failed} problem${failed === 1 ? "" : "s"}`);
process.exit(failed ? 1 : 0);
