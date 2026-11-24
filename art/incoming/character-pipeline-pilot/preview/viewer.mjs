import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const fields = Object.fromEntries([...document.querySelectorAll("#controls select, #controls input")].map(e => [e.id, e]));
const status = document.querySelector("#status");
const panels = document.querySelector("#panels");
const canvas = document.querySelector("#scene");
const character = "../../protagonist-male";
const garments = ["tee-white", "jeans-denim-standard", "court-sneakers-white"];
const labels = { baseline: "Current protagonist", a: "Current rig + mocap", b: "MPFB rig + mocap" };

function skinned(root, name) {
  const mesh = name ? root.getObjectByName(name) : root.getObjectsByProperty("isSkinnedMesh", true)[0];
  if (!mesh?.isSkinnedMesh) throw Error(`Missing skinned mesh ${name ?? ""}`);
  return mesh;
}

function bindToBody(body, mesh) {
  const byName = new Map(body.skeleton.bones.map(bone => [bone.name, bone]));
  const bones = mesh.skeleton.bones.map(bone => byName.get(bone.name));
  if (bones.some(b => !b)) throw Error("Wearable joint is outside the baseline rig");
  body.parent.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
}

function maskBody(body, masks) {
  const geometry = body.geometry.clone();
  const source = geometry.index.array;
  if (source.length !== masks.indexCount) throw Error("Wardrobe mask index count differs");
  const hidden = new Uint8Array(source.length / 3);
  for (const id of garments) {
    for (const [start, count] of masks.wearables[id].ranges) hidden.fill(1, start, start + count);
  }
  const keep = new source.constructor(source.length - hidden.reduce((a, b) => a + 3 * b, 0));
  for (let i = 0, j = 0; i < hidden.length; i++) {
    if (hidden[i]) continue;
    keep.set(source.subarray(i * 3, i * 3 + 3), j);
    j += 3;
  }
  geometry.setIndex(new THREE.BufferAttribute(keep, 1));
  return geometry;
}

