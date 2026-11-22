// Tiling textures (asphalt, sidewalk, concrete, brick, fence, foliage...) are not
// embedded in each GLB: the art pipeline (art/reservoir/README.md, share_textures.mjs)
// moves them to assets/tex/ and leaves material.userData.shared naming what each slot
// needs. Each file is downloaded once and every material gets the same GPU texture.
import * as THREE from "three";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

type Slot = "map" | "normalMap" | "emissiveMap";
interface SharedSpec { map?: string; normalMap?: string; emissiveMap?: string; normalScale?: number }

export function createSharedTextures(ktx2: KTX2Loader, base: string, anisotropy: number) {
  const cache = new Map<string, Promise<THREE.Texture>>();
  const get = (name: string, slot: Slot) => {
    let p = cache.get(name);
    if (!p) {
      p = ktx2.loadAsync(`${base}${name}.ktx2`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = slot === "normalMap" ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.anisotropy = anisotropy;
        t.needsUpdate = true;
        return t;
      });
      cache.set(name, p);
    }
    return p;
  };
  /** Resolve every shared texture a loaded scene asks for. */
  return async function attach(root: THREE.Object3D) {
    const jobs: Promise<void>[] = [];
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const raw of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = raw as THREE.MeshStandardMaterial;
        const spec = m.userData.shared as SharedSpec | undefined;
        if (!spec || seen.has(m)) continue;
        seen.add(m);
        for (const slot of ["map", "normalMap", "emissiveMap"] as Slot[]) {
          const name = spec[slot];
          if (!name) continue;
          jobs.push(get(name, slot).then((t) => {
            m[slot] = t;
            if (slot === "normalMap" && spec.normalScale !== undefined) m.normalScale.set(spec.normalScale, spec.normalScale);
            m.needsUpdate = true;
          }));
        }
      }
    });
    await Promise.all(jobs);
  };
}
