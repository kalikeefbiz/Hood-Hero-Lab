import * as THREE from "three";
import { buildFigure } from "./character";
import { DEFAULT_APPEARANCE } from "./presence";
/** Presentation only: no resolver callbacks, RNG, or game-state writes. */
export interface SessionVisitor {
  id: string;
  location: string;
  duration: number;
  kind: "buyer" | "pass" | "witness" | "rival" | "patrol";
}
export function visitorPhase(t: number) {
  return t < 0.35
    ? "approaching"
    : t < 0.68
      ? "interacting"
      : t < 1
        ? "leaving"
        : "gone";
}
export class SessionVisitors {
  readonly root = new THREE.Group();
  private visitor: THREE.Group | null = null;
  private elapsed = 0;
  private duration = 7.2;
  private at = new THREE.Vector3();
  private reduced = false;
  get active() {
    return !!this.visitor && this.elapsed < this.duration;
  }
  set(v: SessionVisitor | null, player: THREE.Vector3, reduced = false) {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material))
        mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
    });
    this.root.clear();
    this.visitor = null;
    this.reduced = reduced;
    if (!v) return;
    const figure = buildFigure({
      ...DEFAULT_APPEARANCE,
      top: "tee",
      topColor:
        v.kind === "patrol"
          ? "#263e79"
          : v.kind === "rival"
            ? "#86434f"
            : v.kind === "witness"
              ? "#aca081"
              : "#6c8794",
      chain: false,
    });
    figure.name = `session-visitor:${v.id}`;
    figure.scale.setScalar(0.85);
    this.root.add(figure);
    this.visitor = figure;
    this.at.copy(player);
    this.elapsed = 0;
    this.duration = v.duration / 1000;
    this.update(0);
  }
  update(dt: number) {
    if (!this.visitor) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration),
      phase = visitorPhase(t);
    const offset =
      t < 0.35
        ? 9 - (t / 0.35) * 7.6
        : t < 0.68
          ? 1.4
          : 1.4 + ((t - 0.68) / 0.32) * 9;
    this.visitor.position.set(
      this.at.x + (this.reduced ? 1.4 : offset),
      this.at.y,
      this.at.z + 0.6,
    );
    this.visitor.rotation.y = phase === "leaving" ? Math.PI / 2 : -Math.PI / 2;
    this.visitor.visible = phase !== "gone";
    this.visitor.userData.phase = phase;
  }
}
