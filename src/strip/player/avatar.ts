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
}

/**
 * TEMPORARY player avatar. The final protagonist is not chosen yet. This borrows the approved
 * Mega rig and its walk/run clips, recoloured as a plain mannequin so it reads as a placeholder,
 * not as Mega (a Southside character).
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
    const g = await file(s.model);
    const [walk, run, idle] = await Promise.all([pick(s.clips.walk), pick(s.clips.run), pick(s.clips.idle)]);
    const model = g.scene;
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
    if (walk) walk.timeScale = p.motion === "walk" ? THREE.MathUtils.clamp(p.speed / s.walk, 0.5, 1.6) : 1;
    if (run) run.timeScale = p.motion === "run" ? THREE.MathUtils.clamp(p.speed / s.run, 0.7, 1.4) : 1;
    this.blend(dt);
    this.mixer.update(dt);
  }

  /** Which clip is playing (for tests and the debug readout). */
  get state() { return this.current; }
}
