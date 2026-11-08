import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { FIGURE_HEIGHT } from "./character";
import { boardGltfLoader } from "./models";

/**
 * Rigged character models for named characters on the board. A character
 * listed here replaces the generic capsule figure wherever they stand.
 *
 * Built with Meshy (image-to-image A-pose sheet → image-to-3D Smart Topology →
 * auto-rig). Each rig ships with Meshy's walk and run clips; there is no idle,
 * so a standing character holds the walk cycle's passing pose (feet together,
 * arms down). Future clips (cup, cigar, aiming…) go in `clips` by name.
 *
 * Main characters stand at their spot; they do not wander like crowd figures.
 */
export interface CharacterModel {
  model: string;
  clips: Record<string, string>;
}
export const CHARACTER_MODELS: Record<string, CharacterModel> = {
  mega: {
    model: "assets/models/characters/mega.glb",
    clips: {
      walk: "assets/models/characters/mega-walk.glb",
      run: "assets/models/characters/mega-run.glb",
    },
  },
  // Not in the game data yet: appears once a character with this id exists.
  quanny: {
    model: "assets/models/characters/quanny.glb",
    clips: {
      walk: "assets/models/characters/quanny-walk.glb",
      run: "assets/models/characters/quanny-run.glb",
    },
  },
};

export type Motion = "stand" | string;

/**
 * Characters are small and often backlit on the board, so their materials get
 * a soft rim and a little self-light: they read against the street at any
 * time of day. The renderer sets the rim colour with the lighting.
 */
