// Draws the player: a rigged model plus idle / walk / run clips, blended by the controller's
// motion and with foot speed matched to ground speed. Swap the character by passing a different
// AvatarSpec; nothing else changes.
import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PlayerView } from "./controller";

export interface AvatarSpec {
  /** Rigged model (GLB). */
  model: string;
  /** In-place clips on the same skeleton. `idle` may be the model's own first clip. */
  clips: { idle?: string; walk: string; run: string };
  /** Standing height in metres; the model is scaled to it. */
  height: number;
  /** Ground speed (m/s) each clip was authored at, to match feet to movement. */
  clipSpeed: { walk: number; run: number };
  /** Replace every material with this colour: marks a stand-in so nobody mistakes it for final art. */
  mannequin?: number;
  /** Extra yaw if the model's forward isn't +Z. */
  yawOffset?: number;
  /**
   * Modular character: a head GLB skinned to the same skeleton, bound to the model's bones by
   * name. The model is measured for `height` with the head on.
   */
  head?: string;
  /** Modular character: a KTX2 base-colour texture that replaces the model's body texture. */
  skin?: string;
}

const PROTAGONIST_DIR = "assets/models/characters/protagonist-male";
/** Heads delivered for the male protagonist, each paired with its body complexion. */
export const PROTAGONIST_MALE_HEADS = ["face-01", "face-02"] as const;
export type ProtagonistHead = (typeof PROTAGONIST_MALE_HEADS)[number];

/**
 * The male protagonist (art/source/hood-hero/protagonist-male, docs/handoff/protagonist-male.md):
 * one headless body with the rig and clips, a swappable head and a matching body complexion.
 * Speeds are the manifest's measured ground speeds.
 */
export function protagonistMale(head: ProtagonistHead = "face-01"): AvatarSpec {
  const model = `${PROTAGONIST_DIR}/protagonist-male.glb`;
  return {
    model,
    clips: { idle: `${model}#Idle`, walk: `${model}#Walk`, run: `${model}#Run` },
    height: 1.78,
    clipSpeed: { walk: 0.79, run: 2.55 },
    head: `${PROTAGONIST_DIR}/heads/${head}.glb`,
    skin: `${PROTAGONIST_DIR}/complexions/${head.replace("face", "complexion")}.ktx2`,
  };
}

/**
 * Former stand-in player avatar, kept for tests and comparisons: the approved Mega rig and its
 * walk/run clips, recoloured as a plain mannequin so it doesn't read as Mega.
 */
export const TEMP_AVATAR: AvatarSpec = {
  model: "assets/models/characters/mega.glb",
  clips: { walk: "assets/models/characters/mega-walk.glb", run: "assets/models/characters/mega-run.glb" },
  height: 1.78,
  clipSpeed: { walk: 1.4, run: 4.0 },
  mannequin: 0x8a8f9c,
};

export class Avatar {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>> = {};
  private current: "idle" | "walk" | "run" | null = null;
  ready: Promise<void>;
  loaded = false;

  constructor(private spec: AvatarSpec, loader: GLTFLoader, url: (p: string) => string) {
    this.root.name = "player-avatar";
    this.ready = this.load(loader, url);
  }

