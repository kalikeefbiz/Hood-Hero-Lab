// Reservoir street strip — standalone preview of the street-level city.
// Not part of the game build's runtime; it loads only on strip.html. The places on it run
// the real game engine on an isolated test campaign (preview.ts); real saves are never touched.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STREETS, STRIP_NPCS, START, STREET_LAMPS, BOUNDS, type Placed } from "./layout";
import { createSharedTextures } from "./sharedTextures";
import { WALLS, FENCES, DOORS, STOREFRONTS, HOUSES, PLAYER_START } from "./cityMap";
import { startPreview } from "./preview";
import { startWalk } from "./walk";
import "./strip.css";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const url = (p: string) => `${base}/${p.replace(/^\//, "")}`;

type Mode = "dusk" | "night";
const params = new URLSearchParams(location.search);
let mode: Mode = params.get("mode") === "night" ? "night" : "dusk";

// ---------------------------------------------------------------- renderer
const canvas = document.querySelector<HTMLCanvasElement>("#strip")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
const dpr = Math.min(window.devicePixelRatio || 1, params.has("hq") ? 3 : 2);
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;

// sky dome (gradient)
const skyUniforms = {
  top: { value: new THREE.Color() },
  horizon: { value: new THREE.Color() },
  glow: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3() },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y*1.6,0.,1.); vec3 c = mix(horizon, top, pow(h,0.6));
        float s = max(dot(normalize(vDir), normalize(sunDir)),0.); c += glow*pow(s,8.)*0.8 + glow*pow(s,90.)*2.;
        gl_FragColor = vec4(c,1.); }`,
  }),
);
sky.frustumCulled = false;
scene.add(sky);

const hemi = new THREE.HemisphereLight();
const sun = new THREE.DirectionalLight();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -45; sc.right = 45; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
scene.add(hemi, sun, sun.target);

// The shadow box follows the player around the block, snapped to a 4 m grid so
// shadows don't shimmer while walking.
const sunOffset = new THREE.Vector3(-55, 14, -38);
let sunFollows = new THREE.Vector3(0, 0, 4);   // becomes the camera target once controls exist
function followSun(force = false) {
  const t = sunFollows;
  const x = Math.round(t.x / 4) * 4, z = Math.round(t.z / 4) * 4;
  if (!force && x === sun.target.position.x && z === sun.target.position.z) return;
  sun.target.position.set(x, 0, z);
  sun.position.set(x, 0, z).add(sunOffset);
}
const nightLights: THREE.PointLight[] = [];
const emissiveMats: { m: THREE.MeshStandardMaterial; night: number; dusk: number }[] = [];

function applyMode() {
  const night = mode === "night";
  skyUniforms.top.value.set(night ? 0x03050c : 0x2a3f6e);
  skyUniforms.horizon.value.set(night ? 0x1b1f33 : 0xf0a46a);
  skyUniforms.glow.value.set(night ? 0x223355 : 0xffb070);
  const sunPos = night ? new THREE.Vector3(-30, 45, -40) : new THREE.Vector3(-55, 14, -38);
  skyUniforms.sunDir.value.copy(sunPos).normalize();
  sunOffset.copy(sunPos);
  followSun(true);
  sun.color.set(night ? 0x8fa6ff : 0xffb27a);
  sun.intensity = night ? 0.22 : 2.6;
  hemi.color.set(night ? 0x2a3555 : 0x9fb6e0);
  hemi.groundColor.set(night ? 0x0c0b10 : 0x4a3428);
  hemi.intensity = night ? 0.12 : 0.9;
  renderer.toneMappingExposure = night ? 1.35 : 1.0;
  scene.fog = new THREE.Fog(night ? 0x0b0d16 : 0xc98f6c, 35, 160);
  scene.environmentIntensity = night ? 0.07 : 0.7;
  for (const l of nightLights) l.visible = night;
  for (const e of emissiveMats) e.m.emissiveIntensity = night ? e.night : e.dusk;
  document.body.dataset.mode = mode;
}

// ---------------------------------------------------------------- loading
const ktx2 = new KTX2Loader().setTranscoderPath(url("basis/")).detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
// strip.html?map draws the gameplay map (cityMap.ts) over the city for checking.
if (params.has("map")) {
  const g = new THREE.Group();
  const line = (pts: number[][], color: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.15, z)));
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false })));
  };
  for (const r of WALLS) line([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]], 0xff3030);
  for (const f of FENCES) line([[f.ax, f.az], [f.bx, f.bz]], 0xff9a20);
  const ring = (x: number, z: number, r: number, color: number) =>
    line(Array.from({ length: 25 }, (_, i) => [x + r * Math.cos((i / 24) * Math.PI * 2), z + r * Math.sin((i / 24) * Math.PI * 2)]), color);
  for (const d of DOORS) ring(d.x, d.z, d.radius, 0x30ff60);
  for (const d of [...STOREFRONTS, ...HOUSES]) ring(d.x, d.z, d.radius, 0x30c0ff);
  ring(PLAYER_START.x, PLAYER_START.z, 0.5, 0xffffff);
  g.renderOrder = 999;
  scene.add(g);
}
const attachShared = createSharedTextures(ktx2, url("assets/tex/"), Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const progress = document.querySelector<HTMLElement>("#progress")!;

// Streets load nearest-first, a few files at a time, so the street you start on is
// playable before the rest of the hood arrives. A file used several times (the
// houses) downloads once and is cloned; clones share geometry, materials, textures.
const startZ = START.target[2];
const ordered = [...STREETS].sort((a, b) => Math.abs(a.z - startZ) - Math.abs(b.z - startZ));
const firstStreet = new Set(ordered[0].assets);
let firstLeft = ordered[0].assets.length + STRIP_NPCS.length;
let allLeft = ordered.reduce((n, s) => n + s.assets.length, 0) + STRIP_NPCS.length;
const tick = (first: boolean) => {
  allLeft--;
  if (first) firstLeft--;
  if (firstLeft > 0) {
    const total = ordered[0].assets.length + STRIP_NPCS.length;
    progress.textContent = `Loading ${ordered[0].name}… ${Math.round(((total - firstLeft) / total) * 100)}%`;
  } else if (allLeft > 0) {
    progress.classList.add("background");
    progress.textContent = "Loading more of the Reservoir…";
  } else progress.remove();
};
const sceneCache = new Map<string, Promise<THREE.Object3D>>();
function loadScene(file: string): Promise<THREE.Object3D> {
  let p = sceneCache.get(file);
  if (!p) {
    p = loader.loadAsync(url(file)).then(async (g) => {
      await attachShared(g.scene);
      tune(g.scene);
      return g.scene;
    });
    sceneCache.set(file, p);
    return p;
  }
  return p.then((s) => s.clone());
}
async function place(a: Placed) {
  try {
    const obj = await loadScene(a.file);
    obj.position.set(a.x, 0, a.z);
    obj.rotation.y = a.rotY ?? 0;
    scene.add(obj);
    applyMode();
  } catch (e) {
    console.error("strip asset failed", a.file, e);
  }
  tick(firstStreet.has(a));
}
async function runQueue(items: Placed[], width: number) {
  let i = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (i < items.length) await place(items[i++]);
  }));
}
runQueue(ordered.flatMap((s) => s.assets), 4);

function tune(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const m = raw as THREE.MeshStandardMaterial;
      const n = m.name || "";
      m.side = THREE.FrontSide;
      if (/Decal|Fence|Leaves|Grass|Wire/.test(n)) {
        m.transparent = /Decal/.test(n);
        m.alphaTest = /Decal/.test(n) ? 0.02 : 0.5;
        m.depthWrite = !/Decal/.test(n);
        m.side = THREE.DoubleSide;
        if (/Decal/.test(n)) {
          m.polygonOffset = true;
          m.polygonOffsetFactor = -2;
          mesh.castShadow = false;
        }
        if (/Wire|Leaves/.test(n)) mesh.castShadow = /Leaves/.test(n);
      }
      if (/Window|Glass/.test(n)) m.envMapIntensity = 1.6;
      if (m.aoMap) m.aoMapIntensity = 1.0;
      if (/Bulb|Neon|Lamp_Lens/.test(n)) emissiveMats.push({ m, night: 6, dusk: 2.5 });
      else if (m.emissiveMap) emissiveMats.push({ m, night: 1.7, dusk: 0.35 });
      if (m.map && !m.userData.shared?.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
}

for (const n of STRIP_NPCS) {
  loader.load(url(n.file), (g) => {
    g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const box = new THREE.Box3().setFromObject(g.scene);
    const h = box.max.y - box.min.y;
    g.scene.scale.setScalar(n.height / Math.max(0.01, h));
    g.scene.position.set(n.x, 0, n.z);
    g.scene.rotation.y = n.rotY;
    scene.add(g.scene);
    const play = (clip: THREE.AnimationClip | undefined) => {
      if (!clip) return;
      const mixer = new THREE.AnimationMixer(g.scene);
      const action = mixer.clipAction(clip).play();
      action.time = Math.random() * clip.duration; // NPCs never move in sync
      mixer.update(0);
      mixers.push(mixer);
    };
    if (n.clip) loader.load(url(n.clip), (c) => play(c.animations[0]));
    else play(g.animations[0]);
    tick(true);
  }, undefined, () => tick(true));
}
const mixers: THREE.AnimationMixer[] = [];

// street lamps at night
for (const p of STREET_LAMPS) {
  const l = new THREE.PointLight(0xffb36a, 70, 24, 2);
  l.position.set(p[0], p[1], p[2]);
  scene.add(l); nightLights.push(l);
}
for (const p of [[0.0, 4.35, 0.9], [4.75, 3.75, -4.6]]) {
  const l = new THREE.PointLight(0xffd9a0, 16, 9, 2);
  l.position.set(p[0], p[1], p[2]); scene.add(l); nightLights.push(l);
}
const windowGlow = new THREE.PointLight(0xdfe8ff, 14, 8, 2);
windowGlow.position.set(0, 1.6, 1.4); scene.add(windowGlow); nightLights.push(windowGlow);

// ---------------------------------------------------------------- controls
// Default: walk the temporary avatar (player controller). ?select: the developer location
// selector with a free orbit camera. Both run on the same isolated test campaign.
const view: "walk" | "select" = params.has("select") ? "select" : "walk";
document.body.dataset.view = view;

document.querySelector("#mode")!.addEventListener("click", () => {
  mode = mode === "dusk" ? "night" : "dusk";
  applyMode();
});

let controls: OrbitControls | undefined;
let walk: ReturnType<typeof startWalk> | null = null;
let move: THREE.Vector2 | null = null;
const keys = new Set<string>();
if (view === "select") {
  const orbit = new OrbitControls(camera, canvas);
  controls = orbit;
  sunFollows = orbit.target;
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 1.2;
  orbit.maxDistance = 38;
  orbit.target.set(START.target[0], START.target[1], START.target[2]);
  camera.position.set(START.eye[0], START.eye[1], START.eye[2]);

  // joystick: slides the look-target along the ground, camera follows
  const pad = document.querySelector<HTMLElement>("#pad")!;
  const knob = pad.querySelector<HTMLElement>(".knob")!;
  const m = (move = new THREE.Vector2());
  let padId: number | null = null;
  const padMove = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.min(max, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
    m.set((Math.cos(a) * len) / max, (Math.sin(a) * len) / max);
  };
  pad.addEventListener("pointerdown", (e) => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); padMove(e); e.stopPropagation(); });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === padId) padMove(e); });
  const padEnd = (e: PointerEvent) => { if (e.pointerId !== padId) return; padId = null; m.set(0, 0); knob.style.transform = ""; };
  pad.addEventListener("pointerup", padEnd);
  pad.addEventListener("pointercancel", padEnd);
  addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  document.querySelector("#street")!.addEventListener("click", () => {
    const dir = new THREE.Vector3().subVectors(camera.position, orbit.target).setY(0).normalize();
    orbit.target.y = 1.6;
    camera.position.copy(orbit.target).addScaledVector(dir, 2.2).setY(1.7);
  });
  document.querySelector("#overview")!.addEventListener("click", () => {
    orbit.target.set(START.target[0], START.target[1], START.target[2]);
    camera.position.set(START.eye[0], START.eye[1], START.eye[2]);
  });
}

const preview = startPreview({ scene, camera, canvas, mode: view, controls });
if (view === "walk") {
  walk = startWalk({ scene, camera, canvas, loader, url, preview: preview.api });
  sunFollows = walk.focus();
}

const clock = new THREE.Clock();
const fpsEl = document.querySelector<HTMLElement>("#fps")!;
let frames = 0, acc = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (walk) {
    walk.update(dt);
    walk.focus();
  } else if (controls && move) {
    const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const ky = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    const mx = move.x + kx, my = move.y + ky;
    if (mx || my) {
      const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const step = new THREE.Vector3().addScaledVector(right, mx).addScaledVector(fwd, -my).multiplyScalar(3.2 * dt);
      controls.target.add(step);
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, BOUNDS.x0, BOUNDS.x1);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, BOUNDS.z0, BOUNDS.z1);
      camera.position.add(step);
    }
  }
  preview.update(dt);
  controls?.update();
  followSun();
  if (camera.position.y < 0.4) camera.position.y = 0.4;
  for (const m of mixers) m.update(dt);
  renderer.render(scene, camera);
  frames++; acc += dt;
  if (acc > 1) { fpsEl.textContent = `${Math.round(frames / acc)} fps`; frames = 0; acc = 0; }
  requestAnimationFrame(frame);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
applyMode();
frame();
(window as unknown as { __strip: unknown }).__strip = { scene, camera, controls, renderer, view, preview: preview.api, walk: walk?.api ?? null, setMode: (m: Mode) => { mode = m; applyMode(); } };
