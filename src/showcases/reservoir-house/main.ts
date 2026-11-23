import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createReservoirHouse, loadHouseTextures } from "./house";
import { createShowcaseLot } from "./lot";
import { walkOnLot } from "./movement";
import "./showcase.css";

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const loading = get("loading");
const view = get<HTMLSelectElement>("view");
const walkButton = get<HTMLButtonElement>("walk");
const orbitButton = get<HTMLButtonElement>("orbit");
const lightButton = get<HTMLButtonElement>("light");
const joystick = get("joystick");

const presets = {
  front: {
    target: [0.17, 3.78, -2.45],
    azimuth: 0.55,
    elevation: 0.089,
    range: 15.5,
  },
  siding: {
    target: [3.05, 2.08, -1.54],
    azimuth: 1.18,
    elevation: 0.05,
    range: 3.55,
  },
  windows: {
    target: [0.53, 4.94, 0.05],
    azimuth: 0.34,
    elevation: -0.12,
    range: 5.4,
  },
  roof: {
    target: [0.2, 7.1, -3.15],
    azimuth: 0.61,
    elevation: 0.48,
    range: 9.4,
  },
  porch: {
    target: [0, 1.67, 1.08],
    azimuth: 0.39,
    elevation: 0.05,
    range: 5.9,
  },
  side: {
    target: [3.78, 1.73, -6.4],
    azimuth: 1.12,
    elevation: 0.15,
    range: 5.4,
  },
  rear: {
    target: [0, 3.49, -6.65],
    azimuth: -2.72,
    elevation: 0.04,
    range: 13.7,
  },
} as const;
type View = keyof typeof presets;

async function loadWalker(renderer: THREE.WebGLRenderer) {
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(import.meta.env.BASE_URL + "basis/")
    .detectSupport(renderer);
  const loader = new GLTFLoader()
    .setKTX2Loader(ktx2)
    .setMeshoptDecoder(MeshoptDecoder);
  const base = import.meta.env.BASE_URL + "assets/models/characters/";
  try {
    const [model, animation] = await Promise.all([
      loader.loadAsync(base + "mega.glb"),
      loader.loadAsync(base + "mega-walk.glb"),
    ]);
    const actor = new THREE.Group();
    actor.name = "1.80 m scale character";
    const box = new THREE.Box3().setFromObject(model.scene);
    const scale = 1.8 / (box.max.y - box.min.y);
    model.scene.scale.setScalar(scale);
    model.scene.position.y = -box.min.y * scale;
    model.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    actor.add(model.scene);
    const mixer = new THREE.AnimationMixer(model.scene);
    const idle = mixer.clipAction(model.animations[0]).play();
    const walk = mixer.clipAction(animation.animations[0]).play();
    walk.setEffectiveWeight(0);
    mixer.update(0.65);
    return { actor, mixer, idle, walk };
  } finally {
    ktx2.dispose();
  }
}

