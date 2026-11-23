// Walk mode: the temporary avatar on the five streets, driven by the touch stick (or WASD),
// colliding with the map, followed by the camera. Walking up to a door or a person offers it;
// tapping the offer opens the same engine-backed card as the developer selector, after the
// engine's normal arrival at that location (on the test campaign).
import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLAYER_START, NPC_SPOTS } from "./cityMap";
import { isInteractive, type CityAnchor } from "./anchors";
import { PlayerController } from "./player/controller";
import { MAP_SOLIDS } from "./player/collision";
import { Avatar, TEMP_AVATAR, type AvatarSpec } from "./player/avatar";
import { FollowCamera } from "./player/followCamera";
import type { startPreview } from "./preview";

type PreviewApi = ReturnType<typeof startPreview>["api"];

export interface WalkHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  loader: GLTFLoader;
  url: (p: string) => string;
  preview: PreviewApi;
  avatar?: AvatarSpec;
}

export function startWalk(host: WalkHost) {
  const { scene, camera, canvas, preview } = host;
  // People at their spots are solid, so you walk around them, not through them.
  const solids = { ...MAP_SOLIDS, circles: NPC_SPOTS.map((n) => ({ x: n.x, z: n.z, r: 0.3 })) };
  const player = new PlayerController({ x: PLAYER_START.x, z: PLAYER_START.z, heading: PLAYER_START.rotY, solids });
  const avatar = new Avatar(host.avatar ?? TEMP_AVATAR, host.loader, host.url);
  scene.add(avatar.root);
  const cam = new FollowCamera(camera, canvas, PLAYER_START.rotY);
  const focus = new THREE.Vector3();
  preview.setFocus(() => focus.set(player.x, 0, player.z));

  // ------------------------------------------------------------ input: touch stick + keys
  const pad = document.querySelector<HTMLElement>("#pad")!;
  const knob = pad.querySelector<HTMLElement>(".knob")!;
  const stick = { x: 0, y: 0 };
  let padId: number | null = null;
  function padMove(e: PointerEvent) {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.min(max, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
    // Screen up is forward.
    stick.x = (Math.cos(a) * len) / max;
    stick.y = -(Math.sin(a) * len) / max;
    pad.classList.toggle("run", len / max >= player.runAt);
  }
  pad.addEventListener("pointerdown", (e) => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); padMove(e); e.stopPropagation(); e.preventDefault(); });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === padId) padMove(e); });
  const padEnd = (e: PointerEvent) => {
    if (e.pointerId !== padId) return;
    padId = null; stick.x = stick.y = 0; knob.style.transform = ""; pad.classList.remove("run");
  };
  pad.addEventListener("pointerup", padEnd);
  pad.addEventListener("pointercancel", padEnd);
  const keys = new Set<string>();
  addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());

  // ------------------------------------------------------------ the "use it" prompt
  const prompt = document.createElement("button");
  prompt.id = "prompt";
  prompt.type = "button";
  prompt.hidden = true;
  document.body.append(prompt);
  let offered: CityAnchor | null = null;
  const nameOf = (a: CityAnchor) =>
    a.kind === "npc" ? preview.session.state.characters[a.characterId!]?.name ?? a.label : a.label.split(" · ").pop()!;
  function offer() {
    // People first (you walked up to someone), then doors. Scenery storefronts say what they are.
    const near = player.nearby;
    const pick = near.find((a) => a.kind === "npc") ?? near.find(isInteractive) ?? near.find((a) => a.kind === "storefront") ?? null;
    if (pick?.id === offered?.id) return;
    offered = pick;
    if (!pick) { prompt.hidden = true; return; }
    prompt.dataset.anchor = pick.id;
    prompt.textContent = pick.kind === "npc" ? `Talk to ${nameOf(pick)}` : pick.kind === "storefront" ? `${pick.label} · look` : `Go in · ${nameOf(pick)}`;
    prompt.hidden = false;
  }
  prompt.onclick = () => { if (offered) preview.use(offered); };
  // Walking away from a place closes its card.
  player.onLeave((a) => {
    const open = preview.panel.current;
    if (!open) return;
    const stillNear = player.nearby.some((n) => n.id === open.id || (n.kind === "npc" && n.locationId === open.id));
    if (!stillNear && (a.id === open.id || a.locationId === open.id)) preview.panel.hide();
  });

  document.body.classList.add("walking");

  function update(dt: number) {
    const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const ky = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const kLen = Math.hypot(kx, ky) || 1;
    const x = kx ? (kx / kLen) * 0.7 : stick.x, y = ky ? (ky / kLen) * 0.7 : stick.y;
    player.update(dt, { x, y, cameraYaw: cam.groundYaw, run: keys.has("shift") });
    avatar.update(dt, player);
    cam.update(dt, player);
    offer();
  }

  return {
    update,
    /** Live player position for things that follow it (the sun's shadow box). */
    focus: () => focus.set(player.x, 0, player.z),
    api: {
      /** Read-only player state: position, heading, speed, motion, nearby anchors. */
      player: () => player.view(),
      avatarState: () => avatar.state,
      avatarLoaded: () => avatar.loaded,
      offered: () => offered?.id ?? null,
      camera: () => ({ yaw: cam.yaw, distance: cam.distance, shown: cam.shown, x: camera.position.x, y: camera.position.y, z: camera.position.z }),
      onArrive: (fn: (a: CityAnchor) => void) => player.onArrive(fn),
      onLeave: (fn: (a: CityAnchor) => void) => player.onLeave(fn),
    },
  };
}