export const CHARACTER_RIM = {
  color: { value: new THREE.Color("#ffd2a8") },
  strength: { value: 0.35 },
};
function upgradeMaterial(m: THREE.MeshStandardMaterial) {
  if (m.userData.characterLook) return;
  m.userData.characterLook = true;
  if (m.map) {
    m.emissiveMap = m.map;
    m.emissive = new THREE.Color("#ffffff");
    m.emissiveIntensity = 0.1;
  }
  m.roughness = 0.72;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = CHARACTER_RIM.color;
    shader.uniforms.rimStrength = CHARACTER_RIM.strength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += rimColor * rimStrength * pow(rimF, 3.0);`,
      );
  };
  m.customProgramCacheKey = () => "character-rim";
  m.needsUpdate = true;
}

interface Template {
  scene: THREE.Group;
  clips: Record<string, THREE.AnimationClip>;
  standTime: number;
}
const templates = new Map<string, Promise<Template | null>>();

/** A posable instance of a character: put `root` in the scene, call `update`. */
export interface CharacterInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(motion: Motion): void;
  update(dt: number): void;
}

/** Find the walk cycle's passing pose: the moment the feet are closest. */
function passingTime(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip).play();
  const l = scene.getObjectByName("LeftFoot"),
    r = scene.getObjectByName("RightFoot");
  if (!l || !r) return 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3();
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = (clip.duration * i) / 40;
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    const d = l.getWorldPosition(a).distanceTo(r.getWorldPosition(b));
    if (d < bestD) [bestD, best] = [d, t];
  }
  action.stop();
  mixer.uncacheRoot(scene);
  return best;
}

function loadTemplate(id: string): Promise<Template | null> {
  const def = CHARACTER_MODELS[id];
  if (!def) return Promise.resolve(null);
  let p = templates.get(id);
  if (!p) {
    const base = import.meta.env.BASE_URL;
    p = boardGltfLoader()
      .then(async (loader) => {
        const gltf = await loader.loadAsync(`${base}${def.model}`);
        const clips: Record<string, THREE.AnimationClip> = {};
        await Promise.all(
          Object.entries(def.clips).map(async ([name, path]) => {
            const c = await loader.loadAsync(`${base}${path}`);
            if (c.animations[0]) clips[name] = c.animations[0];
          }),
        );
        const scene = gltf.scene;
        const box = new THREE.Box3().setFromObject(scene);
        const h = box.max.y - box.min.y || 1;
        scene.scale.setScalar(FIGURE_HEIGHT / h);
        scene.position.y = -box.min.y * (FIGURE_HEIGHT / h);
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            for (const mat of [m.material].flat())
              if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial)
                upgradeMaterial(mat as THREE.MeshStandardMaterial);
            // Skinned bounds don't follow the pose; never cull a figure.
            m.frustumCulled = false;
          }
        });
        const standTime = clips.walk ? passingTime(scene, clips.walk) : 0;
        return { scene, clips, standTime };
      })
      .catch(() => null);
    templates.set(id, p);
  }
  return p;
}

/**
 * Free one spawned copy: stop its animation and release the GPU data it owns
 * (each clone has its own skeleton, and a skeleton holds a bone texture).
 * Geometry, materials and textures are shared with the template and stay.
 */
export function disposeCharacter(c: CharacterInstance) {
  c.mixer.stopAllAction();
  c.mixer.uncacheRoot(c.mixer.getRoot());
  c.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) m.skeleton.dispose();
  });
  c.root.removeFromParent();
}

export function hasCharacterModel(id: string) {
  return id in CHARACTER_MODELS;
}

/** Load (once) and clone a character, standing. Resolves null on failure. */
export async function spawnCharacter(
  id: string,
): Promise<CharacterInstance | null> {
  const t = await loadTemplate(id);
  if (!t) return null;
  const root = new THREE.Group();
  const body = cloneSkinned(t.scene) as THREE.Group;
  root.add(body);
  root.userData.sharedModel = true;
  const mixer = new THREE.AnimationMixer(body);
  let current: THREE.AnimationAction | null = null;
  const play = (motion: Motion) => {
    const clip = motion === "stand" ? t.clips.walk : t.clips[motion];
    current?.stop();
    if (!clip) return;
    current = mixer.clipAction(clip).reset().play();
    if (motion === "stand") {
      current.time = t.standTime;
      current.paused = true;
    }
    mixer.update(0);
  };
  play("stand");
  const tracked = new Set(
    (t.clips.walk?.tracks ?? [])
      .filter((k) => k.name.endsWith(".quaternion"))
      .map((k) => k.name.split(".")[0]),
  );
  const idle = standingIdle(body, Math.random() * 10, tracked);
  let standing = true;
  return {
    root,
    mixer,
    play: (motion) => {
      standing = motion === "stand";
      play(motion);
    },
    update: (dt) => {
      mixer.update(dt);
      if (standing) idle(dt);
    },
  };
}

/**
 * There is no idle clip yet, so a standing character holds the walk's passing
 * pose and layers small motions on top: breathing, a weight shift, arms
 * relaxed against the body and an occasional look around. Applied after the
 * mixer each frame, in world-space axes, so it works on any Meshy rig.
 */
function standingIdle(
  body: THREE.Object3D,
  phase: number,
  tracked: Set<string>,
) {
  const bones: Record<string, THREE.Bone> = {};
  body.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const q = new THREE.Quaternion(),
    pq = new THREE.Quaternion(),
    axis = new THREE.Vector3(),
    fwd = new THREE.Vector3(),
    side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const turn = (name: string, worldAxis: THREE.Vector3, angle: number) => {
    const b = bones[name];
    if (!b?.parent) return;
    b.parent.getWorldQuaternion(pq);
    axis.copy(worldAxis).applyQuaternion(pq.invert()).normalize();
    b.quaternion.premultiply(q.setFromAxisAngle(axis, angle));
  };
  // Bones the clip doesn't animate are never reset by the mixer: put them
  // back to their pose each frame, or the offsets would pile up.
  const rest = Object.entries(bones)
    .filter(([name]) => !tracked.has(name))
    .map(([, b]) => [b, b.quaternion.clone()] as const);
  let t = phase;
  return (dt: number) => {
    t += dt;
    for (const [b, q0] of rest) b.quaternion.copy(q0);
    body.updateWorldMatrix(true, false);
    body.getWorldDirection(fwd);
    side.crossVectors(up, fwd).normalize();
    const breath = Math.sin(t * 1.7);
    turn("Hips", fwd, 0.035 * Math.sin(t * 0.45));
    turn("Spine01", side, -0.025 * breath);
    turn("Spine02", side, -0.015 * breath);
    turn("Head", up, 0.22 * Math.sin(t * 0.33) * Math.max(0, Math.sin(t * 0.11)));
    turn("LeftArm", fwd, -0.12 - 0.02 * breath);
    turn("RightArm", fwd, 0.12 + 0.02 * breath);
  };
}
