#!/usr/bin/env node
// Checks a character delivery against docs/CHARACTER_PIPELINE.md before Claude takes it.
// No dependencies: reads the GLB container and its JSON chunk directly.
//
//   node scripts/check-character.mjs art/incoming/<id>
//
// Two delivery shapes are accepted:
//   one file   <id>.glb with mesh + skin + animations named Idle, Walk, Run   (skills route, preferred)
//   four files <id>.glb (mesh + skin, no animation) + <id>-idle/-walk/-run.glb  (Quanny's layout)
// Bones are recognised by body part, so Rigify game-skeleton names (thigh.L, upper_arm.L...) and
// Mixamo-style names (LeftUpLeg, LeftArm...) both pass.
//
// Prints one line per check and PASS or FAIL at the end (exit code 1 on FAIL).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

// Body parts every rig needs, each matched by name (Rigify game skeleton or Mixamo-style).
const SIDES = { L: [/[._]l(\.\d+)?$/i, /^left/i], R: [/[._]r(\.\d+)?$/i, /^right/i] };
const PARTS = {
  root: [/^root$/i],
  hips: [/^hips$/i, /^pelvis$/i, /^spine$/i],
  chest: [/^spine[12]$/i, /^spine\.00[23]$/i, /^chest$/i, /^spine_0[23]$/i],
  neck: [/^neck/i, /^spine\.004$/i],
  head: [/^head$/i, /^spine\.006$/i],
};
const SIDED = {
  upperArm: [/upper_?arm/i, /^(left|right)arm$/i],
  forearm: [/fore_?arm/i, /lower_?arm/i],
  hand: [/^hand[._]/i, /^(left|right)hand$/i],
  thigh: [/^thigh/i, /up_?leg/i],
  shin: [/^shin/i, /^calf/i, /^(left|right)leg$/i],
  foot: [/^foot[._]/i, /^(left|right)foot$/i],
};
export function missingParts(names) {
  const miss = [];
  for (const [part, pats] of Object.entries(PARTS)) if (!names.some((n) => pats.some((p) => p.test(n)))) miss.push(part);
  for (const [part, pats] of Object.entries(SIDED)) for (const [side, sp] of Object.entries(SIDES)) {
    const hit = names.some((n) => pats.some((p) => p.test(n)) && sp.some((s) => s.test(n)));
    if (!hit) miss.push(`${part}.${side}`);
  }
  return miss;
}

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

