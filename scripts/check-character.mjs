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
// Quality profile: manifest.profile is "standard" (default; the original budgets, unchanged) or
// "hero" (flagship characters: PBR maps required, 2K textures, higher ceilings). The hero numbers
// are PROVISIONAL ceilings, not measured budgets: tighten them from device profiling once the
// benchmark outfit is approved (docs/CHARACTER_PIPELINE.md, "Visual quality standard").
//
// Prints one line per check and PASS or FAIL at the end (exit code 1 on FAIL).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const PROFILES = {
  standard: {
    modelBytes: 1_400_000, modelBytesSplit: 1_100_000, tris: [8000, 40000], materials: 2, tex: 1024,
    headBytes: 350_000, headTris: [1000, 8000], headMaterials: 1, skinBytes: 300_000, skinTex: 1024, requirePbr: false,
  },
  hero: {
    modelBytes: 8_000_000, modelBytesSplit: 8_000_000, tris: [8000, 80000], materials: 6, tex: 2048,
    headBytes: 2_500_000, headTris: [1000, 20000], headMaterials: 2, skinBytes: 2_500_000, skinTex: 2048, requirePbr: true,
  },
};
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

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
  const sheetsDir = join(dir, "previews", "threejs");
  const sheets = existsSync(sheetsDir) ? readdirSync(sheetsDir) : [];
  ok(sheets.some((f) => f.endsWith("_face.png")) && sheets.some((f) => f.endsWith("_body.png")),
    "previews/threejs/ has the face and body sheets (node scripts/review-character.mjs " + dir + ")");
  if (failed) { console.log("\nFAIL (missing files)"); return 1; }

  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) { ok(false, `manifest.json parses (${e.message})`); }
  ok(manifest.id === id, `manifest.id is "${id}"`);
  ok(typeof manifest.heightM === "number" && manifest.heightM > 1.2 && manifest.heightM < 2.2, `manifest.heightM in 1.2..2.2 (got ${manifest.heightM})`);
  ok(manifest.bindPose === "T" || manifest.bindPose === "A", `manifest.bindPose is "T" or "A"`);
  ok(Array.isArray(manifest.sourceArt) && manifest.sourceArt.length > 0, "manifest.sourceArt lists the approved art used");
  ok(manifest.approvedBy === "owner", 'manifest.approvedBy is "owner"');
  const profileName = manifest.profile ?? "standard";
  ok(!!PROFILES[profileName], `manifest.profile is "standard" or "hero" (got "${profileName}")`);
  const P = PROFILES[profileName] ?? PROFILES.standard;
  console.log(`      profile: ${PROFILES[profileName] ? profileName : "standard"}`);

  // -------------------------------------------------------------- model
  const model = readGlb(modelFile);
  const mj = model.json;
  const sizeCap = fourFiles ? P.modelBytesSplit : P.modelBytes;
  ok(model.bytes <= sizeCap, `model size ${kb(model.bytes)} <= ${kb(sizeCap)}`);
  ok((mj.extensionsUsed ?? []).some((e) => /meshopt_compression$/.test(e)), "model uses meshopt compression");
  ok((mj.extensionsUsed ?? []).includes("KHR_mesh_quantization"), "model uses KHR_mesh_quantization (run compress.mjs)");
  ok((mj.extensionsUsed ?? []).includes("KHR_texture_basisu"), "model textures are KTX2 (KHR_texture_basisu)");
  ok((mj.skins ?? []).length === 1, `exactly one skin (got ${(mj.skins ?? []).length})`);
  const tris = triangles(mj);
  ok(tris >= P.tris[0] && tris <= P.tris[1], `triangles ${tris} in ${P.tris[0]}..${P.tris[1]}`);
  ok((mj.materials ?? []).length <= P.materials, `materials ${(mj.materials ?? []).length} <= ${P.materials}`);
  if (P.requirePbr) {
    // The runtime copy must still carry the authored PBR maps (compress.mjs prints what survived).
    const mats = mj.materials ?? [];
    ok(mats.some((m) => m.normalTexture), "PBR: a material keeps its normal map");
    ok(mats.some((m) => m.pbrMetallicRoughness?.metallicRoughnessTexture), "PBR: a material keeps its metallic-roughness map");
  }
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
      ok(w <= P.tex && h <= P.tex, `image ${i} ${w}x${h} <= ${P.tex}`);
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

  // -------------------------------------------------------------- modular parts (optional)
  // A modular character (the protagonist) also ships swappable heads and body skin textures.
  // Contract: docs/handoff/protagonist-male.md.
  const headsDir = join(dir, "heads"), skinsDir = join(dir, "complexions");
  if (existsSync(headsDir) || existsSync(skinsDir) || manifest.modular) {
    const mod = manifest.modular ?? {};
    ok(!!manifest.modular, "manifest.modular present (heads and complexions listed)");
    const heads = mod.heads ?? {}, skins = mod.complexions ?? {};
    const headFiles = existsSync(headsDir) ? readdirSync(headsDir).filter((f) => f.endsWith(".glb")) : [];
    const skinFiles = existsSync(skinsDir) ? readdirSync(skinsDir).filter((f) => f.endsWith(".ktx2")) : [];
    ok(headFiles.length >= 1, `heads/ has at least one head (got ${headFiles.length})`);
    ok(!!heads[mod.defaultHead], `manifest.modular.defaultHead "${mod.defaultHead}" is a listed head`);
    for (const f of headFiles) ok(Object.values(heads).some((h) => h.file === `heads/${f}`), `heads/${f} listed in manifest.modular.heads`);
    for (const f of skinFiles) ok(Object.values(skins).some((s) => s.file === `complexions/${f}`), `complexions/${f} listed in manifest.modular.complexions`);
    // Same skeleton, same rest pose: a head is bound to the body's bones by name at runtime.
    const bodyNodes = new Map(mj.nodes.map((n) => [n.name ?? "", n]));
    const near = (a = [0, 0, 0], b = [0, 0, 0]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
    for (const [hid, h] of Object.entries(heads)) {
      const p = join(dir, h.file ?? "");
      if (!ok(!!h.file && existsSync(p), `head ${hid}: file ${h.file}`)) continue;
      ok(!!skins[h.complexion], `head ${hid}: paired complexion "${h.complexion}" is listed`);
      ok(typeof h.meshyTaskId === "string" && h.meshyTaskId.length > 0, `head ${hid}: meshyTaskId recorded`);
      ok(sheets.some((f) => f.endsWith(`_${hid}_face.png`)), `head ${hid}: three.js face sheet in previews/threejs/`);
      const hg = readGlb(p), hj = hg.json;
      ok(hg.bytes <= P.headBytes, `head ${hid}: size ${kb(hg.bytes)} <= ${kb(P.headBytes)}`);
      ok((hj.extensionsUsed ?? []).some((e) => /meshopt_compression$/.test(e)) && (hj.extensionsUsed ?? []).includes("KHR_mesh_quantization"),
        `head ${hid}: meshopt + quantization`);
      ok((hj.extensionsUsed ?? []).includes("KHR_texture_basisu"), `head ${hid}: KTX2 texture`);
      ok((hj.skins ?? []).length === 1, `head ${hid}: exactly one skin`);
      ok((hj.animations ?? []).length === 0, `head ${hid}: no animations (clips live in the body file)`);
      ok((hj.materials ?? []).length <= P.headMaterials, `head ${hid}: materials ${(hj.materials ?? []).length} <= ${P.headMaterials}`);
      if (P.requirePbr) ok((hj.materials ?? []).some((m) => m.normalTexture), `head ${hid}: PBR: a material keeps its normal map`);
      const ht = triangles(hj);
      ok(ht >= P.headTris[0] && ht <= P.headTris[1], `head ${hid}: triangles ${ht} in ${P.headTris[0]}..${P.headTris[1]}`);
      const hjoints = (hj.skins?.[0]?.joints ?? []).map((i) => hj.nodes[i]);
      const stray = hjoints.filter((n) => !bodyNodes.has(n.name ?? "")).map((n) => n.name);
      ok(stray.length === 0, `head ${hid}: every joint is a body bone${stray.length ? ` (unknown: ${stray.join(", ")})` : ""}`);
      const moved = hjoints.filter((n) => {
        const b = bodyNodes.get(n.name ?? "");
        return b && !(near(n.translation, b.translation) && near(n.rotation ?? [0, 0, 0, 1], b.rotation ?? [0, 0, 0, 1]));
      }).map((n) => n.name);
      ok(moved.length === 0, `head ${hid}: rest pose matches the body skeleton${moved.length ? ` (differs: ${moved.join(", ")})` : ""}`);
    }
    for (const [cid, s] of Object.entries(skins)) {
      const p = join(dir, s.file ?? "");
      if (!ok(!!s.file && existsSync(p), `complexion ${cid}: file ${s.file}`)) continue;
      const k = readFileSync(p);
      if (ok(k[1] === 0x4b && k[2] === 0x54 && k[3] === 0x58, `complexion ${cid}: is KTX2`)) {
        const w = k.readUInt32LE(20), h = k.readUInt32LE(24);
        ok(w <= P.skinTex && h <= P.skinTex, `complexion ${cid}: ${w}x${h} <= ${P.skinTex}`);
      }
      ok(k.length <= P.skinBytes, `complexion ${cid}: size ${kb(k.length)} <= ${kb(P.skinBytes)}`);
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
