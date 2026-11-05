import * as THREE from "three";
import type { FactionId, ZoneId } from "../core/GameState";
import {
  ALL_BLOCKS,
  AVENUES_X,
  AVENUES_Z,
  BOARD,
  DISTRICTS,
  RIVER_WIDTH,
  ZONE_ORDER,
  blockAt,
  blockById,
  districtCenter,
  districtGrid,
  distanceToPath,
  locationBlock,
  locationPosition,
  riverPath,
  buildable,
  RAIL_DECK,
  RAIL_LINES,
  RAIL_STATIONS,
  distanceToRail,
  walkRoute,
  lotBlocks,
  type BlockDef,
  type RailLine,
  type RailStation,
} from "../city3d/layout";
import { LOCATIONS, type LocationDef } from "./locations";
import {
  buildLocation,
  developmentLot,
  DISTRICT_STYLE,
  fillBlock,
  waterfront,
  type Rect,
} from "./archetypes";
import {
  Geo,
  box,
  col,
  hash,
  kit,
  onWall,
  pick,
  placed,
  rng,
  CURB,
  type Kit,
  type V3,
  type WallSlot,
} from "./geo";
import { facadeTextures, radialTexture, SignAtlas } from "./textures";
import type { BoardView } from "./viewModel";
import { buildFigure, loadFigureModel } from "./character";
import {
  hasCharacterModel,
  spawnCharacter,
  type CharacterInstance,
  type Motion,
} from "./characterModels";
import { DEFAULT_APPEARANCE, type Appearance } from "./presence";
import {
  MODEL_FILES,
  asVehicle,
  loadModelPiece,
  sharedModelGeometry,
  sharedModelMaterial,
  type ModelPiece,
  useModelRenderer,
} from "./models";
import {
  SET_PIECES,
  MAX_HEIGHT,
  TINTED,
  planSetPieces,
  type SetPiecePlacement,
} from "./setPieces";

export type TimeOfDay = "dusk" | "night" | "day";
export type Lens = "streets" | "influence" | "police" | "opportunity";
export interface Focus {
  zone: ZoneId | null;
  block: string | null;
  place: string | null;
}
export interface PickResult extends Focus {}
export interface OverlayAnchor {
  key: string;
  element: HTMLElement;
  position: THREE.Vector3;
  maxDistance?: number;
  minDistance?: number;
  /** Pixels the element extends above its anchor (kept clear of the HUD). */
  clearance?: number;
}
type Lit = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

const TIMES: Record<
  TimeOfDay,
  {
    top: string;
    horizon: string;
    sun: string;
    sunIntensity: number;
    sunDir: V3;
    hemiSky: string;
    hemiGround: string;
    hemi: number;
    fog: string;
    windows: number;
    signs: number;
    lamps: number;
    exposure: number;
  }
> = {
  dusk: {
    top: "#2a2350",
    horizon: "#f2925a",
    sun: "#ffb27a",
    sunIntensity: 3.4,
    sunDir: [-0.72, 0.46, -0.52],
    hemiSky: "#c39ac0",
    hemiGround: "#5a4038",
    hemi: 1.7,
    fog: "#b07a78",
    windows: 1,
    signs: 0.35,
    lamps: 0.8,
    exposure: 1.3,
  },
  night: {
    top: "#05070f",
    horizon: "#1f2848",
    sun: "#9fb4e6",
    sunIntensity: 0.9,
    sunDir: [0.45, 0.6, -0.4],
    hemiSky: "#4a5a8a",
    hemiGround: "#16141c",
    hemi: 0.9,
    fog: "#1a2238",
    windows: 1.8,
    signs: 0.75,
    lamps: 1,
    exposure: 1.3,
  },
  day: {
    top: "#5d8fcf",
    horizon: "#dfe6ea",
    sun: "#fff1dc",
    sunIntensity: 3,
    sunDir: [-0.4, 0.82, 0.35],
    hemiSky: "#c3d8ef",
    hemiGround: "#5c5a50",
    hemi: 1.6,
    fog: "#c3ced6",
    windows: 0.05,
    signs: 0,
    lamps: 0,
    exposure: 1,
  },
};

const TAGS: Record<
  FactionId,
  { text: string; color: string; crown: boolean; cloth: [string, string] }
> = {
  backstreet: {
    text: "BS",
    color: "#e0303a",
    crown: true,
    cloth: ["#c83d45", "#f0e6d8"],
  },
  blocks: {
    text: "BB",
    color: "#3f86e0",
    crown: true,
    cloth: ["#3678c6", "#e8eefc"],
  },
  angels: {
    text: "GA",
    color: "#f0c43a",
    crown: true,
    cloth: ["#e9be39", "#f5f1e6"],
  },
  blips: {
    text: "BLIP GANG",
    color: "#a35ee8",
    crown: false,
    cloth: ["#8e51cb", "#d8c8f0"],
  },
  muds: {
    text: "MUDGANG",
    color: "#e8892f",
    crown: false,
    cloth: ["#cd7935", "#80513c"],
  },
};

/** Camera distance for each level of the board. */
export const LEVEL_DISTANCE = {
  city: 330,
  district: 135,
  block: 52,
  place: 40,
};

interface Mover {
  path: [number, number][];
  lengths: number[];
  total: number;
  t: number;
  speed: number;
}
function loop(path: [number, number][]) {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const [ax, az] = path[i],
      [bx, bz] = path[(i + 1) % path.length];
    const l = Math.hypot(bx - ax, bz - az);
    lengths.push(l);
    total += l;
  }
  return { path, lengths, total };
}
function sample(m: Mover, out: { x: number; z: number; heading: number }) {
  let d = ((m.t % m.total) + m.total) % m.total;
  for (let i = 0; i < m.path.length; i++) {
    if (d <= m.lengths[i]) {
      const [ax, az] = m.path[i],
        [bx, bz] = m.path[(i + 1) % m.path.length];
      const f = m.lengths[i] ? d / m.lengths[i] : 0;
      out.x = ax + (bx - ax) * f;
      out.z = az + (bz - az) * f;
      out.heading = Math.atan2(-(bz - az), bx - ax);
      return out;
    }
    d -= m.lengths[i];
  }
  return out;
}
const rectLoop = (
  a: number,
  b: number,
  c: number,
  d: number,
): [number, number][] => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
];

