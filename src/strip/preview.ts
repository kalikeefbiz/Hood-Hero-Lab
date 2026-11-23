// Reservoir integration preview: the real location API on the five streets, reached through
// the physical anchors. Developer preview only (strip.html). Runs on isolated test state.
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CITY_ANCHORS, anchorById, isInteractive, type CityAnchor } from "./anchors";
import { WALLS } from "./cityMap";
import { STREETS } from "./layout";
import type { PreviewSession, PresenceSource } from "./previewSession";
import { PlacePanel } from "./placePanel";
import { Pins } from "./pins";

export interface PreviewHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /**
   * "select": developer location selector. Tapping a pin or a Places entry stands you there on
   * the test campaign; the camera flies over. Needs `controls`.
   * "walk": the player controller owns position. Pins only point the way; you use a place by
   * walking up to it (walk.ts calls `use`).
   */
  mode: "select" | "walk";
  controls?: OrbitControls;
  /** The test campaign. */
  session: PreviewSession;
  /** Who is where (Gemini's simulation via living.ts). */
  presence: PresenceSource;
}

export const streetOf = (a: CityAnchor) =>
  a.street ?? [...STREETS].sort((p, q) => Math.abs(p.z - a.z) - Math.abs(q.z - a.z))[0].name;

export function startPreview(host: PreviewHost) {
  const { scene, camera, canvas, mode } = host;
  const controls = host.controls;
  const { session, presence } = host;
  const pins = new Pins(CITY_ANCHORS);
  scene.add(pins.group);

  const panel = new PlacePanel({
    session,
    peopleAt: (id) => presence.peopleAt(id),
    onClose: () => pins.select(null),
  });

  // ------------------------------------------------------------ camera flights
  let flight: { start: number; t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromE: THREE.Vector3; toE: THREE.Vector3 } | null = null;
  function flyTo(a: CityAnchor) {
    if (!controls) return;
    // Frame the building the door belongs to: the nearest footprint sets how far back to stand.
    let size = 8;
    let best = 6;
    let cx = a.x - Math.sin(a.facing) * 3, cz = a.z - Math.cos(a.facing) * 3;
    for (const w of WALLS) {
      const dx = Math.max(w.x0 - a.x, 0, a.x - w.x1), dz = Math.max(w.z0 - a.z, 0, a.z - w.z1);
      const d = Math.hypot(dx, dz);
      if (d < best) { best = d; size = Math.max(w.x1 - w.x0, w.z1 - w.z0); cx = (w.x0 + w.x1) / 2; cz = (w.z0 + w.z1) / 2; }
    }
    const dist = THREE.MathUtils.clamp(size * 1.15, 9, 26);
    // Aim between the door and the middle of its building.
    const toT = new THREE.Vector3((a.x + cx) / 2, Math.min(2 + size * 0.22, 7), (a.z + cz) / 2);
    // Stand back out in the street, in front of the door, a little to the side.
    const f = a.facing + 0.3;
    const toE = new THREE.Vector3(a.x + Math.sin(f) * dist, 2.6 + dist * 0.28, a.z + Math.cos(f) * dist);
    flight = { start: performance.now(), t: 0, fromT: controls!.target.clone(), toT, fromE: camera.position.clone(), toE };
  }

  // ------------------------------------------------------------ selecting
  const placeOf = (a: CityAnchor) => (a.kind === "npc" && a.locationId ? anchorById(a.locationId) ?? a : a);

  /** Open a place's card. In walk mode this is only reached by physically arriving there. */
  function use(a: CityAnchor) {
    // An NPC's spot opens the place it belongs to.
    const target = placeOf(a);
    pins.select(target.id);
    let note: string | undefined;
    if (isInteractive(target)) {
      const before = session.placeId;
      if (!session.arrive(target))
        note = `Still at ${before}: the engine won't move you yet. Finish what's open where you are.`;
    }
    panel.show(target, note);
  }

  function select(a: CityAnchor) {
    if (mode === "walk") {
      // No teleporting: a pin tells you where it is and lights up so you can walk to it.
      const target = placeOf(a);
      pins.select(target.id);
      toast(`${target.label}: walk up to it to go in.`);
      return;
    }
    flyTo(placeOf(a));
    use(a);
  }

  const toastEl = document.createElement("p");
  toastEl.className = "toast";
  toastEl.hidden = true;
  document.body.append(toastEl);
  let toastTimer = 0;
  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // Tap (not drag) on a pin.
  let down: { x: number; y: number; t: number; id: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  canvas.addEventListener("pointerup", (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 10 || !quick) return;
    const r = canvas.getBoundingClientRect();
    const hit = pins.pick(e.clientX - r.left, e.clientY - r.top, camera, r.width, r.height);
    if (hit) select(hit);
  });

  // ------------------------------------------------------------ place list (dev selector)
  const listBtn = document.querySelector<HTMLButtonElement>("#places")!;
  const sheet = document.createElement("section");
  sheet.className = "places";
  sheet.hidden = true;
  const head = document.createElement("header");
  head.innerHTML = `<div class="titles"><h2>Places</h2><small>Developer selector · test state, never saved</small></div>`;
  const close = document.createElement("button");
  close.className = "close"; close.type = "button"; close.textContent = "✕"; close.setAttribute("aria-label", "Close");
  close.onclick = () => { sheet.hidden = true; };
  head.append(close);
  sheet.append(head);
  const byStreet = new Map<string, CityAnchor[]>();
  for (const a of CITY_ANCHORS) {
    if (a.kind === "npc" || a.kind === "gathering") continue;
    const s = streetOf(a);
    if (!byStreet.has(s)) byStreet.set(s, []);
    byStreet.get(s)!.push(a);
  }
  const order = { place: 0, home: 1, storefront: 2 } as Record<string, number>;
  for (const st of STREETS) {
    const list = byStreet.get(st.name);
    if (!list) continue;
    const h = document.createElement("h3");
    h.textContent = st.name;
    sheet.append(h);
    for (const a of list.sort((p, q) => order[p.kind] - order[q.kind])) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `pick k-${a.kind}${a.household ? " k-household" : ""}${a.targetId ? " k-lead" : ""}`;
      b.dataset.anchor = a.id;
      b.innerHTML = `<span></span>`;
      b.firstElementChild!.textContent = a.label;
      const tag = document.createElement("small");
      tag.textContent = a.kind === "place" ? a.locationId! : a.kind === "storefront" ? "scenery" : a.id;
      b.append(tag);
      b.onclick = () => { sheet.hidden = true; select(a); };
      sheet.append(b);
    }
  }
  document.body.append(sheet);
  listBtn.onclick = () => { panel.open && panel.hide(); sheet.hidden = !sheet.hidden; };
  listBtn.hidden = mode !== "select";

  // ------------------------------------------------------------ per frame
  const ease = (t: number) => t * t * (3 - 2 * t);
  // While a sheet is open, shift the picture up so the selected building sits above the sheet.
  let lift = 0;
  function update(dt: number) {
    const want = panel.open || !sheet.hidden ? 0.24 : 0;
    if (Math.abs(lift - want) > 0.001) {
      lift += (want - lift) * Math.min(1, dt * 8);
      if (Math.abs(lift - want) < 0.002) lift = want;
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      if (lift === 0) camera.clearViewOffset();
      else camera.setViewOffset(w, h, 0, lift * h, w, h);
    }
    if (flight) {
      // Wall-clock, so a slow frame rate shortens the flight instead of stretching it.
      flight.t = Math.min(1, (performance.now() - flight.start) / 700);
      const k = ease(flight.t);
      controls!.target.lerpVectors(flight.fromT, flight.toT, k);
      camera.position.lerpVectors(flight.fromE, flight.toE, k);
      if (flight.t >= 1) flight = null;
    }
    pins.update(camera, focus(), canvas.clientHeight || innerHeight);
    // People come and go: re-show the card when who is here changes (at most twice a second).
    presenceCheck += dt;
    if (presenceCheck > 0.5 && panel.open && panel.current?.locationId) {
      presenceCheck = 0;
      if (presence.peopleAt(panel.current.locationId).join(",") !== panel.shownPeople) panel.refresh();
    }
  }
  let presenceCheck = 0;
  let focusFn: () => THREE.Vector3 = () => controls!.target;
  const focus = () => focusFn();
  // Any manual drag cancels a flight in progress.
  controls?.addEventListener("start", () => { flight = null; });

  const api = {
    mode, session, pins, panel, use, toast,
    /** Where pins measure "near" from (the player in walk mode, the orbit target otherwise). */
    setFocus: (fn: () => THREE.Vector3) => { focusFn = fn; },
    select: (id: string) => { const a = anchorById(id); if (a) select(a); },
    screenOf: (id: string) => pins.screenOf(id, camera, canvas.clientWidth, canvas.clientHeight),
    flying: () => flight !== null,
  };
  return { update, api };
}