async function run() {
  const canvas = get<HTMLCanvasElement>("scene");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const env = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.035).texture;
  env.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.07, 96);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(77, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color() },
        zenith: { value: new THREE.Color() },
      },
      vertexShader: `
      varying float vAltitude;
      void main() {
        vAltitude = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 zenith;
      varying float vAltitude;
      void main() {
        float t = pow(clamp(vAltitude * 2.0, 0.0, 1.0), 0.58);
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
        #include <colorspace_fragment>
      }`,
    }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.target.position.set(0, 0, -3);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -11.5;
  sun.shadow.camera.right = 11.5;
  sun.shadow.camera.bottom = -12.5;
  sun.shadow.camera.top = 12.5;
  sun.shadow.camera.near = 0.8;
  sun.shadow.camera.far = 42;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.037;
  scene.add(hemi, sun, sun.target);

  const [textures, walker] = await Promise.all([
    loadHouseTextures(Math.min(4, renderer.capabilities.getMaxAnisotropy())),
    loadWalker(renderer),
  ]);
  const house = createReservoirHouse(textures);
  const lot = createShowcaseLot(textures);
  scene.add(lot, house.root, walker.actor);
  const houseTriangles = house.root.children.reduce(
    (total, node) =>
      node instanceof THREE.Mesh
        ? total + node.geometry.getIndex()!.count / 3
        : total,
    0,
  );
  const start = { x: 1.97, y: 0.055, z: 4.16 };
  let feet = { ...start };
  walker.actor.rotation.y = 0.44;
  walker.actor.position.set(feet.x, feet.y, feet.z);
  const fog = new THREE.Fog(0x9cb3c9, 23, 51);
  scene.fog = fog;

  let dirty = true;
  let night = false;
  function lightScene() {
    sun.color.set(night ? 0x9eb9ff : 0xffd6b4);
    sun.intensity = night ? 0.29 : 2.24;
    sun.position.set(night ? -8 : -9, night ? 16 : 11, night ? -12 : 9);
    hemi.color.set(night ? 0x8ea4dc : 0xb6cef2);
    hemi.groundColor.set(night ? 0x3f3e53 : 0x9d7b57);
    hemi.intensity = night ? 0.43 : 1.37;
    scene.environmentIntensity = night ? 0.16 : 0.35;
    renderer.toneMappingExposure = night ? 1.24 : 1.03;
    sky.material.uniforms.horizon.value.set(night ? 0x263854 : 0xb5cbe5);
    sky.material.uniforms.zenith.value.set(night ? 0x101b33 : 0x7499d5);
    fog.color.set(night ? 0x26354a : 0x9cb3c9);
    house.setNight(night);
    dirty = true;
    renderer.shadowMap.needsUpdate = true;
    lightButton.setAttribute("aria-pressed", String(night));
    document.body.dataset.light = night ? "night" : "day";
  }
  lightScene();

  let mode: "inspect" | "orbit" | "walk" = "inspect";
  let azimuth = 0,
    elevation = 0,
    range = 1;
  let selected: View = "front";
  const target = new THREE.Vector3();
  const ideal = new THREE.Vector3();
  const looking = new THREE.Vector3(),
    direction = new THREE.Vector3();
  const boom = new THREE.Ray(),
    hit = new THREE.Vector3();
  const cameraBlockers = house.collision.blockers.map(
    (box) =>
      new THREE.Box3(
        new THREE.Vector3(box.x0 - 0.1, box.bottom - 0.05, box.z0 - 0.1),
        new THREE.Vector3(box.x1 + 0.1, box.top + 0.075, box.z1 + 0.1),
      ),
  );
  const keys = new Set<string>();
  const stick = new THREE.Vector2();
  let aspect = 1;
  const displaySize = new THREE.Vector2();

  function choose(name: View) {
    selected = name;
    const preset = presets[name];
    target.set(preset.target[0], preset.target[1], preset.target[2]);
    azimuth = preset.azimuth;
    elevation = preset.elevation;
    range = preset.range;
    view.value = name;
    setMode("inspect");
  }

  function setMode(next: typeof mode) {
    mode = next;
    dirty = true;
    if (mode === "walk") {
      azimuth = 0.29;
      elevation = 0.17;
    }
    document.body.dataset.mode = mode;
    walkButton.setAttribute("aria-pressed", String(mode === "walk"));
    orbitButton.setAttribute("aria-pressed", String(mode === "orbit"));
    joystick.hidden = mode !== "walk";
    view.disabled = mode === "walk";
    const showWalker =
      mode !== "inspect" || selected === "front" || selected === "rear";
    if (walker.actor.visible !== showWalker) {
      walker.actor.visible = showWalker;
      renderer.shadowMap.needsUpdate = true;
    }
    get("help").textContent =
      mode === "walk"
        ? "Stick or WASD to move · Drag to look"
        : "Drag to rotate · Pinch or scroll to zoom";
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    aspect = width / height;
    // Fixed CSS-resolution budget on high-DPI phones. Modest supersampling on desktop.
    renderer.setPixelRatio(width < 720 ? 1 : Math.min(devicePixelRatio, 1.25));
    renderer.setSize(width, height, false);
    camera.setViewOffset(
      width,
      height,
      0,
      width < 720 ? Math.min(60, height * 0.09) : 0,
      width,
      height,
    );
    renderer.getDrawingBufferSize(displaySize);
    dirty = true;
  }
  window.addEventListener("resize", resize);
  resize();
  choose("front");

  walkButton.addEventListener("click", () =>
    mode === "walk" ? choose(selected) : setMode("walk"),
  );
  orbitButton.addEventListener("click", () => {
    if (mode === "orbit") setMode("inspect");
    else {
      choose("front");
      target.set(0, 3.82, -3.78);
      range = 15.5;
      elevation = 0.095;
      setMode("orbit");
    }
  });
  lightButton.addEventListener("click", () => {
    night = !night;
    lightScene();
  });
  view.addEventListener("change", () => choose(view.value as View));

  const pointers = new Map<number, THREE.Vector2>();
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(
      event.pointerId,
      new THREE.Vector2(event.clientX, event.clientY),
    );
    if (mode === "orbit") setMode("inspect");
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    dirty = true;
    const dx = event.clientX - point.x,
      dy = event.clientY - point.y;
    if (pointers.size === 2 && mode !== "walk") {
      const partner = [...pointers.entries()].find(
        ([id]) => id !== event.pointerId,
      )![1];
      const previous = point.distanceTo(partner);
      point.set(event.clientX, event.clientY);
      const distance = point.distanceTo(partner);
      if (previous > 4 && distance > 4)
        range = THREE.MathUtils.clamp((range * previous) / distance, 1.85, 26);
      return;
    }
    azimuth -= dx * 0.008;
    elevation = THREE.MathUtils.clamp(
      elevation + dy * 0.006,
      mode === "walk" ? -0.37 : -0.28,
      mode === "walk" ? 0.7 : 1.27,
    );
    point.set(event.clientX, event.clientY);
  });
  for (const event of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const) {
    canvas.addEventListener(event, (e) => pointers.delete(e.pointerId));
  }
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (mode === "walk") return;
      dirty = true;
      range = THREE.MathUtils.clamp(
        range * Math.exp(event.deltaY * 0.001),
        1.85,
        26,
      );
    },
    { passive: true },
  );

  let stickPointer: number | undefined;
  function updateStick(event: PointerEvent) {
    const rect = joystick.getBoundingClientRect();
    stick.set(
      (event.clientX - rect.left - rect.width / 2) / 32,
      (event.clientY - rect.top - rect.height / 2) / 32,
    );
    if (stick.lengthSq() > 1) stick.normalize();
    joystick.firstElementChild!.setAttribute(
      "style",
      `translate: ${stick.x * 26}px ${stick.y * 26}px`,
    );
  }
  joystick.addEventListener("pointerdown", (event) => {
    if (stickPointer !== undefined) return;
    stickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateStick(event);
  });
  joystick.addEventListener("pointermove", (event) => {
    if (stickPointer === event.pointerId) updateStick(event);
  });
  function clearStick() {
    stickPointer = undefined;
    stick.set(0, 0);
    joystick.firstElementChild!.removeAttribute("style");
  }
  for (const event of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ] as const) {
    joystick.addEventListener(event, (e) => {
      if (e.pointerId === stickPointer) clearStick();
    });
  }
  const moveCodes = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]);
  window.addEventListener("keydown", (event) => {
    if (mode === "walk" && moveCodes.has(event.code) && event.target !== view) {
      event.preventDefault();
      keys.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    clearStick();
  });

  const move = new THREE.Vector2();
  function stepWalker(dt: number) {
    const key = (a: string, b: string) => Number(keys.has(a) || keys.has(b));
    move.set(
      stick.x + key("KeyD", "ArrowRight") - key("KeyA", "ArrowLeft"),
      -stick.y + key("KeyW", "ArrowUp") - key("KeyS", "ArrowDown"),
    );
    const speed = Math.min(1, move.length()) * 2.4;
    if (speed <= 0.035) return false;
    move.normalize();
    const dx =
      (Math.cos(azimuth) * move.x - Math.sin(azimuth) * move.y) * speed * dt;
    const dz =
      (-Math.sin(azimuth) * move.x - Math.cos(azimuth) * move.y) * speed * dt;
    const before = feet;
    const both = walkOnLot(feet, feet.x + dx, feet.z + dz, house.collision);
    feet =
      both === feet
        ? walkOnLot(
            walkOnLot(feet, feet.x + dx, feet.z, house.collision),
            feet.x,
            feet.z + dz,
            house.collision,
          )
        : both;
    walker.actor.position.set(feet.x, feet.y, feet.z);
    walker.actor.rotation.y = Math.atan2(dx, dz);
    return Math.hypot(feet.x - before.x, feet.z - before.z) > 0.0001;
  }

  function placeCamera() {
    const walking = mode === "walk";
    const fit =
      mode === "orbit" || selected === "front" || selected === "rear"
        ? 0.92
        : 0.66;
    const distance = walking ? 3.1 : range * Math.max(1, fit / aspect);
    const horizontal = distance * Math.cos(elevation);
    if (walking) looking.set(feet.x, feet.y + 1.25, feet.z);
    else looking.copy(target);
    ideal
      .copy(looking)
      .add(
        direction.set(
          Math.sin(azimuth) * horizontal,
          Math.sin(elevation) * distance,
          Math.cos(azimuth) * horizontal,
        ),
      );
    if (walking) {
      ideal.y = Math.max(0.47, ideal.y);
      direction.copy(ideal).sub(looking);
      let limit = direction.length();
      boom.set(looking, direction.normalize());
      for (const blocker of cameraBlockers) {
        if (!boom.intersectBox(blocker, hit) || blocker.containsPoint(looking))
          continue;
        limit = Math.min(limit, Math.max(0.32, hit.distanceTo(looking) - 0.13));
      }
      ideal.copy(looking).addScaledVector(direction, limit);
    }
    camera.position.copy(ideal);
    camera.lookAt(looking);
  }

  const controls = document.querySelector<HTMLElement>(".controls")!;
  loading.remove();
  controls.hidden = false;
  let previous = performance.now();
  let phase = 0;
  let statStart = 0;
  const performancePanel = controls.querySelector("details")!;
  const frameTimes: number[] = [];
  const stats = get("stats");
  performancePanel.addEventListener("toggle", () => {
    statStart = 0;
    frameTimes.length = 0;
    stats.textContent = "Sampling frame times…";
  });
  document.addEventListener("visibilitychange", () => {
    previous = performance.now();
    statStart = 0;
    frameTimes.length = 0;
  });
  renderer.setAnimationLoop((now) => {
    const elapsed = now - previous;
    previous = now;
    const dt = Math.max(0, Math.min(elapsed / 1000, 0.1));
    if (mode === "orbit") azimuth += Math.min(elapsed / 1000, 0.25) * 0.51;
    const moving = mode === "walk" && stepWalker(dt);
    phase = THREE.MathUtils.damp(phase, Number(moving), 13, dt);
    const measure = performancePanel.open;
    const animate = mode === "walk" && (moving || phase > 0.01);
    if (!dirty && mode !== "orbit" && !animate && !measure) return;
    dirty = false;
    if (animate) {
      walker.idle.setEffectiveWeight(1 - phase);
      walker.walk.setEffectiveWeight(phase);
      walker.mixer.update(dt);
      renderer.shadowMap.needsUpdate = true;
    }
    placeCamera();
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    if (!measure) {
      statStart = 0;
      frameTimes.length = 0;
      return;
    }
    if (statStart === 0) {
      statStart = now;
      return;
    }
    if (elapsed > 0) frameTimes.push(elapsed);
    if (now - statStart > 1500 && frameTimes.length > 0) {
      frameTimes.sort((a, b) => a - b);
      const mean =
        frameTimes.reduce((total, ms) => total + ms, 0) / frameTimes.length;
      const p95 = frameTimes[Math.ceil(0.95 * frameTimes.length) - 1];
      const { calls, triangles } = renderer.info.render;
      stats.textContent = `${displaySize.x} × ${displaySize.y} px · ${(1000 / mean).toFixed(1)} FPS · p95 ${p95.toFixed(1)} ms · ${calls} draws · ${triangles.toLocaleString("en-US")} scene triangles · ${houseTriangles.toLocaleString("en-US")} house triangles`;
      statStart = now;
      frameTimes.length = 0;
    }
  });
}

void run().catch((error) => {
  console.error(error);
  loading.textContent =
    "The showcase could not load. Reload with WebGL 2 enabled.";
});