/** Length of a board car (the procedural box car and every GLB vehicle). */
const CAR_LENGTH = 1.5;
function isSoftwareRenderer(r: THREE.WebGLRenderer) {
  try {
    const gl = r.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(
      info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    );
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}
export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class BoardRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 1, 1400);
  onPick: (r: PickResult) => void = () => {};
  onInteract: () => void = () => {};
  onLevel: (distance: number) => void = () => {};

  private host!: HTMLElement;
  private lite = false;
  private reducedMotion = false;
  private river = riverPath();
  private textures = facadeTextures();
  private glowTex = radialTexture();
  private atlas = new SignAtlas();
  private facadeMat!: Lit;
  private plainMat!: Lit;
  private groundMat!: Lit;
  private waterMat!: Lit;
  private signMat!: Lit;
  private tagMat!: Lit;
  private glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
  private lampPoolMat = new THREE.MeshBasicMaterial({
    map: this.glowTex,
    color: "#ffb36b",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private lampHeadMat = new THREE.MeshBasicMaterial({
    color: "#ffd9a0",
    toneMapped: false,
  });
  private sun = new THREE.DirectionalLight("#ffffff", 2);
  private hemi = new THREE.HemisphereLight("#ffffff", "#333333", 1);
  private sky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private placePickers: THREE.Mesh[] = [];
  private walls = new Map<string, WallSlot[]>();
  private roofs = new Map<string, V3[]>();
  private streets = Object.fromEntries(
    ZONE_ORDER.map((z) => [z, districtGrid(z)]),
  ) as Record<ZoneId, ReturnType<typeof districtGrid>>;
  private dynamic = new THREE.Group();
  // Player piece and people on the board.
  private token = new THREE.Group();
  private tokenRing!: THREE.MeshBasicMaterial;
  private tokenWalk: {
    path: [number, number][];
    t: number;
    total: number;
    done: () => void;
  } | null = null;
  private figures = new THREE.Group();
  private tokenBody = new THREE.Group();
  private appearanceKey = "";
  private focusLayer = new THREE.Group();
  private animated: ((t: number, dt: number) => void)[] = [];
  private dynamicAnimated: ((t: number, dt: number) => void)[] = [];
  private focusAnimated: ((t: number, dt: number) => void)[] = [];
  private overlays: OverlayAnchor[] = [];
  private view: BoardView | null = null;
  private focus: Focus = { zone: null, block: null, place: null };
  private lens: Lens = "streets";
  private time: TimeOfDay = "dusk";
  private timeApplied = false;

  private target = new THREE.Vector3(0, 0, 12);
  private distance = LEVEL_DISTANCE.city;
  private yaw = 0;
  private insets = { top: 0, bottom: 0 };
  private flight: {
    from: { x: number; z: number; d: number; yaw: number };
    to: { x: number; z: number; d: number; yaw: number };
    t: number;
  } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: {
    moved: number;
    start: number;
    pinch?: { dist: number; angle: number; distance: number; yaw: number };
    groundStart?: THREE.Vector3;
  } | null = null;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private frame = 0;
  private running = false;
  private visible = true;
  private lastFrame = 0;
  private lastActive = 0;
  private clock = 0;
  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private lastLevelDistance = -1;

  private static instance: BoardRenderer | null = null;
  /** One city per page; leaving the board detaches it instead of destroying it. */
  static acquire(host: HTMLElement) {
    if (!BoardRenderer.instance || BoardRenderer.instance.disposed)
      BoardRenderer.instance = new BoardRenderer(host);
    else BoardRenderer.instance.attach(host);
    return BoardRenderer.instance;
  }

  private constructor(host: HTMLElement) {
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer = new THREE.WebGLRenderer({
      antialias: dpr < 1.5,
      powerPreference: "high-performance",
    });
    // `?fullgl` forces the full board on software GL (screenshots, checks).
    this.lite =
      isSoftwareRenderer(this.renderer) &&
      !new URLSearchParams(location.search).has("fullgl");
    useModelRenderer(this.renderer);
    this.reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (this.lite) dpr = 1;
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !this.lite;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    const el = this.renderer.domElement;
    el.className = "board-canvas";
    el.setAttribute("aria-hidden", "true");
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.makeMaterials();
    this.makeSky();
    // Haze only at the far edge of the city: atmosphere, not a cutoff.
    this.scene.fog = new THREE.Fog("#000", 320, 900);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -205;
    sc.right = sc.top = 205;
    sc.near = 10;
    sc.far = 700;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    const t0 = performance.now();
    this.build();
    const w = window as unknown as {
      __stixxBuildMs?: number;
      __stixxBoard?: BoardRenderer;
    };
    w.__stixxBuildMs = performance.now() - t0;
    // Exposed for the inspect-runtime workflow and automated checks.
    w.__stixxBoard = this;
    this.scene.add(this.dynamic, this.focusLayer, this.figures);
    this.buildToken();
    this.setTimeOfDay("dusk");
    this.bindInput(el);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.attach(host);
  }

  // ---- lifecycle -------------------------------------------------------------
  attach(host: HTMLElement) {
    this.host = host;
    host.prepend(this.renderer.domElement);
    this.resizeObserver?.disconnect();
    this.observer?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.observer = new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        if (this.visible) this.start();
      },
      { threshold: 0.01 },
    );
    this.observer.observe(host);
    this.visible = true;
    this.resize();
    this.wake();
  }
  detach() {
    this.finishWalk(true);
    cancelAnimationFrame(this.frame);
    this.running = false;
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.overlays = [];
    this.pointers.clear();
    this.gesture = null;
    this.renderer.domElement.remove();
    this.onPick = () => {};
    this.onInteract = () => {};
    this.onLevel = () => {};
  }

  // ---- public API --------------------------------------------------------------
  setView(view: BoardView) {
    this.view = view;
    this.rebuildDynamic();
    this.wake();
  }
  setLens(lens: Lens) {
    if (lens === this.lens) return;
    this.lens = lens;
    this.rebuildDynamic();
    this.wake();
  }
  /** Move the camera to a level of the board and highlight what's selected. */
  setFocus(focus: Focus, fly = true) {
    const prev = this.focus;
    this.focus = { ...focus };
    this.rebuildFocus();
    if (this.view && prev.zone !== focus.zone) this.rebuildDynamic();
    if (fly) {
      const place = focus.place
        ? LOCATIONS.find((l) => l.id === focus.place)
        : null;
      const block = focus.block ? blockById(focus.block) : null;
      if (place) {
        const [x, z] = locationPosition(place);
        this.flyTo(
          x,
          z + 2,
          LEVEL_DISTANCE.place * (this.camera.aspect < 1 ? 1.2 : 1),
        );
      } else if (block) {
        this.flyTo(
          (block.minX + block.maxX) / 2,
          (block.minZ + block.maxZ) / 2 + 2,
          LEVEL_DISTANCE.block * (this.camera.aspect < 1 ? 1.25 : 1),
        );
      } else if (focus.zone) {
        const [x, z] = districtCenter(focus.zone);
        // Portrait phones need more distance to frame a whole district.
        const portrait = this.camera.aspect < 1 ? 1.35 : 1;
        this.flyTo(
          x,
          z + 6,
          (focus.zone === "downtown" ? 125 : LEVEL_DISTANCE.district) * portrait,
        );
      } else this.flyTo(0, 0, LEVEL_DISTANCE.city, 0);
    }
    this.wake();
  }
  /** Reserve screen space for HUD and sheet so the focus stays visible. */
  setInsets(top: number, bottom: number) {
    if (
      Math.abs(top - this.insets.top) < 1 &&
      Math.abs(bottom - this.insets.bottom) < 1
    )
      return;
    this.insets = { top, bottom };
    this.applyViewOffset();
    this.wake();
  }
  setTimeOfDay(time: TimeOfDay) {
    if (this.timeApplied && time === this.time) return;
    this.timeApplied = true;
    this.time = time;
    const t = TIMES[time];
    const u = this.sky.material.uniforms;
    (u.top.value as THREE.Color).set(t.top);
    (u.horizon.value as THREE.Color).set(t.horizon);
    (u.sunColor.value as THREE.Color).set(t.sun);
    (u.sunDir.value as THREE.Vector3).set(...t.sunDir).normalize();
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.sun.position
      .set(...t.sunDir)
      .normalize()
      .multiplyScalar(340);
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    // Lambert shading without environment light needs extra fill.
    this.hemi.intensity = t.hemi * (this.lite ? 1.45 : 1);
    (this.scene.fog as THREE.Fog).color.set(t.fog);
    this.facadeMat.emissiveIntensity = t.windows;
    this.signMat.emissiveIntensity = t.signs;
    this.tagMat.emissiveIntensity = t.signs * 0.4;
    this.glowMat.color.setScalar(time === "day" ? 0.55 : 1);
    this.lampPoolMat.opacity = 0.55 * t.lamps;
    this.lampHeadMat.color.set(t.lamps ? "#ffd9a0" : "#8c8a84");
    this.renderer.toneMappingExposure = t.exposure;
    if (!this.lite) {
      const envScene = new THREE.Scene();
      envScene.add(this.sky.clone());
      this.envTarget?.dispose();
      this.envTarget = this.pmrem.fromScene(envScene, 0.04);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = time === "night" ? 0.5 : 0.85;
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.wake();
  }
  /** Where a place's front door is: the piece and people stand here. */
  static frontOf(placeId: string): [number, number] {
    const l = LOCATIONS.find((l) => l.id === placeId)!;
    const [x, z] = locationPosition(l);
    const b = locationBlock(l);
    return [x, b && !b.waterfront ? b.maxZ + 1.3 : z + 3];
  }
  /**
   * End the current walk now and settle its promise. The UI locks input while
   * a walk is pending, so a walk must never be dropped unsettled: not when
   * the piece is re-placed, a new walk starts, the board pauses or detaches.
   */
  private finishWalk(snap: boolean) {
    const w = this.tokenWalk;
    if (!w) return;
    this.tokenWalk = null;
    if (snap) {
      const [x, z] = w.path[w.path.length - 1];
      this.token.position.set(x, 0, z);
    }
    this.token.position.y = 0;
    this.tokenBody.rotation.y = 0;
    w.done();
  }
  private paused = false;
  /**
   * Eco mode: the device can't keep the board at an interactive frame rate,
   * so it drops to 1x resolution and stops drawing between interactions (the
   * way the software-GL fallback does). Taps must never queue behind frames.
   */
  private eco = false;
  private slowAvg = 0;
  private slowSince = 0;
  private watchFrame(interval: number, now: number) {
    if (this.eco || this.lite) return;
    this.slowAvg = this.slowAvg * 0.9 + interval * 0.1;
    if (this.slowAvg < 50) {
      this.slowSince = 0;
      return;
    }
    if (!this.slowSince) this.slowSince = now;
    else if (now - this.slowSince > 1500) {
      this.eco = true;
      this.renderer.setPixelRatio(1);
      this.resize();
      (window as unknown as { __stixxEco?: boolean }).__stixxEco = true;
    }
  }
  /** Pause while another screen covers the board; nothing is drawn. */
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.finishWalk(true);
      cancelAnimationFrame(this.frame);
      this.running = false;
    } else this.wake();
  }
  /** Put the player's piece somewhere without animating. */
  placeToken(placeId: string | null) {
    if (!placeId) return;
    this.finishWalk(false);
    const [x, z] = BoardRenderer.frontOf(placeId);
    this.token.position.set(x, 0, z);
    this.wake();
  }
  /** Walk the player's piece along the streets to a place; resolves on arrival. */
  walkTo(placeId: string): Promise<void> {
    this.finishWalk(true);
    const [tx, tz] = BoardRenderer.frontOf(placeId);
    const fx = this.token.position.x,
      fz = this.token.position.z;
    if (Math.hypot(tx - fx, tz - fz) < 0.5 || this.reducedMotion || this.paused) {
      this.placeToken(placeId);
      return Promise.resolve();
    }
    // Along the streets, never through buildings.
    const path = walkRoute([fx, fz], [tx, tz]);
    let total = 0;
    for (let i = 1; i < path.length; i++)
      total += Math.hypot(
        path[i][0] - path[i - 1][0],
        path[i][1] - path[i - 1][1],
      );
    return new Promise((resolve) => {
      this.tokenWalk = { path, t: 0, total, done: resolve };
      this.wake();
    });
  }
  /** World position (for HTML overlays) of a person standing at a place. */
  personSpot(placeId: string, slot: number): THREE.Vector3 {
    const [x, z] = BoardRenderer.frontOf(placeId);
    const ox = ((slot % 3) - 1) * 1.7 + 1.4,
      oz = Math.floor(slot / 3) * 1.3 + 0.4;
    // Pins sit above a full-height character model's head (1.9).
    return new THREE.Vector3(x + ox, 2.3, z + oz);
  }
  /** Characters standing at places: one figure each, in their colors. */
  private characters = new Map<string, CharacterInstance>();
  private figureGen = 0;
  setFigures(
    list: { id: string; placeId: string; slot: number; color: string }[],
  ) {
    this.clear(this.figures);
    this.characters.clear();
    const gen = ++this.figureGen;
    // Named characters with a rigged model stand in person; everyone else is
    // a capsule in the crowd layer.
    const crowd = list.filter((f) => !hasCharacterModel(f.id));
    for (const f of list.filter((f) => hasCharacterModel(f.id)))
      void spawnCharacter(f.id).then((c) => {
        if (!c || gen !== this.figureGen) return;
        const v = this.personSpot(f.placeId, f.slot);
        c.root.position.set(v.x, CURB, v.z);
        c.root.name = `character:${f.id}`;
        this.figures.add(c.root);
        this.characters.set(f.id, c);
        this.renderer.shadowMap.needsUpdate = true;
        this.wake();
      });
    if (!crowd.length) return;
    const geo = new THREE.CapsuleGeometry(0.26, 0.66, 3, 8).translate(
      0,
      0.58,
      0,
    );
    const mesh = new THREE.InstancedMesh(geo, this.plainMat, crowd.length);
    crowd.forEach((f, i) => {
      const v = this.personSpot(f.placeId, f.slot);
      mesh.setMatrixAt(i, placed(v.x, CURB, v.z));
      mesh.setColorAt(i, col(f.color));
    });
    this.figures.add(mesh);
    this.wake();
  }
  /**
   * Play a clip on a named character's model ("stand", "walk", "run", or any
   * clip added to CHARACTER_MODELS later). Returns false if they have none.
   */
  characterMotion(id: string, motion: Motion) {
    const c = this.characters.get(id);
    if (!c) return false;
    c.play(motion);
    this.wake();
    return true;
  }
  /** A quick night-and-back pulse when the day ends. */
  passDay() {
    const keep = this.time;
    this.timeApplied = false;
    this.setTimeOfDay("night");
    window.setTimeout(() => {
      this.timeApplied = false;
      this.setTimeOfDay(keep);
    }, 1400);
  }
  /** Rebuild the player's figure from the character's appearance. */
  setAppearance(a: Appearance) {
    const key = JSON.stringify(a);
    if (key === this.appearanceKey) return;
    this.appearanceKey = key;
    this.clear(this.tokenBody);
    this.tokenBody.add(buildFigure(a));
    if (a.model)
      void loadFigureModel(`${import.meta.env.BASE_URL}${a.model}`)
        .then((m) => {
          if (this.appearanceKey !== key) return;
          this.clear(this.tokenBody);
          this.tokenBody.add(m);
          this.wake();
        })
        .catch(() => {});
    this.wake();
  }
  /** Face the direction of travel. */
  private faceToward(dx: number, dz: number) {
    if (Math.abs(dx) + Math.abs(dz) > 0.001)
      this.tokenBody.rotation.y = Math.atan2(dx, dz);
  }
  setTokenColor(hex: string) {
    this.tokenRing.color.set(hex);
  }
  overview() {
    this.setFocus({ zone: this.focus.zone, block: null, place: null }, false);
    this.flyTo(0, 0, LEVEL_DISTANCE.city, 0);
  }
  get debugState() {
    return {
      target: this.target.toArray(),
      distance: this.distance,
      yaw: this.yaw,
      insets: this.insets,
      focus: this.focus,
      flight: !!this.flight,
    };
  }
  get cameraDistance() {
    return this.distance;
  }
  registerOverlay(a: OverlayAnchor) {
    this.overlays = this.overlays.filter((o) => o.key !== a.key);
    this.overlays.push(a);
    this.wake();
  }
  unregisterOverlay(key: string) {
    this.overlays = this.overlays.filter((o) => o.key !== key);
  }
  static anchorFor(kind: "zone" | "place", id: string) {
    if (kind === "zone") {
      const [x, z] = districtCenter(id as ZoneId);
      return new THREE.Vector3(x, 12, z - 4);
    }
    const l = LOCATIONS.find((l) => l.id === id)!;
    const [x, z] = locationPosition(l);
    return new THREE.Vector3(x, placeHeight(l) + 2, z);
  }
  resize() {
    const w = this.host.clientWidth || 1,
      h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 52 : 40;
    this.applyViewOffset();
    this.wake();
  }
  dispose() {
    this.disposed = true;
    if (BoardRenderer.instance === this) BoardRenderer.instance = null;
    this.detach();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.renderer.dispose();
  }

  // ---- materials, sky ---------------------------------------------------------
  private makeMaterials() {
    const lit = (o: THREE.MeshStandardMaterialParameters): Lit => {
      if (!this.lite) return new THREE.MeshStandardMaterial(o);
      const { roughness: _r, metalness: _m, ...rest } = o;
      void _r;
      void _m;
      return new THREE.MeshLambertMaterial(
        rest as THREE.MeshLambertMaterialParameters,
      );
    };
    this.facadeMat = lit({
      vertexColors: true,
      map: this.textures.map,
      emissiveMap: this.textures.emissive,
      emissive: new THREE.Color("#ffffff"),
      roughness: 0.82,
      metalness: 0.05,
    });
    this.plainMat = lit({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    this.groundMat = lit({ color: "#34353a", roughness: 0.5, metalness: 0.15 });
    this.waterMat = lit({ color: "#1d3a44", roughness: 0.12, metalness: 0.7 });
    this.signMat = lit({
      map: this.atlas.texture,
      emissiveMap: this.atlas.texture,
      emissive: new THREE.Color("#ffffff"),
      roughness: 0.7,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.tagMat = lit({
      map: this.atlas.texture,
      emissiveMap: this.atlas.texture,
      emissive: new THREE.Color("#ffffff"),
      transparent: true,
      alphaTest: 0.35,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
  }
  private makeSky() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1100, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          sunColor: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3() },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(horizon, top, pow(max(h,0.0), 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * (pow(s, 48.0) * 1.2 + pow(s, 5.0) * 0.22);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // ---- static city --------------------------------------------------------------
  private addKit(k: Kit, shadows = true) {
    const meshes: THREE.Mesh[] = [];
    if (!k.facade.empty)
      meshes.push(new THREE.Mesh(k.facade.build(), this.facadeMat));
    if (!k.plain.empty)
      meshes.push(new THREE.Mesh(k.plain.build(), this.plainMat));
    if (!k.glow.empty)
      meshes.push(new THREE.Mesh(k.glow.build(), this.glowMat));
    if (!k.sign.empty)
      meshes.push(new THREE.Mesh(k.sign.build(), this.signMat));
    for (const m of meshes) {
      const casts =
        m.material === this.facadeMat || m.material === this.plainMat;
      m.castShadow = shadows && casts;
      m.receiveShadow = casts || m.material === this.signMat;
      this.scene.add(m);
    }
  }
  private nearRiver(x: number, z: number, pad: number) {
    return distanceToPath(this.river, x, z) < RIVER_WIDTH / 2 + pad;
  }
  private build() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2),
      this.groundMat,
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.buildRiver();
    this.reserveTransitHub();
    for (const zone of ZONE_ORDER) this.buildDistrict(zone);
    this.buildRail();
    this.buildSetPieces();
    this.animated.push((_, dt) => this.characters.forEach((c) => c.update(dt)));
    this.buildFiller();
    this.buildStreetFurniture();
    this.buildTraffic();
    for (const l of LOCATIONS) {
      const [x, z] = locationPosition(l),
        h = placeHeight(l);
      const picker = new THREE.Mesh(
        new THREE.CylinderGeometry(3.8, 3.8, h + 2, 8).translate(
          0,
          (h + 2) / 2,
          0,
        ),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      picker.position.set(x, 0, z);
      picker.userData.place = l.id;
      this.placePickers.push(picker);
      this.scene.add(picker);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }
  private buildRiver() {
    const g = new Geo(),
      banks = kit(91),
      w = RIVER_WIDTH / 2,
      path = this.river;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i],
        [bx, bz] = path[i + 1];
      const dx = bx - ax,
        dz = bz - az,
        l = Math.hypot(dx, dz) || 1,
        nx = -dz / l,
        nz = dx / l,
        ex = (dx / l) * 0.3,
        ez = (dz / l) * 0.3;
      g.quad(
        [ax + nx * w - ex, 0.06, az + nz * w - ez],
        [ax - nx * w - ex, 0.06, az - nz * w - ez],
        [bx - nx * w + ex, 0.06, bz - nz * w + ez],
        [bx + nx * w + ex, 0.06, bz + nz * w + ez],
        col("#ffffff"),
      );
      for (const side of [1, -1])
        box(banks, {
          x: (ax + bx) / 2 + nx * (w + 0.35) * side,
          z: (az + bz) / 2 + nz * (w + 0.35) * side,
          w: l + 0.4,
          d: 0.7,
          h: 0.55,
          y: 0,
          rot: Math.atan2(-dz, dx),
          color: col("#5f5b55"),
          windows: false,
        });
    }
    const waterGeo = g.build();
    waterGeo.deleteAttribute("color");
    const mesh = new THREE.Mesh(waterGeo, this.waterMat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const lines = [
      ...AVENUES_X.map((v) => ({ axis: "x" as const, v })),
      ...AVENUES_Z.map((v) => ({ axis: "z" as const, v })),
    ];
    for (const line of lines)
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i],
          b = path[i + 1];
        const ai = line.axis === "x" ? a[0] : a[1],
          bi = line.axis === "x" ? b[0] : b[1];
        if ((ai - line.v) * (bi - line.v) > 0 || ai === bi) continue;
        const f = (line.v - ai) / (bi - ai);
        const x = a[0] + (b[0] - a[0]) * f,
          z = a[1] + (b[1] - a[1]) * f;
        if (x < BOARD.minX || x > BOARD.maxX || z < BOARD.minZ || z > BOARD.maxZ) continue;
        const rot = line.axis === "x" ? Math.PI / 2 : 0;
        box(banks, {
          x,
          z,
          w: RIVER_WIDTH + 5,
          d: 4.2,
          h: 0.35,
          y: 0.45,
          rot,
          color: col("#4c4d50"),
          windows: false,
        });
        for (const side of [-1, 1])
          box(banks, {
            x: x + (rot ? side * 2 : 0),
            z: z + (rot ? 0 : side * 2),
            w: RIVER_WIDTH + 5,
            d: 0.18,
            h: 0.5,
            y: 0.8,
            rot,
            color: col("#7b6f62"),
            windows: false,
          });
      }
    this.addKit(banks);
  }
  private buildDistrict(zone: ZoneId) {
    const style = DISTRICT_STYLE[zone],
      grid = districtGrid(zone);
    this.streets[zone] = grid;
    // Set pieces dress the blocks no named place uses. The software-GL
    // fallback keeps the procedural filler: it cannot afford the triangles.
    const plan = this.lite
      ? []
      : planSetPieces(
          zone,
          grid.blocks
            .filter(
              (b) =>
                !b.waterfront &&
                !LOCATIONS.some((l) => locationBlock(l)?.id === b.id) &&
                !this.setPieces.some((p) => p.block === b.id) &&
                !lotBlocks.has(b.id),
            )
            .map((b) => buildable(b)),
        );
    this.setPieces.push(...plan);
    // One kit (and so one set of meshes) per section: the GPU skips sections
    // outside the camera's view, and the city still draws whole on screen.
    for (const section of grid.sections) {
      const k = kit(hash(`${zone}.${section.id}`));
      for (const b of grid.blocks.filter((b) => b.section === section.id)) {
        k.block = b.id;
        const cx = (b.minX + b.maxX) / 2,
          cz = (b.minZ + b.maxZ) / 2;
        const here = LOCATIONS.filter((l) => locationBlock(l)?.id === b.id);
        if (b.waterfront && !here.length) {
          waterfront(k, zone, b, (x, z, p) => this.nearRiver(x, z, p));
          continue;
        }
        if (!b.waterfront)
          box(k, {
            x: cx,
            z: cz,
            w: b.maxX - b.minX,
            d: b.maxZ - b.minZ,
            h: CURB,
            y: 0,
            color: col(style.sidewalk),
            windows: false,
          });
        const use = buildable(b);
        let exclude: Rect | null = null;
        const pieces = this.setPieces.filter((p) => p.block === b.id);
        if (pieces.length)
          exclude = pieces.reduce<Rect>(
            (u, p) => ({
              minX: Math.min(u.minX, p.rect.minX),
              maxX: Math.max(u.maxX, p.rect.maxX),
              minZ: Math.min(u.minZ, p.rect.minZ),
              maxZ: Math.max(u.maxZ, p.rect.maxZ),
            }),
            { ...pieces[0].rect },
          );
        for (const l of here) {
          if (l.model) {
            // Measure the procedural footprint on a scratch kit, then let the
            // GLB occupy exactly that space so the rest of the block fills.
            exclude = buildLocation(kit(1), this.atlas, l, use, {
              trainZ: Number.NaN,
              scene: () => {},
            });
            this.loadModel(l, exclude);
            continue;
          }
          exclude = buildLocation(k, this.atlas, l, use, {
            trainZ: Number.NaN,
            scene: (o) => this.scene.add(o),
          });
        }
        if (!here.length && lotBlocks.has(b.id)) {
          developmentLot(k, use, this.atlas);
          continue;
        }
        const fullyUsed =
          exclude &&
          exclude.maxX - exclude.minX >= use.maxX - use.minX - 0.7 &&
          exclude.maxZ - exclude.minZ >= use.maxZ - use.minZ - 0.7;
        if (!fullyUsed && !b.waterfront)
          fillBlock(k, zone, use, exclude, Number.NaN);
      }
      k.block = null;
      for (const w of k.walls) {
        if (!w.block) continue;
        const list = this.walls.get(w.block) ?? [];
        list.push(w);
        this.walls.set(w.block, list);
      }
      for (const roof of k.roofs) {
        const rb = blockAt(roof[0], roof[2]);
        if (!rb) continue;
        const list = this.roofs.get(rb.id) ?? [];
        list.push(roof);
        this.roofs.set(rb.id, list);
      }
      this.addKit(k);
    }
  }
  /** One instanced mesh per set piece, however many lots use it. */
  private buildSetPieces() {
    const groups = new Map<keyof typeof SET_PIECES, SetPiecePlacement[]>();
    for (const p of this.setPieces)
      groups.set(p.piece, [...(groups.get(p.piece) ?? []), p]);
    const tints = ["#ffffff", "#f4e4cc", "#e2eee6", "#f2d8d6", "#dde5f4", "#efe6c2"];
    for (const [id, list] of groups)
      void loadModelPiece(SET_PIECES[id], this.lite).then((piece) => {
        if (!piece) return;
        const size = piece.geometry.boundingBox!.getSize(new THREE.Vector3());
        const mesh = new THREE.InstancedMesh(
          piece.geometry,
          piece.material,
          list.length,
        );
        const m = new THREE.Matrix4(),
          q = new THREE.Quaternion(),
          up = new THREE.Vector3(0, 1, 0);
        list.forEach((p, i) => {
          const w = p.rect.maxX - p.rect.minX,
            d = p.rect.maxZ - p.rect.minZ;
          const scale = new THREE.Vector3().setScalar(
            Math.min(
              Math.min(w / size.x, d / size.z) * 0.94,
              (MAX_HEIGHT[id] ?? Infinity) / (size.y || 1),
            ),
          );
          q.setFromAxisAngle(up, p.yaw);
          m.compose(
            new THREE.Vector3(
              (p.rect.minX + p.rect.maxX) / 2,
              CURB,
              (p.rect.minZ + p.rect.maxZ) / 2,
            ),
            q,
            scale,
          );
          mesh.setMatrixAt(i, m);
          if (TINTED.has(id))
            mesh.setColorAt(i, col(tints[hash(p.block + i) % tints.length]));
        });
        mesh.castShadow = mesh.receiveShadow = !this.lite;
        mesh.name = `set:${id}`;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.renderer.shadowMap.needsUpdate = true;
        this.wake();
      });
  }
  /** Optional GLB replacement for a location (see LocationDef.model). */
  private loadModel(l: LocationDef, rect: Rect) {
    this.placeModel(l.model!, rect, l.modelFit, `model:${l.id}`);
    l.companions?.forEach((c, i) =>
      this.placeModel(c.model, rect, c, `model:${l.id}:${i}`),
    );
  }
  private placeModel(
    path: string,
    rect: Rect,
    fitOpts: LocationDef["modelFit"],
    name: string,
  ) {
    void loadModelPiece(path, this.lite).then((piece) => {
      if (!piece) return;
      const size = piece.geometry.boundingBox!.getSize(new THREE.Vector3());
      const yaw = fitOpts?.yaw ?? 0;
      const turned = Math.abs(Math.sin(yaw)) > 0.5;
      const sx = turned ? size.z : size.x,
        sz = turned ? size.x : size.z;
      const fit = fitOpts?.height
        ? fitOpts.height / (size.y || 1)
        : Math.min(
            (rect.maxX - rect.minX) / (sx || 1),
            (rect.maxZ - rect.minZ) / (sz || 1),
          ) * (fitOpts?.scale ?? 0.92);
      const mesh = new THREE.Mesh(piece.geometry, piece.material);
      mesh.scale.setScalar(fit);
      mesh.rotation.y = yaw;
      mesh.position.set(
        (rect.minX + rect.maxX) / 2 + (fitOpts?.offset?.[0] ?? 0),
        CURB + (fitOpts?.y ?? 0),
        (rect.minZ + rect.maxZ) / 2 + (fitOpts?.offset?.[1] ?? 0),
      );
      mesh.castShadow = mesh.receiveShadow = !this.lite;
      mesh.name = name;
      this.scene.add(mesh);
      this.renderer.shadowMap.needsUpdate = true;
      this.wake();
    });
  }
  /**
   * Stixx Central: the transit plaza takes the free block nearest the
   * interchange, so the hub reads at street level too.
   */
  private reserveTransitHub() {
    if (this.lite) return;
    const hub = RAIL_STATIONS.find((s) => s.id === "central");
    if (!hub) return;
    const free = ALL_BLOCKS.filter(
      (b) =>
        b.zone === "downtown" &&
        !b.waterfront &&
        !LOCATIONS.some((l) => locationBlock(l)?.id === b.id),
    ).sort(
      (a, b) =>
        Math.hypot((a.minX + a.maxX) / 2 - hub.point[0], (a.minZ + a.maxZ) / 2 - hub.point[1]) -
        Math.hypot((b.minX + b.maxX) / 2 - hub.point[0], (b.minZ + b.maxZ) / 2 - hub.point[1]),
    )[0];
    if (!free) return;
    const r = buildable(free);
    const yaw =
      (free.minZ + free.maxZ) / 2 > hub.point[1] ? Math.PI : 0;
    this.setPieces.push({
      piece: "transitPlaza",
      block: free.id,
      rect: { minX: r.minX + 0.3, maxX: r.maxX - 0.3, minZ: r.minZ + 0.3, maxZ: r.maxZ - 0.3 },
      yaw,
    });
  }
  /**
   * The El: decks, rails and bents along each line in RAIL_LINES, stations
   * from RAIL_STATIONS, and trains that run the track, stopping at stations.
   * Supports stand on the sidewalk strip that blocks along the line give up
   * (see `buildable`), never in a roadway or a building.
   */
  private buildRail() {
    const k = kit(9001);
    for (const line of RAIL_LINES) {
      const steel = col(line.old ? "#5b4636" : "#3b3f45"),
        trim = col(line.old ? "#6e5442" : "#565b62");
      const pts = line.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i],
          [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const th = Math.atan2(bz - az, bx - ax),
          rot = -th,
          mx = (ax + bx) / 2,
          mz = (az + bz) / 2,
          nx = -Math.sin(th),
          nz = Math.cos(th);
        box(k, {
          x: mx,
          z: mz,
          w: len + 0.25,
          d: 3.4,
          h: 0.5,
          y: RAIL_DECK,
          rot,
          color: steel,
          windows: false,
        });
        for (const side of [-1, 1]) {
          // Girder fascia and the two running rails.
          box(k, {
            x: mx + nx * 1.7 * side,
            z: mz + nz * 1.7 * side,
            w: len + 0.25,
            d: 0.14,
            h: 0.9,
            y: RAIL_DECK - 0.25,
            rot,
            color: trim,
            windows: false,
          });
          box(k, {
            x: mx + nx * 0.72 * side,
            z: mz + nz * 0.72 * side,
            w: len + 0.25,
            d: 0.12,
            h: 0.12,
            y: RAIL_DECK + 0.5,
            rot,
            color: col("#8a8f94"),
            windows: false,
          });
        }
      }
      this.railSupports(k, line, steel);
    }
    for (const st of RAIL_STATIONS) this.railStation(k, st);
    this.addKit(k);
    for (const line of RAIL_LINES) this.railTrain(line);
  }
  /** Bents every few metres: a column on each sidewalk and a crossbeam. */
  private railSupports(k: Kit, line: RailLine, steel: THREE.Color) {
    const pts = line.points;
    const inBlock = (x: number, z: number) =>
      ALL_BLOCKS.some(
        (b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ,
      );
    const inCity = (x: number, z: number) =>
      ZONE_ORDER.some((id) => {
        const d = DISTRICTS[id];
        return x > d.minX && x < d.maxX && z > d.minZ && z < d.maxZ;
      });
    let carry = 3;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i],
        [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const th = Math.atan2(bz - az, bx - ax),
        nx = -Math.sin(th),
        nz = Math.cos(th);
      let t = carry;
      for (; t < len; t += 7) {
        const x = ax + ((bx - ax) * t) / len,
          z = az + ((bz - az) * t) / len;
        const feet: [number, number][] = [];
        for (const side of [-1, 1]) {
          let foot: [number, number] | null = null;
          for (let d = 1.9; d < 7.5; d += 0.25) {
            const px = x + nx * d * side,
              pz = z + nz * d * side;
            if (inBlock(px, pz)) {
              foot = [px + nx * 0.35 * side, pz + nz * 0.35 * side];
              break;
            }
          }
          // Open ground beyond the districts can take a column close in;
          // inside the city a missing sidewalk means a cross street.
          if (!foot && !inCity(x + nx * 2.3 * side, z + nz * 2.3 * side))
            foot = [x + nx * 2.3 * side, z + nz * 2.3 * side];
          if (foot && !this.nearRiver(foot[0], foot[1], 0.5)) feet.push(foot);
        }
        for (const [fx, fz] of feet)
          box(k, {
            x: fx,
            z: fz,
            w: 0.45,
            d: 0.45,
            h: RAIL_DECK,
            y: 0,
            color: steel,
            windows: false,
          });
        if (feet.length) {
          const ends = feet.length === 2 ? feet : [feet[0], [x, z] as [number, number]];
          const [p, q] = ends;
          const span = Math.hypot(q[0] - p[0], q[1] - p[1]);
          box(k, {
            x: (p[0] + q[0]) / 2,
            z: (p[1] + q[1]) / 2,
            w: span + 0.45,
            d: 0.5,
            h: 0.45,
            y: RAIL_DECK - 0.45,
            rot: -Math.atan2(q[1] - p[1], q[0] - p[0]),
            color: steel,
            windows: false,
          });
        }
      }
      carry = t - len;
    }
  }
  /** Platforms, canopies, a name board and stairs to the sidewalk. */
  private railStation(k: Kit, st: RailStation) {
    const [x, z] = st.point,
      th = st.heading,
      rot = -th,
      nx = -Math.sin(th),
      nz = Math.cos(th);
    const L = 11;
    for (const side of [-1, 1]) {
      const px = x + nx * 2.6 * side,
        pz = z + nz * 2.6 * side;
      box(k, {
        x: px,
        z: pz,
        w: L,
        d: 1.8,
        h: 0.5,
        y: RAIL_DECK + 0.05,
        rot,
        color: col("#7d7a72"),
        windows: false,
      });
      // Canopy on posts.
      for (const along of [-L / 2 + 0.6, 0, L / 2 - 0.6])
        box(k, {
          x: px + Math.cos(th) * along,
          z: pz + Math.sin(th) * along,
          w: 0.15,
          d: 0.15,
          h: 2.1,
          y: RAIL_DECK + 0.55,
          color: col("#2f5b3f"),
          windows: false,
        });
      box(k, {
        x: px,
        z: pz,
        w: L,
        d: 2.2,
        h: 0.18,
        y: RAIL_DECK + 2.65,
        rot,
        color: col("#2f5b3f"),
        windows: false,
      });
      onWall(
        k.sign,
        { x: px + nx * 1.12 * side, z: pz + nz * 1.12 * side, nx: nx * side, nz: nz * side },
        0,
        RAIL_DECK + 2.0,
        4.2,
        0.6,
        col("#fff"),
        this.atlas.sign(st.name.toUpperCase(), "#1d3a2a", "#f2efe6"),
      );
      onWall(
        k.glow,
        { x: px + nx * 0.9 * side, z: pz + nz * 0.9 * side, nx: nx * side, nz: nz * side },
        0,
        RAIL_DECK + 2.45,
        L - 1,
        0.12,
        col("#ffe0a0"),
      );
    }
    // Stairs from the platform down to the station's sidewalk front.
    const [fx, fz] = st.front;
    const dx = fx - x,
      dz = fz - z,
      dist = Math.hypot(dx, dz);
    if (dist > 2) {
      const ux = dx / dist,
        uz = dz / dist,
        steps = 14;
      for (let i = 0; i < steps; i++) {
        const f = (i + 0.5) / steps;
        const sx = x + ux * (3.4 + f * Math.max(0, dist - 3.6)),
          sz = z + uz * (3.4 + f * Math.max(0, dist - 3.6));
        box(k, {
          x: sx + Math.cos(th) * (L / 2 - 1),
          z: sz + Math.sin(th) * (L / 2 - 1),
          w: 1.4,
          d: Math.max(0.4, (dist - 3.6) / steps + 0.05),
          h: 0.18,
          y: RAIL_DECK * (1 - f),
          rot: -Math.atan2(uz, ux) + Math.PI / 2,
          color: col("#6b6e72"),
          windows: false,
        });
      }
    }
  }
  /** A three-car train shuttling the line, dwelling at each station. */
  private railTrain(line: RailLine) {
    const pts = line.points;
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(
        cum[i - 1] +
          Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]),
      );
    const total = cum[cum.length - 1];
    const at = (s: number) => {
      s = Math.max(0, Math.min(total, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1,
        f = (s - cum[i - 1]) / seg;
      const [ax, az] = pts[i - 1],
        [bx, bz] = pts[i];
      return {
        x: ax + (bx - ax) * f,
        z: az + (bz - az) * f,
        heading: Math.atan2(bz - az, bx - ax),
      };
    };
    const stops = RAIL_STATIONS.filter((s) => s.line === line.id)
      .map((s) => {
        let best = 0,
          bestD = Infinity;
        for (let t = 0; t <= total; t += 0.5) {
          const p = at(t);
          const d = Math.hypot(p.x - s.point[0], p.z - s.point[1]);
          if (d < bestD) [best, bestD] = [t, d];
        }
        return best;
      })
      .sort((a, b) => a - b);
    const CAR = 4,
      GAP = 0.35,
      CARS = 3,
      LEN = CARS * CAR + (CARS - 1) * GAP;
    const tk = kit(5);
    box(tk, {
      x: 0,
      z: 0,
      w: CAR,
      d: 1.9,
      h: 1.5,
      y: 0,
      color: col(line.old ? "#b9a27c" : "#9aa2a8"),
      windows: false,
    });
    for (const side of [-1, 1])
      tk.glow.quad(
        [-CAR / 2 + 0.2, 0.7, 0.96 * side],
        [CAR / 2 - 0.2, 0.7, 0.96 * side],
        [CAR / 2 - 0.2, 1.2, 0.96 * side],
        [-CAR / 2 + 0.2, 1.2, 0.96 * side],
        col("#ffd8a0"),
      );
    const carBody = new THREE.InstancedMesh(tk.plain.build(), this.plainMat, CARS);
    const carGlow = new THREE.InstancedMesh(tk.glow.build(), this.glowMat, CARS);
    carBody.castShadow = !this.lite;
    carBody.name = `train:${line.id}`;
    this.scene.add(carBody, carGlow);
    // Head position along the line; the cars trail behind it.
    let s = LEN,
      dir = 1,
      dwell = 0;
    const SPEED = 10;
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      one = new THREE.Vector3(1, 1, 1);
    const place = () => {
      for (let c = 0; c < CARS; c++) {
        const mid = s - dir * (CAR / 2 + c * (CAR + GAP));
        const p = at(mid);
        q.setFromAxisAngle(up, -p.heading);
        m.compose(new THREE.Vector3(p.x, RAIL_DECK + 0.62, p.z), q, one);
        carBody.setMatrixAt(c, m);
        carGlow.setMatrixAt(c, m);
      }
      carBody.instanceMatrix.needsUpdate = true;
      carGlow.instanceMatrix.needsUpdate = true;
    };
    place();
    this.animated.push((_, dt) => {
      if (dwell > 0) {
        dwell -= dt;
        return;
      }
      const prev = s;
      s += dir * SPEED * dt;
      // Stop with the train centred on a platform it reaches.
      for (const stop of stops) {
        const centre = stop + (dir * LEN) / 2;
        if ((prev - centre) * (s - centre) <= 0 && prev !== centre) {
          s = centre;
          dwell = 2.5;
          break;
        }
      }
      if (s >= total) {
        s = total;
        dir = -1;
        dwell = 2;
      } else if (s <= 0) {
        s = 0;
        dir = 1;
        dwell = 2;
      }
      place();
    });
  }
  private buildFiller() {
    // The rest of the city around the five districts, in quadrants so each
    // can be skipped when it is behind the camera.
    const quads = [kit(4242), kit(4243), kit(4244), kit(4245)];
    const step = 12,
      wall = ["#3e3b3c", "#46423f", "#3a3d43", "#4a4540", "#353538"];
    for (let x = -396; x <= 396; x += step)
      for (let z = -396; z <= 396; z += step) {
        const k = quads[(x < 0 ? 0 : 1) + (z < 0 ? 0 : 2)];
        const cx = x + (k.r() - 0.5) * 2,
          cz = z + (k.r() - 0.5) * 2;
        const inside = ZONE_ORDER.some((id) => {
          const d = DISTRICTS[id];
          return (
            cx > d.minX - 7 &&
            cx < d.maxX + 7 &&
            cz > d.minZ - 7 &&
            cz < d.maxZ + 7
          );
        });
        if (inside || this.nearRiver(cx, cz, 6)) continue;
        if (
          AVENUES_X.some((a) => Math.abs(cx - a) < 7) ||
          AVENUES_Z.some((a) => Math.abs(cz - a) < 7) ||
          distanceToRail(cx, cz) < 9
        )
          continue;
        const far = Math.max(Math.abs(cx), Math.abs(cz)) > 210;
        const floors = far
          ? 3 + Math.floor(k.r() * 14)
          : 2 + Math.floor(Math.pow(k.r(), 2) * 8);
        box(k, {
          x: cx,
          z: cz,
          w: step - 3.5,
          d: step - 3.5,
          h: CURB,
          y: 0,
          color: col("#4f4e4b"),
          windows: false,
        });
        box(k, {
          x: cx,
          z: cz,
          w: step - 5 - k.r() * 2,
          d: step - 5 - k.r() * 2,
          h: 0.9 * floors,
          color: col(pick(k.r, wall)),
        });
      }
    for (const k of quads) this.addKit(k);
  }
  private buildStreetFurniture() {
    const lamps: [number, number][] = [];
    for (const zone of ZONE_ORDER) {
      const g = this.streets[zone];
      // Around every section, then along its inner streets.
      for (const sec of g.sections) {
        for (let x = sec.minX + 2; x <= sec.maxX - 2; x += 8)
          lamps.push([x, sec.minZ + 0.75], [x, sec.maxZ - 0.75]);
        for (let z = sec.minZ + 8; z < sec.maxZ - 2; z += 8)
          lamps.push([sec.minX + 0.75, z], [sec.maxX - 0.75, z]);
      }
      for (const ln of g.lines)
        for (let t = ln.from + 6; t < ln.to - 2; t += 10)
          lamps.push(ln.axis === "x" ? [ln.at + 1.3, t] : [t, ln.at + 1.3]);
    }
    // Lamps stay clear of the river and of the El's columns.
    const usable = lamps.filter(
      ([x, z]) => !this.nearRiver(x, z, 1) && distanceToRail(x, z) > 2.6,
    );
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.09, 3.2, 5).translate(0, 1.6, 0),
      this.plainMat,
      usable.length,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.3),
      this.lampHeadMat,
      usable.length,
    );
    const pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      this.lampPoolMat,
      usable.length,
    );
    const grey = col("#2c2d30");
    usable.forEach(([x, z], i) => {
      poles.setMatrixAt(i, placed(x, 0, z));
      poles.setColorAt(i, grey);
      heads.setMatrixAt(i, placed(x, 3.2, z));
      pools.setMatrixAt(i, placed(x, 0.08, z, 6.5, 1, 6.5));
    });
    pools.renderOrder = 2;
    this.scene.add(poles, heads, pools);
    // Power poles and wires along Rio and Reservoir streets (from the references).
    const k = kit(33);
    for (const zone of ["rio", "reservoir", "south"] as ZoneId[]) {
      const d = DISTRICTS[zone];
      for (const z of [d.minZ - 1.2, d.maxZ + 1.2]) {
        let prev: [number, number] | null = null;
        for (let x = d.minX; x <= d.maxX; x += 9) {
          if (this.nearRiver(x, z, 1)) {
            prev = null;
            continue;
          }
          box(k, {
            x,
            z,
            w: 0.18,
            d: 0.18,
            h: 5.2,
            y: 0,
            color: col("#5a4636"),
            windows: false,
          });
          box(k, {
            x,
            z,
            w: 1.4,
            d: 0.1,
            h: 0.1,
            y: 4.8,
            color: col("#5a4636"),
            windows: false,
          });
          if (prev)
            box(k, {
              x: (prev[0] + x) / 2,
              z,
              w: x - prev[0],
              d: 0.03,
              h: 0.03,
              y: 4.6,
              color: col("#1a1a1a"),
              windows: false,
            });
          prev = [x, z];
        }
      }
    }
    this.addKit(k, false);
    const dashes: [number, number, number][] = [];
    for (const ax of AVENUES_X)
      for (let z = BOARD.minZ; z < BOARD.maxZ; z += 4)
        dashes.push([ax, z, Math.PI / 2]);
    for (const az of AVENUES_Z)
      for (let x = BOARD.minX; x < BOARD.maxX; x += 4) dashes.push([x, az, 0]);
    const kept = dashes.filter(([x, z]) => !this.nearRiver(x, z, 0.5));
    const dashMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.4, 0.16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#a88a3a" }),
      kept.length,
    );
    kept.forEach(([x, z, r], i) =>
      dashMesh.setMatrixAt(i, placed(x, 0.03, z, 1, 1, 1, r)),
    );
    this.scene.add(dashMesh);
  }
  private carGeometry() {
    const k = kit(1);
    box(k, {
      x: 0,
      z: 0,
      w: 1.5,
      d: 0.72,
      h: 0.38,
      y: 0.1,
      color: col("#ffffff"),
      windows: false,
    });
    box(k, {
      x: -0.1,
      z: 0,
      w: 0.78,
      d: 0.62,
      h: 0.26,
      y: 0.48,
      color: col("#2a2f36"),
      windows: false,
    });
    return k.plain.build();
  }
  private vehicles = new Map<string, ModelPiece>();
  private setPieces: SetPiecePlacement[] = [];
  /**
   * Swap a GLB vehicle into an instanced car layer once it loads. The layer
   * starts with the procedural box car, so the board never waits on a file.
   */
  private vehicle(
    file: string,
    cars: THREE.InstancedMesh,
    onReady?: (v: ModelPiece) => void,
  ) {
    // The software-GL fallback keeps the 12-triangle box cars: a dozen moving
    // 2.5k-triangle models every frame is what it can least afford.
    if (this.lite) return;
    const apply = (v: ModelPiece) => {
      if (!cars.parent) return;
      const old = cars.geometry;
      cars.geometry = v.geometry;
      cars.material = v.material;
      if (!sharedModelGeometry.has(old)) old.dispose();
      const white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < cars.count; i++) cars.setColorAt(i, white);
      if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
      onReady?.(v);
      this.wake();
    };
    const ready = this.vehicles.get(file);
    if (ready) return apply(ready);
    void loadModelPiece(file, this.lite).then((p) => {
      if (!p) return;
      const v = this.vehicles.get(file) ?? asVehicle(p, CAR_LENGTH);
      this.vehicles.set(file, v);
      apply(v);
    });
  }
  private buildTraffic() {
    const movers: Mover[] = [];
    const r = rng(77);
    for (const zone of ZONE_ORDER) {
      const d = DISTRICTS[zone];
      const base = loop(
        rectLoop(d.minX - 1.9, d.minZ - 1.9, d.maxX + 1.9, d.maxZ + 1.9),
      );
      for (let i = 0; i < 5; i++)
        movers.push({ ...base, t: r() * base.total, speed: 4 + r() * 3 });
    }
    const cars = new THREE.InstancedMesh(
      this.carGeometry(),
      this.plainMat,
      movers.length,
    );
    const colors = [
      "#7a1f2b",
      "#d8d4cc",
      "#20242a",
      "#2b5e7a",
      "#8a8f94",
      "#5a4a3a",
      "#c0a03a",
    ];
    movers.forEach((_, i) => cars.setColorAt(i, col(pick(r, colors))));
    this.scene.add(cars);
    // Rio Gabriel's lowriders cruise the inner streets, low and slow.
    const corridor = this.streets.rio.sections.find(
      (sec) => sec.id === "corridor-n",
    )!;
    const cruise = loop(
      rectLoop(
        corridor.minX + 0.3,
        corridor.minZ + 0.3,
        corridor.maxX - 0.3,
        corridor.maxZ + 2.6,
      ),
    );
    const lows: Mover[] = Array.from({ length: 3 }, (_, i) => ({
      ...cruise,
      t: (cruise.total / 3) * i,
      speed: 2.4,
    }));
    const lowriders = new THREE.InstancedMesh(
      this.carGeometry(),
      this.plainMat,
      lows.length,
    );
    lows.forEach((_, i) =>
      lowriders.setColorAt(i, col(["#9a1a24", "#b8902a", "#3a2a6a"][i])),
    );
    this.scene.add(lowriders);
    this.vehicle(MODEL_FILES.lowrider, lowriders);
    const tmp = { x: 0, z: 0, heading: 0 };
    this.animated.push((_, dt) => {
      movers.forEach((m, i) => {
        m.t += m.speed * dt;
        sample(m, tmp);
        cars.setMatrixAt(i, placed(tmp.x, 0, tmp.z, 1, 1, 1, tmp.heading));
      });
      cars.instanceMatrix.needsUpdate = true;
      lows.forEach((m, i) => {
        m.t += m.speed * dt;
        sample(m, tmp);
        lowriders.setMatrixAt(
          i,
          placed(tmp.x, 0, tmp.z, 1, 1, 1, tmp.heading),
        );
      });
      lowriders.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- state-driven layers --------------------------------------------------------
  private clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      // Rigged characters share geometry and textures with a cached template.
      if (child.userData.sharedModel) continue;
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !sharedModelGeometry.has(m.geometry))
          m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat && !Array.isArray(mat) && !this.isShared(mat)) mat.dispose();
      });
    }
  }
  private isShared(m: THREE.Material) {
    if (sharedModelMaterial.has(m)) return true;
    return [
      this.facadeMat,
      this.plainMat,
      this.glowMat,
      this.signMat,
      this.tagMat,
      this.lampPoolMat,
      this.lampHeadMat,
    ].includes(m as never);
  }
  private rebuildDynamic() {
    this.clear(this.dynamic);
    this.dynamicAnimated = [];
    const view = this.view;
    if (!view) return;
    this.factionMarks(view);
    this.lensLayer(view);
    this.districtOutlines(view);
    this.police(view);
    this.people(view);
    this.beacons(view);
  }
  /** Tags, banners and flags, block by block, in proportion to presence. */
  private factionMarks(view: BoardView) {
    const tags = new Geo(),
      cloth = new Geo(),
      r = rng(view.day * 3 + 11);
    for (const b of Object.values(view.blocks)) {
      if (!b.faction) continue;
      const walls = this.walls.get(b.id) ?? [];
      if (!walls.length) continue;
      const t = TAGS[b.faction];
      const uv = this.atlas.tag(t.text, t.color, t.crown);
      const n = Math.min(walls.length, 1 + Math.round(b.strength * 2));
      for (let i = 0; i < n; i++) {
        const w = walls[Math.floor(r() * walls.length)];
        const tw = Math.min(w.width * 0.8, t.text.length > 3 ? 3.2 : 2);
        onWall(
          tags,
          w,
          (r() - 0.5) * (w.width - tw) * 0.6,
          CURB + 0.25 + r() * 0.5,
          tw,
          tw / 4,
          col("#ffffff"),
          uv,
          0.06 + i * 0.01,
        );
      }
      if (b.contested) {
        // A rival's tag crossing out the holder's: the feud on the walls.
        const rival = (Object.keys(TAGS) as FactionId[]).find(
          (f) =>
            f !== b.faction &&
            view.zones[b.zone].presence.some((p) => p.faction === f),
        );
        if (rival) {
          const rt = TAGS[rival];
          const w = walls[Math.floor(r() * walls.length)];
          onWall(
            tags,
            w,
            0,
            CURB + 1.1,
            2.4,
            0.6,
            col("#ffffff"),
            this.atlas.tag(rt.text, rt.color, rt.crown),
            0.1,
          );
        }
      }
      if (b.strength > 0.45) {
        // Banners hanging from upper floors.
        const w = walls[Math.floor(r() * walls.length)];
        if (w.top > 2.5) {
          const [c1, c2] = t.cloth;
          onWall(
            cloth,
            w,
            (r() - 0.5) * w.width * 0.4,
            w.top - 1.9,
            0.7,
            1.4,
            col(c1),
            undefined,
            0.08,
          );
          onWall(
            cloth,
            w,
            (r() - 0.5) * w.width * 0.4 + 0.2,
            w.top - 1.2,
            0.7,
            0.25,
            col(c2),
            undefined,
            0.09,
          );
        }
      }
    }
    if (!tags.empty) {
      const m = new THREE.Mesh(tags.build(), this.tagMat);
      m.renderOrder = 3;
      this.dynamic.add(m);
    }
    if (!cloth.empty)
      this.dynamic.add(new THREE.Mesh(cloth.build(), this.plainMat));
  }
  /** Strategy lenses: a readable block-by-block overlay on demand. */
  private lensLayer(view: BoardView) {
    if (this.lens === "streets") return;
    const pulse: THREE.MeshBasicMaterial[] = [];
    for (const block of ALL_BLOCKS) {
      if (block.waterfront && !view.blocks[block.id]?.locations.length)
        continue;
      const b = view.blocks[block.id];
      if (!b) continue;
      let color = "#000",
        opacity = 0;
      if (this.lens === "influence") {
        color = b.faction ? b.color : "#A8ADB3";
        opacity = b.faction ? 0.45 + b.strength * 0.35 : 0.15;
      } else if (this.lens === "police") {
        color =
          b.police >= 70 ? "#ff4a4a" : b.police >= 45 ? "#ffa84a" : "#7fb8ff";
        opacity = 0.3 + (b.police / 100) * 0.45;
      } else {
        const live = b.locations.filter((id) => view.places[id]?.live).length;
        color = live ? "#ffd27a" : "#2a2a2a";
        opacity = live ? 0.5 + Math.min(0.35, live * 0.15) : 0.12;
      }
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
      });
      const w = block.maxX - block.minX,
        d = block.maxZ - block.minZ;
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(w + 2.6, d + 2.6).rotateX(-Math.PI / 2),
        mat,
      );
      tile.position.set(
        (block.minX + block.maxX) / 2,
        0.29,
        (block.minZ + block.maxZ) / 2,
      );
      tile.renderOrder = 4;
      this.dynamic.add(tile);
      // A bright rim on the surrounding streets makes the lens read from afar.
      const rim = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: Math.min(1, opacity + 0.3),
        depthWrite: false,
        toneMapped: false,
      });
      const cx = (block.minX + block.maxX) / 2,
        cz = (block.minZ + block.maxZ) / 2;
      for (const [x, z, ww, dd] of [
        [cx, block.minZ - 0.9, w + 1.4, 0.5],
        [cx, block.maxZ + 0.9, w + 1.4, 0.5],
        [block.minX - 0.9, cz, 0.5, d + 1.4],
        [block.maxX + 0.9, cz, 0.5, d + 1.4],
      ]) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(ww, dd).rotateX(-Math.PI / 2),
          rim,
        );
        m.position.set(x, 0.31, z);
        m.renderOrder = 5;
        this.dynamic.add(m);
      }
      if (this.lens === "influence" && b.contested) pulse.push(mat);
    }
    if (pulse.length)
      this.dynamicAnimated.push((t) => {
        for (const m of pulse)
          m.color.set(
            Math.sin(t * 4) > 0 ? "#ff8a5a" : (m.userData.base ?? m.color),
          );
      });
    for (const m of pulse) m.userData.base = m.color.clone();
  }
  /** Quiet district outlines; the selected district reads brighter. */
  private districtOutlines(view: BoardView) {
    for (const id of ZONE_ORDER) {
      const d = DISTRICTS[id],
        sel = this.focus.zone === id;
      const mat = new THREE.MeshBasicMaterial({
        color: sel ? "#fff3d6" : "#e8dcc4",
        transparent: true,
        opacity: sel ? 0.85 : 0.22,
        toneMapped: false,
      });
      const W = d.maxX - d.minX,
        D = d.maxZ - d.minZ,
        t = sel ? 0.5 : 0.3;
      for (const [x, z, w, dd] of [
        [d.minX + W / 2, d.minZ, W, t],
        [d.minX + W / 2, d.maxZ, W, t],
        [d.minX, d.minZ + D / 2, t, D],
        [d.maxX, d.minZ + D / 2, t, D],
      ]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, dd), mat);
        m.position.set(x, 0.07, z);
        this.dynamic.add(m);
      }
      void view;
    }
  }
  private police(view: BoardView) {
    const units: Mover[] = [];
    const r = rng(view.day * 13 + 5);
    for (const id of ZONE_ORDER) {
      const z = view.zones[id],
        d = DISTRICTS[id],
        s = this.streets[id];
      const n = Math.max(0, Math.round(z.police / 22));
      // Patrols circle the sections, on the streets around them.
      const routes = s.sections.map((sec) =>
        loop(
          rectLoop(
            sec.minX + 0.3,
            sec.minZ + 0.3,
            sec.maxX - 0.3,
            sec.maxZ - 0.3,
          ),
        ),
      );
      for (let i = 0; i < n; i++) {
        const route = routes[i % routes.length];
        units.push({ ...route, t: r() * route.total, speed: 5 + r() * 2 });
      }
    }
    if (!units.length) return;
    const cars = new THREE.InstancedMesh(
      this.carGeometry(),
      this.plainMat,
      units.length,
    );
    units.forEach((_, i) =>
      cars.setColorAt(i, col(i % 2 ? "#e9e9e9" : "#1d2026")),
    );
    const red = new THREE.MeshBasicMaterial({
      color: "#ff2a2a",
      toneMapped: false,
    });
    const blue = new THREE.MeshBasicMaterial({
      color: "#2a5cff",
      toneMapped: false,
    });
    const bar = new THREE.BoxGeometry(0.16, 0.12, 0.26);
    let barY = 0.82;
    this.vehicle(MODEL_FILES.policeCruiser, cars, (v) => {
      barY = v.geometry.boundingBox!.max.y - 0.05;
    });
    const reds = new THREE.InstancedMesh(bar, red, units.length);
    const blues = new THREE.InstancedMesh(bar.clone(), blue, units.length);
    const glowMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: "#ff3a3a",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      glowMat,
      units.length,
    );
    this.dynamic.add(cars, reds, blues, glows);
    const tmp = { x: 0, z: 0, heading: 0 };
    this.dynamicAnimated.push((t, dt) => {
      const on = Math.floor(t * 5) % 2 === 0;
      red.color.setRGB(on ? 1 : 0.18, 0.05, 0.05);
      blue.color.setRGB(0.05, 0.12, on ? 0.18 : 1);
      glowMat.color.set(on ? "#ff3030" : "#3060ff");
      glowMat.opacity =
        0.6 * (this.time === "day" ? 0.25 : this.time === "dusk" ? 0.7 : 1);
      units.forEach((u, i) => {
        u.t += u.speed * dt;
        sample(u, tmp);
        cars.setMatrixAt(i, placed(tmp.x, 0, tmp.z, 1, 1, 1, tmp.heading));
        const s = Math.sin(tmp.heading),
          c = Math.cos(tmp.heading);
        reds.setMatrixAt(
          i,
          placed(
            tmp.x - 0.1 * c + 0.14 * s,
            barY,
            tmp.z + 0.1 * s + 0.14 * c,
            1,
            1,
            1,
            tmp.heading,
          ),
        );
        blues.setMatrixAt(
          i,
          placed(
            tmp.x - 0.1 * c - 0.14 * s,
            barY,
            tmp.z + 0.1 * s - 0.14 * c,
            1,
            1,
            1,
            tmp.heading,
          ),
        );
        glows.setMatrixAt(i, placed(tmp.x, 0.09, tmp.z, 4.5, 1, 4.5));
      });
      for (const m of [cars, reds, blues, glows])
        m.instanceMatrix.needsUpdate = true;
    });
  }
  /** Foot traffic follows civilian support; crowds gather at faction places. */
  private people(view: BoardView) {
    const walkers: Mover[] = [];
    const r = rng(view.day * 7 + 3);
    for (const id of ZONE_ORDER) {
      const z = view.zones[id];
      const blocks = ALL_BLOCKS.filter((b) => b.zone === id && !b.waterfront);
      const n = Math.round(
        8 + (z.support / 100) * 22 + (z.commerce / 100) * 10,
      );
      for (let i = 0; i < n && blocks.length; i++) {
        const b = blocks[Math.floor(r() * blocks.length)];
        const route = loop(
          rectLoop(b.minX + 0.3, b.minZ + 0.3, b.maxX - 0.3, b.maxZ - 0.3),
        );
        walkers.push({
          ...route,
          t: r() * route.total,
          speed: (0.5 + r() * 0.6) * (r() < 0.5 ? 1 : -1),
        });
      }
    }
    const crowd: [number, number, string][] = [];
    const civilian = ["#2b2f36", "#d8d2c4", "#3a5a7a", "#1f1f1f", "#6a6a6a"];
    for (const l of LOCATIONS) {
      const b = locationBlock(l);
      const bv = b ? view.blocks[b.id] : null;
      const z = view.zones[l.zone];
      const faction = l.faction ?? bv?.faction ?? null;
      const busy =
        l.kind === "street" || l.kind === "transit"
          ? z.streetActivity / 100
          : l.kind === "hangout"
            ? 0.6
            : l.kind === "store" || l.kind === "liquor"
              ? 0.35
              : 0;
      const n = Math.round(
        busy *
          6 *
          (faction && bv?.faction === faction ? 0.6 + bv.strength * 0.6 : 0.7),
      );
      const [lx, lz] = locationPosition(l);
      const front = b ? b.maxZ + 0.6 : lz + 3;
      for (let i = 0; i < n; i++)
        crowd.push([
          lx + (r() - 0.5) * 3.4,
          front + (r() - 0.5) * 0.8,
          faction && r() < 0.65 ? TAGS[faction].cloth[0] : pick(r, civilian),
        ]);
    }
    const total = walkers.length + crowd.length;
    if (!total) return;
    const geo = new THREE.CapsuleGeometry(0.17, 0.42, 2, 5).translate(
      0,
      0.38,
      0,
    );
    const people = new THREE.InstancedMesh(geo, this.plainMat, total);
    const clothes = [
      "#2b2f36",
      "#7a2f2f",
      "#d8d2c4",
      "#3a5a7a",
      "#a87a3a",
      "#4a3a5a",
      "#1f1f1f",
      "#c9a04a",
    ];
    for (let i = 0; i < total; i++)
      people.setColorAt(
        i,
        col(
          i >= walkers.length ? crowd[i - walkers.length][2] : pick(r, clothes),
        ),
      );
    crowd.forEach(([x, z], i) =>
      people.setMatrixAt(walkers.length + i, placed(x, CURB, z)),
    );
    this.dynamic.add(people);
    const tmp = { x: 0, z: 0, heading: 0 };
    this.dynamicAnimated.push((_, dt) => {
      walkers.forEach((w, i) => {
        w.t += w.speed * dt;
        sample(w, tmp);
        people.setMatrixAt(i, placed(tmp.x, CURB, tmp.z));
      });
      people.instanceMatrix.needsUpdate = true;
    });
  }
  private beacons(view: BoardView) {
    for (const l of LOCATIONS) {
      const st = view.places[l.id];
      if (!st?.owned && !st?.employed && !st?.home) continue;
      const [x, z] = locationPosition(l);
      const color = st.owned
        ? view.playerAccent
        : st.employed
          ? "#f5e6c8"
          : view.playerAccent;
      const h = st.owned ? 26 : st.employed ? 16 : 10;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.9, h, 10, 1, true).translate(
          0,
          h / 2,
          0,
        ),
        mat,
      );
      beam.position.set(x, 0, z);
      this.dynamic.add(beam);
      this.dynamicAnimated.push((t) => {
        mat.opacity = 0.25 + 0.12 * Math.sin(t * 2 + x);
      });
    }
  }
  private rebuildFocus() {
    this.clear(this.focusLayer);
    this.focusAnimated = [];
    const ringMat = new THREE.MeshBasicMaterial({
      color: "#fff3d6",
      transparent: true,
      toneMapped: false,
      depthWrite: false,
    });
    const block = this.focus.block ? blockById(this.focus.block) : null;
    if (block) {
      const W = block.maxX - block.minX + 1.4,
        D = block.maxZ - block.minZ + 1.4,
        cx = (block.minX + block.maxX) / 2,
        cz = (block.minZ + block.maxZ) / 2;
      for (const [x, z, w, d] of [
        [cx, cz - D / 2, W, 0.35],
        [cx, cz + D / 2, W, 0.35],
        [cx - W / 2, cz, 0.35, D],
        [cx + W / 2, cz, 0.35, D],
      ]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), ringMat);
        m.position.set(x, 0.32, z);
        this.focusLayer.add(m);
      }
    }
    const place = this.focus.place
      ? LOCATIONS.find((l) => l.id === this.focus.place)
      : null;
    if (place) {
      const [x, z] = locationPosition(place);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.6, 4.1, 40).rotateX(-Math.PI / 2),
        ringMat,
      );
      ring.position.set(x, 0.34, z);
      this.focusLayer.add(ring);
    }
    if (block || place)
      this.focusAnimated.push((t) => {
        ringMat.opacity = 0.55 + 0.4 * Math.sin(t * 4);
      });
  }

  private buildToken() {
    this.setAppearance(DEFAULT_APPEARANCE);
    this.tokenRing = new THREE.MeshBasicMaterial({
      color: "#fff3d6",
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 32).rotateX(-Math.PI / 2),
      this.tokenRing,
    );
    ring.position.y = 0.32;
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshBasicMaterial({ color: "#fff3d6", toneMapped: false }),
    );
    marker.position.y = 2.7;
    this.tokenBody.scale.setScalar(0.85);
    this.token.add(this.tokenBody, ring, marker);
    this.token.position.set(0, 0, 60);
    this.scene.add(this.token);
    this.animated.push((t, dt) => {
      marker.position.y = 2.7 + Math.sin(t * 3) * 0.18;
      marker.rotation.y += dt * 2;
      this.tokenRing.opacity = 0.6 + 0.3 * Math.sin(t * 4);
      const w = this.tokenWalk;
      if (!w) return;
      // Distance reads on screen without becoming downtime: a short hop takes
      // under a second, crossing the whole city about two and a half.
      w.t = Math.min(
        w.total,
        w.t + dt * (w.total / THREE.MathUtils.clamp(w.total / 90, 0.8, 2.6)),
      );
      let d = w.t;
      for (let i = 1; i < w.path.length; i++) {
        const [ax, az] = w.path[i - 1],
          [bx, bz] = w.path[i];
        const l = Math.hypot(bx - ax, bz - az);
        if (d <= l || i === w.path.length - 1) {
          const f = l ? Math.min(1, d / l) : 1;
          this.token.position.set(
            ax + (bx - ax) * f,
            Math.abs(Math.sin(w.t * 2.2)) * 0.12,
            az + (bz - az) * f,
          );
          this.faceToward(bx - ax, bz - az);
          break;
        }
        d -= l;
      }
      if (w.t >= w.total) {
        this.tokenWalk = null;
        this.token.position.y = 0;
        this.tokenBody.rotation.y = 0;
        w.done();
      }
    });
  }

  // ---- camera & input ------------------------------------------------------------
  private flyTo(x: number, z: number, d: number, yaw = this.yaw) {
    this.flight = {
      from: {
        x: this.target.x,
        z: this.target.z,
        d: this.distance,
        yaw: this.yaw,
      },
      to: { x, z, d, yaw },
      t: 0,
    };
    this.wake();
  }
  private pitch() {
    const f = THREE.MathUtils.clamp((this.distance - 30) / 180, 0, 1);
    return THREE.MathUtils.lerp(0.42, 0.68, f);
  }
  private applyViewOffset() {
    const w = this.host?.clientWidth || 1,
      h = this.host?.clientHeight || 1;
    const visibleCenter =
      this.insets.top + (h - this.insets.top - this.insets.bottom) / 2;
    const dy = h / 2 - visibleCenter;
    if (Math.abs(dy) < 1) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, dy, w, h);
    this.camera.updateProjectionMatrix();
  }
  private updateCamera() {
    const p = this.pitch();
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(p),
      Math.sin(p),
      Math.cos(this.yaw) * Math.cos(p),
    ).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    this.sky.position.copy(this.camera.position);
  }
  private ray(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  private groundAt(clientX: number, clientY: number) {
    this.ray(clientX, clientY);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit)
      ? hit
      : null;
  }
  private bindInput(el: HTMLCanvasElement) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.flight = null;
      this.onInteract();
      if (this.pointers.size === 1)
        this.gesture = {
          moved: 0,
          start: performance.now(),
          groundStart: this.groundAt(e.clientX, e.clientY) ?? undefined,
        };
      else if (this.pointers.size === 2 && this.gesture) {
        const [a, b] = [...this.pointers.values()];
        this.gesture.pinch = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          distance: this.distance,
          yaw: this.yaw,
        };
        this.gesture.moved = 99;
      }
      this.wake();
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId) || !this.gesture) return;
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = this.gesture;
      g.moved += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      if (this.pointers.size >= 2 && g.pinch) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y),
          angle = Math.atan2(b.y - a.y, b.x - a.x);
        this.distance = THREE.MathUtils.clamp(
          (g.pinch.distance * g.pinch.dist) / Math.max(dist, 1),
          22,
          420,
        );
        this.yaw = g.pinch.yaw - (angle - g.pinch.angle);
      } else if (e.buttons === 2 || e.shiftKey) {
        this.yaw -= (e.clientX - prev.x) * 0.008;
      } else if (g.groundStart) {
        this.updateCamera();
        const now = this.groundAt(e.clientX, e.clientY);
        if (now) {
          const delta = g.groundStart.clone().sub(now);
          this.target.x = THREE.MathUtils.clamp(
            this.target.x + delta.x,
            BOARD.minX,
            BOARD.maxX,
          );
          this.target.z = THREE.MathUtils.clamp(
            this.target.z + delta.z,
            BOARD.minZ,
            BOARD.maxZ,
          );
        }
      }
      this.wake();
    });
    const end = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (g && this.pointers.size === 0) {
        if (g.moved < 10 && performance.now() - g.start < 500)
          this.pickAt(e.clientX, e.clientY);
        this.gesture = null;
      } else if (g && this.pointers.size === 1) {
        const [p] = [...this.pointers.values()];
        g.pinch = undefined;
        g.groundStart = this.groundAt(p.x, p.y) ?? undefined;
      }
      this.wake();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.flight = null;
        this.distance = THREE.MathUtils.clamp(
          this.distance * Math.exp(e.deltaY * 0.0012),
          22,
          420,
        );
        this.wake();
      },
      { passive: false },
    );
  }
  /**
   * Tap rules: far away a tap picks a district; closer it picks a block;
   * close enough to read signs it picks the place itself.
   */
  private pickAt(clientX: number, clientY: number) {
    this.ray(clientX, clientY);
    if (this.distance < 120) {
      const hit = this.raycaster.intersectObjects(this.placePickers, false)[0];
      if (hit) {
        const l = LOCATIONS.find((l) => l.id === hit.object.userData.place)!;
        this.onPick({
          zone: l.zone,
          block: locationBlock(l)?.id ?? null,
          place: l.id,
        });
        return;
      }
    }
    const ground = this.groundAt(clientX, clientY);
    if (!ground) return;
    const block = blockAt(ground.x, ground.z);
    const zone =
      block?.zone ??
      ZONE_ORDER.find((id) => {
        const d = DISTRICTS[id];
        return (
          ground.x >= d.minX &&
          ground.x <= d.maxX &&
          ground.z >= d.minZ &&
          ground.z <= d.maxZ
        );
      }) ??
      null;
    if (!zone) return this.onPick({ zone: null, block: null, place: null });
    if (this.distance < 150 && block && this.focus.zone === zone)
      this.onPick({ zone, block: block.id, place: null });
    else this.onPick({ zone, block: null, place: null });
  }

  // ---- loop -----------------------------------------------------------------------
  private onVisibility = () => {
    if (!document.hidden) this.start();
  };
  private wake() {
    this.lastActive = performance.now();
    this.start();
  }
  private start() {
    if (this.running || this.disposed || this.paused) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    if (document.hidden || !this.visible || this.paused) {
      this.running = false;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
    const active =
      now - this.lastActive < 1200 ||
      this.pointers.size > 0 ||
      !!this.flight ||
      !!this.tokenWalk;
    if (!active && (this.lite || this.eco || this.reducedMotion)) {
      this.running = false;
      cancelAnimationFrame(this.frame);
      return;
    }
    if (!active && now - this.lastFrame < 32) return;
    const interval = now - this.lastFrame;
    // Only judge frames drawn back to back (not the first after a wake).
    if (active && interval < 1000) this.watchFrame(interval, now);
    const dt = Math.min(0.1, interval / 1000);
    this.lastFrame = now;
    this.clock += dt;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / 0.9);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.target.x = THREE.MathUtils.lerp(f.from.x, f.to.x, e);
      this.target.z = THREE.MathUtils.lerp(f.from.z, f.to.z, e);
      this.distance = THREE.MathUtils.lerp(f.from.d, f.to.d, e);
      this.yaw = THREE.MathUtils.lerp(f.from.yaw, f.to.yaw, e);
      if (f.t >= 1) this.flight = null;
    }
    for (const a of this.animated) a(this.clock, dt);
    for (const a of this.dynamicAnimated) a(this.clock, dt);
    for (const a of this.focusAnimated) a(this.clock, dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.positionOverlays();
    if (Math.abs(this.distance - this.lastLevelDistance) > 4) {
      this.lastLevelDistance = this.distance;
      this.onLevel(this.distance);
    }
  };
  private positionOverlays() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight,
      v = new THREE.Vector3();
    for (const o of this.overlays) {
      v.copy(o.position).project(this.camera);
      const far =
        (o.maxDistance !== undefined && this.distance > o.maxDistance) ||
        (o.minDistance !== undefined && this.distance < o.minDistance);
      const x = (v.x * 0.5 + 0.5) * w,
        y = (-v.y * 0.5 + 0.5) * h;
      const off =
        v.z > 1 ||
        far ||
        x < -40 ||
        x > w + 40 ||
        y - (o.clearance ?? 0) < this.insets.top - 6 ||
        y > h - this.insets.bottom + 30;
      o.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      o.element.style.opacity = off ? "0" : "1";
      o.element.style.pointerEvents = off ? "none" : "";
      o.element.style.visibility = off ? "hidden" : "visible";
    }
  }
}

export function placeHeight(l: LocationDef) {
  switch (l.archetype) {
    case "towers":
      return 18.5;
    case "projects":
      return 11;
    case "cityhall":
      return 9;
    case "station":
      return 7.6;
    case "watertower":
      return 15;
    case "mission":
    case "church":
      return 7;
    case "docks":
      return 6;
    default:
      return l.zone === "downtown" ? 6.5 : l.zone === "nawf" ? 4.8 : 3.2;
  }
}
