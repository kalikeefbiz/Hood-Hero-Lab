// Floating markers over the city's interaction points, so a player can see at a glance which
// buildings do something. One sprite per anchor, constant size on screen, faded with distance.
// Picking is done in screen space with a generous radius (thumb-sized), not by ray-hitting
// the tiny sprite.
import * as THREE from "three";
import type { CityAnchor } from "./anchors";

const STYLE: Record<string, { fill: string; ring: string; glyph: string }> = {
  place: { fill: "#f0c24b", ring: "#1a1406", glyph: "●" },
  household: { fill: "#5fd0c0", ring: "#06201c", glyph: "⌂" },
  lead: { fill: "#e0675a", ring: "#250906", glyph: "◆" },
  home: { fill: "#c9ccd6", ring: "#15171c", glyph: "⌂" },
  storefront: { fill: "#7c818c", ring: "#15171c", glyph: "▪" },
};
const styleOf = (a: CityAnchor) =>
  a.kind === "home" ? (a.household ? "household" : a.targetId ? "lead" : "home") : a.kind;

/** Labels show for places and named households; plain homes stay a dot to keep streets readable. */
const labelOf = (a: CityAnchor) =>
  a.kind === "place" ? a.label
  : a.household && (a.household.id === "household.lewis" || a.household.id === "household.splash-gang") ? a.label.split(" · ").pop()!
  : a.kind === "storefront" ? a.label
  : "";

function pinTexture(style: string, label: string) {
  const s = STYLE[style];
  const H = 64, pad = 10, font = "600 26px system-ui, sans-serif";
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = font;
  const textW = label ? Math.ceil(g.measureText(label).width) + 18 : 0;
  c.width = H + textW + (label ? pad : 0);
  c.height = H;
  g.font = font;
  if (label) {
    g.fillStyle = "rgba(12,13,17,0.82)";
    g.beginPath();
    g.roundRect(H / 2, 10, c.width - H / 2 - 2, H - 20, 22);
    g.fill();
    g.fillStyle = style === "storefront" ? "#b8bcc6" : "#f4f2ec";
    g.textBaseline = "middle";
    g.fillText(label, H + 4, H / 2 + 1);
  }
  g.fillStyle = s.ring;
  g.beginPath(); g.arc(H / 2, H / 2, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = s.fill;
  g.beginPath(); g.arc(H / 2, H / 2, 21, 0, Math.PI * 2); g.fill();
  g.fillStyle = s.ring;
  g.font = "700 24px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(s.glyph, H / 2, H / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: c.width / c.height, dotFrac: H / c.width };
}

export interface ExtraPin { anchor: CityAnchor; style: string; label: string; y: number }
interface Pin { anchor: CityAnchor; sprite: THREE.Sprite; aspect: number; dotFrac: number; px: number }

export class Pins {
  readonly group = new THREE.Group();
  private pins: Pin[] = [];
  private selected: string | null = null;
  private tmp = new THREE.Vector3();

  constructor(anchors: readonly CityAnchor[], opts: { extra?: ExtraPin[] } = {}) {
    for (const a of anchors) {
      if (a.kind === "npc" || a.kind === "gathering") continue;
      const style = styleOf(a);
      this.add(a, style, labelOf(a), a.kind === "home" ? 3.1 : 3.7, a.kind === "home" ? 26 : 34);
    }
    for (const e of opts.extra ?? []) this.add(e.anchor, e.style, e.label, e.y, 26);
    this.group.renderOrder = 998;
  }

  private add(anchor: CityAnchor, style: string, label: string, y: number, px: number) {
    const { tex, aspect, dotFrac } = pinTexture(style, label);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    // Anchor the sprite at its dot (left end) so the label hangs to the right of the door.
    sprite.center.set(dotFrac / 2, 0.5);
    sprite.position.set(anchor.x, y, anchor.z);
    sprite.renderOrder = 998;
    sprite.userData.anchorId = anchor.id;
    this.group.add(sprite);
    this.pins.push({ anchor, sprite, aspect, dotFrac, px });
  }

  /** Keep pins a fixed pixel size and fade far ones. Call on resize and when the camera moves. */
  update(camera: THREE.PerspectiveCamera, focus: THREE.Vector3, viewH: number) {
    const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewH;
    for (const p of this.pins) {
      const d = Math.hypot(p.anchor.x - focus.x, p.anchor.z - focus.z);
      const sel = p.anchor.id === this.selected;
      const near = d < 48 || sel;
      p.sprite.visible = near;
      if (!near) continue;
      const h = p.px * (sel ? 1.3 : 1) * unitsPerPx;
      p.sprite.scale.set(h * p.aspect, h, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = sel ? 1 : THREE.MathUtils.clamp(1.25 - d / 48, 0.35, 1);
    }
  }

  select(id: string | null) { this.selected = id; }

  /** The anchor whose dot is nearest the tap, within `radiusPx` (default 30 px = 60 px target). */
  pick(clientX: number, clientY: number, camera: THREE.Camera, w: number, h: number, radiusPx = 30): CityAnchor | null {
    let best: Pin | null = null, bestD = radiusPx;
    for (const p of this.pins) {
      if (!p.sprite.visible) continue;
      this.tmp.copy(p.sprite.position).project(camera);
      if (this.tmp.z > 1) continue;
      const sx = (this.tmp.x + 1) / 2 * w, sy = (1 - this.tmp.y) / 2 * h;
      // Labels are tappable too: treat the label's span to the right of the dot as part of the target.
      const labelW = (p.aspect - 1) * p.px;
      const dx = clientX < sx ? sx - clientX : Math.max(0, clientX - sx - labelW);
      const d = Math.hypot(dx, clientY - sy);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best?.anchor ?? null;
  }

  /** Screen position of an anchor's pin, for tests and overlays. */
  screenOf(id: string, camera: THREE.Camera, w: number, h: number) {
    const p = this.pins.find((q) => q.anchor.id === id);
    if (!p) return null;
    this.tmp.copy(p.sprite.position).project(camera);
    return { x: (this.tmp.x + 1) / 2 * w, y: (1 - this.tmp.y) / 2 * h, visible: p.sprite.visible && this.tmp.z < 1 };
  }
}