  private async load(loader: GLTFLoader, url: (p: string) => string) {
    const s = this.spec;
    // A clip is either its own file ("x-walk.glb", first animation) or a named animation inside
    // a file ("x.glb#Walk", as the Blender skills route exports). Each file downloads once.
    type Loaded = { animations: THREE.AnimationClip[]; scene: THREE.Group };
    const files = new Map<string, Promise<Loaded>>();
    const file = (path: string) => {
      if (!files.has(path)) files.set(path, loader.loadAsync(url(path)) as Promise<Loaded>);
      return files.get(path)!;
    };
    const pick = async (ref: string | undefined) => {
      if (!ref) return null;
      const [path, name] = ref.split("#");
      const gl = await file(path);
      return { animations: name ? gl.animations.filter((a) => a.name === name) : gl.animations.slice(0, 1) };
    };
    const ktx2 = loader.ktx2Loader;
    const [g, walk, run, idle, headFile, skinTex] = await Promise.all([
      file(s.model), pick(s.clips.walk), pick(s.clips.run), pick(s.clips.idle),
      s.head ? file(s.head) : null,
      s.skin && ktx2 ? ktx2.loadAsync(url(s.skin)) : null,
    ]);
    const model = g.scene;
    if (headFile) this.attachHead(model, headFile.scene);
    if (skinTex) {
      skinTex.flipY = false; // glTF texture convention
      skinTex.colorSpace = THREE.SRGBColorSpace;
      let body: THREE.SkinnedMesh | undefined;
      model.traverse((o) => { if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh && o.name !== "avatar-head") body = o as THREE.SkinnedMesh; });
      const mat = body?.material as THREE.MeshStandardMaterial | undefined;
      if (mat) { mat.map = skinTex; mat.needsUpdate = true; }
    }
    const grey = s.mannequin !== undefined
      ? new THREE.MeshStandardMaterial({ color: s.mannequin, roughness: 0.65, metalness: 0.05 })
      : null;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false; // skinned bounds don't follow the animation
      if (grey) m.material = grey;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.scale.multiplyScalar(s.height / Math.max(0.01, box.max.y - box.min.y));
    model.rotation.y = s.yawOffset ?? 0;
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    const clip = (gl: { animations: THREE.AnimationClip[] } | null) => gl?.animations[0];
    const add = (name: "idle" | "walk" | "run", c: THREE.AnimationClip | undefined) => {
      if (!c) return;
      const a = this.mixer!.clipAction(c);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions[name] = a;
    };
    add("idle", clip(idle) ?? clip(g));
    add("walk", clip(walk));
    add("run", clip(run));
    this.loaded = true;
    this.setState("idle");
    this.actions.idle?.setEffectiveWeight(1);
  }

  /**
   * Put a separately delivered head on the body: its skinned mesh is rebound to the body's own
   * bones (matched by name), so it follows every clip. Both files share one rest skeleton; the
   * delivery checker verifies that (scripts/check-character.mjs).
   */
  private attachHead(model: THREE.Object3D, headScene: THREE.Object3D) {
    const bones = new Map<string, THREE.Bone>();
    let body: THREE.SkinnedMesh | undefined;
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if (!body && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh;
    });
    let head: THREE.SkinnedMesh | undefined;
    headScene.traverse((o) => { if (!head && (o as THREE.SkinnedMesh).isSkinnedMesh) head = o as THREE.SkinnedMesh; });
    if (!body?.parent || !head) return;
    const mapped = head.skeleton.bones.map((b) => bones.get(b.name));
    if (mapped.some((b) => !b)) return; // not the same skeleton: leave the head off rather than tear it
    head.name = "avatar-head";
    body.parent.add(head);
    head.bind(new THREE.Skeleton(mapped as THREE.Bone[], head.skeleton.boneInverses), head.bindMatrix);
  }

  private setState(next: "idle" | "walk" | "run") {
    if (!this.actions[next]) next = "walk";
    this.current = next;
  }

  /** Blend every clip's weight toward the current state (about 0.15 s), so changes never pop. */
  private blend(dt: number) {
    const k = Math.min(1, dt * 7);
    for (const [name, a] of Object.entries(this.actions) as ["idle" | "walk" | "run", THREE.AnimationAction][]) {
      const want = name === this.current ? 1 : 0;
      const w = a.getEffectiveWeight();
      a.setEffectiveWeight(Math.abs(want - w) < 0.01 ? want : w + (want - w) * k);
    }
  }

  /** Follow the controller. Call every frame. */
  update(dt: number, p: PlayerView) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.heading;
    if (!this.mixer) return;
    this.setState(p.motion);
    const s = this.spec.clipSpeed;
    const walk = this.actions.walk, run = this.actions.run;
    // Feet match the ground: scale the clip's playback to the speed actually travelled.
    // The protagonist's clips were authored at 0.79 / 2.55 m/s and the player walks up to 1.6 and
    // runs at 4.2, so playback needs room to speed up or the feet slide.
    if (walk) walk.timeScale = p.motion === "walk" ? THREE.MathUtils.clamp(p.speed / s.walk, 0.5, 2.1) : 1;
    if (run) run.timeScale = p.motion === "run" ? THREE.MathUtils.clamp(p.speed / s.run, 0.7, 1.7) : 1;
    this.blend(dt);
    this.mixer.update(dt);
  }

  /** Which clip is playing (for tests and the debug readout). */
  get state() { return this.current; }
}
