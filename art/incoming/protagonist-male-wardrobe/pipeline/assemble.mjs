import { BufferAttribute, Skeleton } from 'three';

export function findSkin(scene, name) {
  let mesh;
  scene.traverse((child) => {
    if (child.isSkinnedMesh && (!name || child.name === name)) mesh = child;
  });
  if (!mesh) throw new Error(`Skinned mesh missing: ${name ?? 'first'}`);
  return mesh;
}

export function bindToBody(body, accessory) {
  const sharedBones = new Map(body.skeleton.bones.map((bone) => [bone.name, bone]));
  const bones = accessory.skeleton.bones.map((bone) => sharedBones.get(bone.name));
  if (bones.some((bone) => !bone)) throw new Error('Wearable references a bone outside the canonical rig');
  const inverses = accessory.skeleton.boneInverses;
  const bindMatrix = accessory.bindMatrix.clone();
  body.parent.add(accessory);
  // Optimization stores each wearable's POSITION decode in its inverse binds.
  // Reuse the canonical live bones with the wearable's own ordered inverse binds.
  accessory.bind(new Skeleton(bones, inverses), bindMatrix);
  accessory.frustumCulled = false;
  return accessory;
}

export function createWardrobe(body, masks, verifiedBodySha256) {
  const base = body.geometry;
  const indices = base.getIndex()?.array;
  if (masks.bodySha256 !== verifiedBodySha256 || !indices || indices.length !== masks.indexCount) {
    throw new Error('Body geometry differs from the validated wardrobe mask target');
  }
  const slots = new Map();
  let masked;
  let underlay;

  function restoreUnderlay() {
    if (!underlay) return;
    underlay.mesh.geometry.dispose();
    underlay.mesh.geometry = underlay.base;
    underlay = undefined;
  }

  function updateBody() {
    restoreUnderlay();
    masked?.dispose();
    masked = undefined;
    body.geometry = base;
    if (!slots.size) return;
    const hidden = new Uint8Array(indices.length / 3);
    const outerwear = slots.get('outerwear');
    const hideTop = outerwear && masks.wearables[outerwear.id].coversTop;
    for (const [slot, { id, mesh }] of slots) {
      mesh.visible = !(slot === 'top' && hideTop);
      if (!mesh.visible) continue;
      for (const [start, count] of masks.wearables[id].ranges) hidden.fill(1, start, start + count);
    }
    const visible = new indices.constructor(indices.length - hidden.reduce((a, b) => a + 3 * b, 0));
    for (let i = 0, out = 0; i < hidden.length; i++) {
      if (hidden[i]) continue;
      visible.set(indices.subarray(i * 3, i * 3 + 3), out);
      out += 3;
    }
    masked = base.clone();
    masked.setIndex(new BufferAttribute(visible, 1));
    body.geometry = masked;

    const top = slots.get('top');
    const exposed = top && outerwear && masks.wearables[outerwear.id].visibleTopRanges?.[top.id];
    if (top?.mesh.visible && exposed) {
      const mesh = top.mesh;
      const base = mesh.geometry;
      const indices = base.getIndex().array;
      const visibleIndices = new indices.constructor(exposed.reduce((sum, [, count]) => sum + count * 3, 0));
      let offset = 0;
      for (const [start, count] of exposed) {
        const end = (start + count) * 3;
        if (end > indices.length) throw new Error('Top geometry differs from the jacket underlay target');
        visibleIndices.set(indices.subarray(start * 3, end), offset);
        offset += count * 3;
      }
      const geometry = base.clone();
      geometry.setIndex(new BufferAttribute(visibleIndices, 1));
      mesh.geometry = geometry;
      underlay = { mesh, base };
    }
  }

  return {
    equip(id, gltf) {
      const record = masks.wearables[id];
      if (!record) throw new Error(`Unknown wearable: ${id}`);
      const mesh = findSkin(gltf.scene, id);
      bindToBody(body, mesh);
      slots.get(record.slot)?.mesh.removeFromParent();
      slots.set(record.slot, { id, mesh });
      updateBody();
      return mesh;
    },
    remove(slot) {
      slots.get(slot)?.mesh.removeFromParent();
      slots.delete(slot);
      updateBody();
    },
  };
}
