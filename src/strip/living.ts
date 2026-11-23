// The living Reservoir: Gemini's NPC simulation (src/sim) running on Claude's authored nav map,
// drawn in the strip scene through Gemini's AvatarAdapter. This file only connects things:
// it makes no NPC decisions. Positions, facing, locomotion, activities and presence all come
// from LivingBlockSim.
import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LivingBlockSim, createReservoirNpcProfiles } from "../sim";
import { AvatarAdapter, resolveAvatarAssets, type AvatarAssetDescriptor, type AvatarPose } from "../render/AvatarAdapter";
import type { GameState } from "../core/GameState";
import { RESERVOIR_NAV_MAP } from "./navMap";
import { Avatar, type AvatarSpec } from "./player/avatar";
import type { PresenceSource } from "./previewSession";
import type { Motion } from "./player/controller";

/** Draw settings for an approved rig named by the sim's AvatarAdapter (src/render/AvatarAdapter.ts). */
function specFor(assets: AvatarAssetDescriptor): AvatarSpec | null {
  if (!assets.usesApprovedModel || !assets.modelUrl || !assets.clips.walk || !assets.clips.run) return null;
  return {
    model: assets.modelUrl,
    clips: { idle: assets.clips.idle, walk: assets.clips.walk, run: assets.clips.run },
    height: assets.heightM ?? 1.8,
    clipSpeed: assets.clipSpeedMps ?? { walk: 1.4, run: 3.6 },
  };
}

const motionOf = (p: AvatarPose): Motion => (p.clip === "run" ? "run" : p.clip === "walk" ? "walk" : "idle");

/** A plain stand-in person for NPCs without an approved model: clearly not final art. */
class PlaceholderPerson {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private t = 0;
  constructor(color: string) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0x8a8f9c), 0.45), roughness: 0.75 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), mat);
    this.body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
    head.position.y = 1.58;
    // A small nose so you can read which way they face.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), mat);
    nose.position.set(0, 1.58, 0.15);
    for (const m of [this.body, head, nose]) { m.castShadow = true; this.root.add(m); }
  }
  update(dt: number, p: { x: number; z: number; heading: number; motion: Motion; speed: number }) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.heading;
    // Walking reads as a gentle bob; idle stands still. No fake limb animation.
    this.t += dt * (p.motion === "idle" ? 0 : 6 + p.speed * 2);
    this.root.position.y = p.motion === "idle" ? 0 : Math.abs(Math.sin(this.t)) * 0.05;
  }
}

/** Name tag over an NPC's head, shown when the player is close. */
function nameTag(text: string, canonical: boolean) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "600 26px system-ui, sans-serif";
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 28;
  c.height = 44;
  g.font = font;
  g.fillStyle = canonical ? "rgba(12,13,17,0.82)" : "rgba(40,36,60,0.82)";
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 20); g.fill();
  g.fillStyle = "#f4f2ec"; g.textBaseline = "middle"; g.textAlign = "center";
  g.fillText(text, c.width / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, transparent: true }));
  s.renderOrder = 997;
  s.userData.aspect = c.width / c.height;
  return s;
}

export interface LivingHost {
  scene: THREE.Scene;
  loader: GLTFLoader;
  url: (p: string) => string;
  /** The test campaign the sim reads character records and the day from. */
  state: () => GameState;
  /** Game minutes per real second. The sim's default (0.5) makes an hour take two minutes. */
  minutesPerSecond?: number;
}

export function startLiving(host: LivingHost) {
  const engineState = host.state();
  const sim = new LivingBlockSim({
    navMap: RESERVOIR_NAV_MAP,
    engineState,
    // A character with an approved model moves at the speed its walk and run were animated for,
    // so feet don't slide. Everyone else keeps the simulation's own speeds.
    profiles: createReservoirNpcProfiles(engineState).map((p) => {
      const s = resolveAvatarAssets(p.modelId ?? p.id).clipSpeedMps;
      return s ? { ...p, walkSpeed: s.walk, runSpeed: s.run } : p;
    }),
    simMinutesPerSecond: host.minutesPerSecond ?? 3,
  });
  const adapter = new AvatarAdapter();
  const figures = new Map<string, { draw: Avatar | PlaceholderPerson; tag: THREE.Sprite }>();
  const characters = () => host.state().characters;

  for (const npc of sim.getNpcs()) {
    const profile = sim.profiles.get(npc.id)!;
    const spec = specFor(resolveAvatarAssets(profile.modelId ?? npc.id));
    const draw = spec ? new Avatar(spec, host.loader, host.url) : new PlaceholderPerson(profile.accentColor);
    draw.root.name = `npc:${npc.id}`;
    const tag = nameTag(npc.isCanonical ? npc.displayName : `${npc.displayName} (test)`, npc.isCanonical);
    host.scene.add(draw.root, tag);
    figures.set(npc.id, { draw, tag });
  }

  /** Live presence for Codex's location API: canonical engine characters the sim has at a place. */
  const presence: PresenceSource = {
    peopleAt: (locationId) =>
      sim.peopleHere(locationId).map((p) => p.characterId).filter((id) => id in characters()),
  };

  let lastDay = engineState.day;
  const tmp = new THREE.Vector3();
  function update(dt: number, player: { x: number; z: number }, camera: THREE.PerspectiveCamera) {
    const day = host.state().day;
    if (day !== lastDay) { sim.syncEngineDay(day); lastDay = day; }
    sim.setPlayerContext({ x: player.x, z: player.z });
    // Full-rate simulation while any NPC is near enough to be seen; 1 Hz in the background.
    let nearest = Infinity;
    for (const n of sim.getNpcs()) nearest = Math.min(nearest, Math.hypot(n.x - player.x, n.z - player.z));
    sim.setCameraInArea(nearest < 60);
    const alpha = sim.update(dt);
    const poses = adapter.sync(sim, alpha);
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (innerHeight || 800);
    for (const p of poses) {
      const f = figures.get(p.id);
      if (!f) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      const visible = d < 70;
      f.draw.root.visible = visible;
      if (visible) f.draw.update(dt, { x: p.x, z: p.z, heading: p.facing, speed: p.speed, motion: motionOf(p), nearby: [] });
      f.tag.visible = d < 14;
      if (f.tag.visible) {
        f.tag.position.copy(tmp.set(p.x, 2.15, p.z));
        const h = 22 * unitsPerPx;
        f.tag.scale.set(h * f.tag.userData.aspect, h, 1);
      }
    }
  }

  /** Engine characters within reach of the player, nearest first, with where the sim has them. */
  function peopleNear(x: number, z: number, radius = 1.9) {
    return sim
      .peopleNear(x, z, radius)
      .filter((p) => p.isCanonical && p.characterId in characters())
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  return { sim, presence, update, peopleNear, figures };
}
