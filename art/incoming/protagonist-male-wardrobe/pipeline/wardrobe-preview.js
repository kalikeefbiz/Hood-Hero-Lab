// Review-only: replaces the temporary grey avatar in the running city (strip.html) with the round-5
// protagonist wearing the benchmark wardrobe, using the same binding and body masks as review.html.
// Playable preview build (wardrobe.html); no game code is changed.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
const B = import.meta.env.BASE_URL;
while (!window.__strip?.walk?.avatarLoaded?.()) await new Promise((r) => setTimeout(r, 200));
const S = window.__strip, q = { head: "face-01", complexion: "complexion-01", items: [["tee-white", "models/tops/tee-white.glb"], ["jeans-denim-standard", "models/bottoms/jeans-denim-standard.glb"], ["court-sneakers-white", "models/footwear/court-sneakers-white.glb"]] };
const BODY = B + "art/incoming/protagonist-male-rework", WARD = B + "art/incoming/protagonist-male-wardrobe";
const ktx2 = new KTX2Loader().setTranscoderPath(B + "basis/").detectSupport(S.renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
const g = await loader.loadAsync(`${BODY}/protagonist-male-rework.glb`);
const root = g.scene; let body; root.traverse((o) => { if (o.isSkinnedMesh && o.name === "Body") body = o; });
const bones = new Map(); root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
const bind = (m) => { body.parent.add(m); m.bind(new THREE.Skeleton(m.skeleton.bones.map((b) => bones.get(b.name)), m.skeleton.boneInverses), m.bindMatrix); m.frustumCulled = false; m.castShadow = true; };
const hg = await loader.loadAsync(`${BODY}/heads/${q.head}.glb`); let head; hg.scene.traverse((o) => { if (o.isSkinnedMesh && !head) head = o; }); bind(head);
const tex = await ktx2.loadAsync(`${BODY}/complexions/${q.complexion}.ktx2`); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; body.material.map = tex; body.material.needsUpdate = true;
const masks = await (await fetch(`${WARD}/body-masks.json`)).json(); const idx = body.geometry.index.array; const hidden = new Uint8Array(idx.length / 3);
for (const [id, path] of q.items) {
  const gg = await loader.loadAsync(`${WARD}/${path}`); let m; gg.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === id) m = o; }); bind(m);
  for (const [s, c] of masks.wearables[id].ranges) hidden.fill(1, s, s + c);
}
const vis = []; for (let i = 0; i < hidden.length; i++) if (!hidden[i]) vis.push(idx[3 * i], idx[3 * i + 1], idx[3 * i + 2]);
const geo = body.geometry.clone(); geo.setIndex(vis); body.geometry = geo;
root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
const av = S.scene.getObjectByName("player-avatar"); av.children.forEach((c) => (c.visible = false)); av.add(root);
const mixer = new THREE.AnimationMixer(root); const acts = {};
for (const n of ["Idle", "Walk", "Run"]) { const c = g.animations.find((a) => a.name === n); const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === "Idle" ? 1 : 0); acts[n.toLowerCase()] = a; }
let last = performance.now();
(function tick() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  const st = S.walk?.avatarState?.() ?? "idle", p = S.walk?.player?.();
  for (const [k, a] of Object.entries(acts)) { const w = a.getEffectiveWeight(), want = k === st ? 1 : 0; a.setEffectiveWeight(w + (want - w) * Math.min(1, dt * 7)); }
  if (p) { acts.walk.timeScale = st === "walk" ? THREE.MathUtils.clamp(p.speed / 1.08, 0.5, 1.6) : 1; acts.run.timeScale = st === "run" ? THREE.MathUtils.clamp(p.speed / 3.3, 0.7, 1.4) : 1; }
  mixer.update(dt); requestAnimationFrame(tick);
})();
window.__wardrobeReady = true;