async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.AgXToneMapping;
  const ktx = new KTX2Loader().setTranscoderPath("../../../../public/basis/").detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04).texture;
  room.dispose();
  pmrem.dispose();
  const manifest = await fetch(`${character}/manifest.json`).then(r => r.json());
  const face = manifest.modular.heads[manifest.modular.defaultHead];
  const complexion = `${character}/${manifest.modular.complexions[face.complexion].file}`;
  const mask = await fetch("../test-c/canonical-masks.json").then(r => r.json());
  const original = await fetch(`${character}/protagonist-male.glb`).then(r => r.arrayBuffer());
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", original);
    const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    if (hex !== mask.bodySha256) throw Error("Canonical body hash differs from the wardrobe mask");
  }
  const tex = await ktx.loadAsync(complexion);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;

  async function canonical(id, gltf) {
    const body = skinned(gltf.scene, "Body");
    const full = body.geometry;
    const masked = maskBody(body, mask);
    body.material.map = tex;
    body.material.needsUpdate = true;
    bindToBody(body, skinned((await loader.loadAsync(`${character}/${face.file}`)).scene));
    const wearable = await Promise.all(garments.map(async id => {
      const mesh = skinned((await loader.loadAsync(`../test-c/${id}.glb`)).scene, id);
      bindToBody(body, mesh);
      return mesh;
    }));
    return createStage(id, gltf, (visible) => {
      body.geometry = visible ? masked : full;
      wearable.forEach(mesh => { mesh.visible = visible; });
    });
  }

  function createStage(id, gltf, outfit) {
    const scene = new THREE.Scene();
    scene.environment = environment;
    const stage = new THREE.Group();
    stage.add(gltf.scene);
    gltf.scene.traverse(obj => { if (obj.isMesh) obj.frustumCulled = false; });
    const skeleton = new THREE.SkeletonHelper(gltf.scene);
    skeleton.material.depthTest = false;
    skeleton.renderOrder = 10;
    stage.add(skeleton);
    const ground = new THREE.GridHelper(14, 28, 0x778292, 0x546071);
    const hemi = new THREE.HemisphereLight();
    const sun = new THREE.DirectionalLight();
    scene.add(stage, ground, hemi, sun);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    let active;
    return {
      id, scene, ground, stage, skeleton, hemi, sun, outfit, gltf, mixer,
      animate(name, t, fade) {
        const nextClip = gltf.animations.find(clip => clip.name === name);
        const next = nextClip && mixer.clipAction(nextClip);
        if (active !== next) {
          if (active) {
            if (next && fade) active.fadeOut(.20);
            else active.stop();
          }
          if (next) {
            next.reset().play();
            if (active && fade) next.fadeIn(.20);
          }
          active = next;
        }
        if (t !== undefined) {
          mixer.stopAllAction();
          active?.reset().play();
          mixer.setTime(t);
        }
      },
    };
  }

  const [baseline, a, bGltf] = await Promise.all([
    loader.parseAsync(original, ""), loader.loadAsync("../test-a/protagonist-mocap.glb"),
    loader.loadAsync("../test-c/mpfb-outfit.glb"),
  ]);
  const b = createStage("b", bGltf, visible => {
    skinned(bGltf.scene, "MPFB_Masked").visible = visible;
    skinned(bGltf.scene, "MPFB_Body").visible = !visible;
    for (const id of garments) skinned(bGltf.scene, id).visible = visible;
  });
  const views = [await canonical("baseline", baseline), await canonical("a", a), b];
  const camera = new THREE.PerspectiveCamera(31, 1, .01, 50);
  let drawing = views;
  const stats = {};

  function configure(fade = false) {
    drawing = views.filter(v => fields.model.value === "all" || v.id === fields.model.value);
    panels.replaceChildren(...drawing.map(v => {
      const panel = document.createElement("div");
      const title = document.createElement("h2");
      panel.className = "panel";
      title.textContent = labels[v.id];
      panel.append(title);
      return panel;
    }));
    for (const v of views) {
      v.outfit(fields.clothing.checked);
      v.stage.position.y = fields.clothing.checked ? .023 : 0;
      v.skeleton.visible = fields.skeleton.checked;
      v.animate(fields.clip.value, undefined, fade);
    }
    status.textContent = fields.clip.value === "Bind" ? "Rest geometry and skeleton alignment"
      : "Synchronized starts · each animation loops at its authored duration";
  }

  function render() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio, width < 700 ? 1.25 : 1.5);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
    }
    const yaw = { Front: 0, Side: Math.PI / 2, Rear: Math.PI, "¾": .72 }[fields.view.value];
    const night = fields.light.value === "Night";
    const cell = width / drawing.length;
    const aspect = cell / height;
    const [target, frameHeight, pitch] = {
      "Full body": [.92, 2.17, .10], "Close-up": [1.55, .64, .025], Gameplay: [.90, 3.15, .34],
    }[fields.frame.value];
    const widthNeeded = fields.frame.value === "Close-up" ? .43 : fields.clip.value === "Bind" ? 1.9 : .8;
    const effectiveHeight = Math.max(frameHeight, widthNeeded / aspect);
    const distance = effectiveHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(Math.sin(yaw) * distance, target + pitch * distance, Math.cos(yaw) * distance);
    camera.lookAt(0, target, 0);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setScissorTest(true);
    drawing.forEach((v, i) => {
      const x0 = Math.floor(cell * i), x1 = Math.floor(cell * (i + 1));
      renderer.setViewport(x0, 0, x1 - x0, height);
      renderer.setScissor(x0, 0, x1 - x0, height);
      v.scene.background = new THREE.Color(night ? 0x1b1f33 : 0x8a95a6);
      v.scene.environmentIntensity = night ? .07 : .7;
      v.ground.visible = fields.frame.value !== "Close-up";
      v.hemi.color.setHex(night ? 0x2a3555 : 0x9fb6e0);
      v.hemi.groundColor.setHex(night ? 0x0c0b10 : 0x4a3428);
      v.hemi.intensity = night ? .12 : .9;
      v.sun.color.setHex(night ? 0x8fa6ff : 0xffb27a);
      v.sun.intensity = night ? .22 : 2.6;
      v.sun.position.set(-4.5, night ? 14 : 6, 8);
      renderer.toneMappingExposure = night ? 1.35 : 1;
      renderer.render(v.scene, camera);
      stats[v.id] = { ...renderer.info.render };
    });
  }

  let previous = performance.now();
  let manual = false;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(.05, (now - previous) / 1000);
    previous = now;
    if (manual) return;
    for (const view of views) view.mixer.update(dt * Number(fields.speed.value));
    render();
  });
  for (const field of Object.values(fields)) field.addEventListener("change", event => configure(event.target.id === "clip" && Number(fields.speed.value) > 0));
  configure();
  window.pilot = {
    views, stats,
    frame(options, t) {
      manual = true;
      for (const [key, value] of Object.entries(options)) {
        if (fields[key].type === "checkbox") fields[key].checked = value;
        else fields[key].value = value;
      }
      configure();
      for (const view of views) view.animate(fields.clip.value, t, false);
      render();
    },
  };
  render();
}

init().catch(error => { status.textContent = error.message; console.error(error); });