function main(dir) {
  const id = basename(dir.replace(/\/$/, ""));
  let failed = 0;
  const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"}  ${msg}`); if (!cond) failed++; return cond; };

  // -------------------------------------------------------------- files
  const modelFile = join(dir, `${id}.glb`);
  ok(existsSync(modelFile), `file ${id}.glb`);
  const split = ["idle", "walk", "run"].map((k) => join(dir, `${id}-${k}.glb`));
  const fourFiles = split.some(existsSync);
  if (fourFiles) for (const f of split) ok(existsSync(f), `file ${basename(f)} (four-file delivery)`);
  const manifestPath = join(dir, "manifest.json");
  ok(existsSync(manifestPath), "file manifest.json");
  ok(existsSync(join(dir, "source")) && readdirSync(join(dir, "source")).some((f) => f.endsWith(".blend")), "source/<id>_source.blend");
  ok(existsSync(join(dir, "previews")) && readdirSync(join(dir, "previews")).length >= 3, "previews/ (contact sheet, stress sheet, clip previews)");
  if (failed) { console.log("\nFAIL (missing files)"); return 1; }

  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) { ok(false, `manifest.json parses (${e.message})`); }
  ok(manifest.id === id, `manifest.id is "${id}"`);
  ok(typeof manifest.heightM === "number" && manifest.heightM > 1.2 && manifest.heightM < 2.2, `manifest.heightM in 1.2..2.2 (got ${manifest.heightM})`);
  ok(manifest.bindPose === "T" || manifest.bindPose === "A", `manifest.bindPose is "T" or "A"`);
  ok(Array.isArray(manifest.sourceArt) && manifest.sourceArt.length > 0, "manifest.sourceArt lists the approved art used");
  ok(manifest.approvedBy === "owner", 'manifest.approvedBy is "owner"');

  // -------------------------------------------------------------- model
  const model = readGlb(modelFile);
  const mj = model.json;
  const sizeCap = fourFiles ? 1_100_000 : 1_400_000;
  ok(model.bytes <= sizeCap, `model size ${(model.bytes / 1024).toFixed(0)} KB <= ${(sizeCap / 1024).toFixed(0)} KB`);
  ok((mj.extensionsUsed ?? []).some((e) => /meshopt_compression$/.test(e)), "model uses meshopt compression");
  ok((mj.extensionsUsed ?? []).includes("KHR_mesh_quantization"), "model uses KHR_mesh_quantization (run compress.mjs)");
  ok((mj.extensionsUsed ?? []).includes("KHR_texture_basisu"), "model textures are KTX2 (KHR_texture_basisu)");
  ok((mj.skins ?? []).length === 1, `exactly one skin (got ${(mj.skins ?? []).length})`);
  const tris = triangles(mj);
  ok(tris >= 8000 && tris <= 40000, `triangles ${tris} in 8k..40k`);
  ok((mj.materials ?? []).length <= 2, `materials ${(mj.materials ?? []).length} <= 2`);
  const jointNames = (mj.skins?.[0]?.joints ?? []).map((i) => mj.nodes[i].name ?? "");
  const allNodeNames = mj.nodes.map((n) => n.name ?? "");
  const miss = missingParts(allNodeNames);
  ok(miss.length === 0, `rig has every body part${miss.length ? ` (missing: ${miss.join(", ")})` : ""}`);
  ok(jointNames.length >= 20 && jointNames.length <= 100, `skin joints ${jointNames.length} in 20..100`);
  ok(!jointNames.some((n) => /^(MCH|ORG|DEF)-|^(IK|Pole)_/.test(n)), "no control/helper bones in the skin (game skeleton only)");
  for (const [i, img] of (mj.images ?? []).entries()) {
    if (img.bufferView === undefined || !model.bin) continue;
    const bv = mj.bufferViews[img.bufferView];
    const at = bv.byteOffset ?? 0;
    const k = model.bin.subarray(at, at + 32);
    if (ok(k[1] === 0x4b && k[2] === 0x54 && k[3] === 0x58, `image ${i} is KTX2`)) {
      const w = k.readUInt32LE(20), h = k.readUInt32LE(24);
      ok(w <= 1024 && h <= 1024, `image ${i} ${w}x${h} <= 1024`);
    }
  }

  // -------------------------------------------------------------- clips
  const NAMES = { idle: "Idle", walk: "Walk", run: "Run" };
  const nameSet = new Set(allNodeNames);
  const checkClip = (key, cj, a, label) => {
    const name = NAMES[key];
    const targets = new Set(a.channels.map((ch) => cj.nodes[ch.target.node]?.name));
    const strangers = [...targets].filter((n) => !nameSet.has(n));
    ok(strangers.length === 0, `${label}: every channel targets a model bone${strangers.length ? ` (unknown: ${strangers.join(", ")})` : ""}`);
    // In place: root may carry a constant track (exporters sample every bone; compression
    // leaves 2 keys for a track that doesn't change) but never real keyframes.
    const rootKeys = Math.max(0, ...a.channels
      .filter((ch) => /^root$/i.test(cj.nodes[ch.target.node]?.name ?? "") && ch.target.path === "translation")
      .map((ch) => cj.accessors[a.samplers[ch.sampler].output].count));
    ok(rootKeys <= 2, `${label}: root translation is constant (${rootKeys} keys; in place, no root motion)`);
    ok(!a.channels.some((ch) => ch.target.path === "scale" && cj.accessors[a.samplers[ch.sampler].output].count > 2),
      `${label}: no animated bone scale`);
    const dur = Math.max(...a.samplers.map((s) => cj.accessors[s.input].max?.[0] ?? 0));
    const m = manifest.clips?.[name];
    if (ok(!!m, `manifest.clips.${name} present`)) {
      ok(Math.abs(dur - m.seconds) < 1 / 30 + 1e-3, `${label}: length ${dur.toFixed(3)} s matches manifest ${m.seconds} s`);
      if (key === "idle") ok(m.speedMps === 0, "idle: speedMps is 0");
      else ok(m.speedMps > 0.3 && m.speedMps < 6, `${label}: speedMps ${m.speedMps} in 0.3..6`);
    }
    if (key === "walk") ok(dur >= 0.8 && dur <= 1.6, `walk: cycle ${dur.toFixed(2)} s in 0.8..1.6`);
    if (key === "run") ok(dur >= 0.5 && dur <= 0.9, `run: cycle ${dur.toFixed(2)} s in 0.5..0.9`);
    if (key === "idle") ok(dur >= 4 && dur <= 12, `idle: loop ${dur.toFixed(1)} s in 4..12`);
  };

  if (fourFiles) {
    ok((mj.animations ?? []).length === 0, "model has no animations (four-file delivery: bind pose only)");
    for (const key of Object.keys(NAMES)) {
      const c = readGlb(join(dir, `${id}-${key}.glb`));
      const cj = c.json;
      ok(c.bytes <= 120_000, `${key}: size ${(c.bytes / 1024).toFixed(0)} KB <= 117 KB`);
      ok((cj.meshes ?? []).length === 0, `${key}: no mesh (skeleton + clip only)`);
      ok((cj.animations ?? []).length === 1, `${key}: exactly one animation`);
      const a = cj.animations?.[0];
      if (!a) continue;
      ok(a.name === NAMES[key], `${key}: clip named "${NAMES[key]}" (got "${a.name}")`);
      checkClip(key, cj, a, key);
    }
  } else {
    const anims = mj.animations ?? [];
    const names = anims.map((a) => a.name);
    ok(names.length === 3, `model has exactly 3 animations (got ${names.length}: ${names.join(", ")})`);
    for (const [key, name] of Object.entries(NAMES)) {
      const a = anims.find((x) => x.name === name);
      if (ok(!!a, `animation "${name}" present`)) checkClip(key, mj, a, name);
    }
  }

  console.log(`\n${failed ? "FAIL" : "PASS"}  ${id}: ${failed} problem${failed === 1 ? "" : "s"}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node scripts/check-character.mjs art/incoming/<id>"); process.exit(2); }
  process.exit(main(dir));
}
