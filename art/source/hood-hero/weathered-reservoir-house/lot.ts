import * as THREE from "three";
import { loadHouseTextures, randomSource, SurfaceBatch, tile } from "./house";

export const pavementHeight = 0.055;
export const pavementStart = 3.3;
export const pavementEnd = 5.18;

export function createShowcaseLot(
  textures: Awaited<ReturnType<typeof loadHouseTextures>>,
) {
  const group = new THREE.Group();
  group.name = "Reservoir test lot";
  const ground = new SurfaceBatch(),
    greenery = new SurfaceBatch(),
    fences = new SurfaceBatch();
  const world = (x: number, y: number, z: number): [number, number, number] => [
    x,
    y,
    z,
  ];
  const random = randomSource(731012);
  const color = (hex: number, variance = 0.14) =>
    new THREE.Color(hex).multiplyScalar(1 + variance * (random() - 0.5));
  const damp = new THREE.Color(0x8d8d78);
  const soil = new THREE.Color(0xbeb69e);
  const tarmac = new THREE.Color(0x656164);
  const concrete = new THREE.Color(0xf0e2ce);
  for (let x = -48; x < 48; x += 4) {
    for (let z = -48; z < 40; z += 4) {
      const rect: [number, number, number, number] =
        random() > 0.5 ? [0.03, 0.03, 0.97, 0.97] : [0.97, 0.97, 0.03, 0.03];
      const tint = Math.abs(x + 2) < 8 && z > -16 && z < 5 ? soil : damp;
      ground.quad(
        [
          [x, -0.013, z + 4],
          [x + 4, -0.013, z + 4],
          [x + 4, -0.013, z],
          [x, -0.013, z],
        ],
        tile.soil,
        tint.clone().multiplyScalar(0.82 + random() * 0.19),
        rect,
      );
    }
  }
  for (let x = -39; x < 39; x += 2.02) {
    const center = x + 1;
    ground.box(
      world,
      center,
      -0.006,
      (pavementStart + pavementEnd) / 2,
      2,
      0.122,
      pavementEnd - pavementStart,
      tile.concrete,
      concrete.clone().multiplyScalar(0.83 + random() * 0.12),
      [0.111, 0.093, 0.21, 0.204],
    );
    ground.box(
      world,
      center,
      -0.027,
      pavementEnd + 0.11,
      2,
      0.23,
      0.19,
      tile.concrete,
      color(0xd2baa0),
      [0.113, 0.086, 0.22, 0.208],
    );
  }
  for (let x = -44; x < 44; x += 4) {
    for (let z = pavementEnd + 0.205; z < 14; z += 3) {
      ground.quad(
        [
          [x, -0.008, z + 3],
          [x + 4, -0.008, z + 3],
          [x + 4, -0.008, z],
          [x, -0.008, z],
        ],
        tile.soil,
        tarmac,
        [0.08, 0.16, 0.88, 0.88],
      );
    }
  }
  // Well-worn footpaths stay bare. Meadow grasses cluster along foundations and plot edges.
  const blade = new THREE.Color(0x88904a);
  for (let patch = 0; patch < 460; patch++) {
    const x = (random() - 0.5) * 37,
      z = -23 + random() * 26.2;
    if (Math.abs(x) < 3.28 && z <= 2.02 && z >= -8.62) continue;
    if (
      (Math.abs(x) < 1.32 && z > 1.8) ||
      (x > 3.14 && x < 4.68 && z > -7.75 && z < -4.5)
    )
      continue;
    if (Math.abs(x) < 5.6 && patch % 3 === 0) continue;
    const height = 0.05 + random() * random() * 0.29;
    const tint = blade.clone().lerp(new THREE.Color(0xb49b56), random());
    for (let b = 0; b < 4; b++) {
      const dx = (random() - 0.5) * 0.24,
        dz = (random() - 0.5) * 0.24;
      const width = 0.013 + random() * 0.017;
      const a = x + dx * 0.29,
        c = z + dz * 0.29;
      greenery.quad(
        [
          [a - width, -0.008, c],
          [a + width, -0.008, c],
          [a + dx + 0.003, height, c + dz],
          [a + dx - 0.003, height, c + dz],
        ],
        0,
        tint,
      );
    }
  }
  // Low timber yard fences sit clear of the walkable space.
  for (const offset of [-8.3, 7.9]) {
    const border = (
      u: number,
      y: number,
      d: number,
    ): [number, number, number] => [offset + d, y, -u];
    for (let z = -0.8; z <= 14; z += 0.18) {
      const h = 0.95 + 0.1 * random();
      fences.box(
        border,
        z,
        h / 2,
        0,
        0.163,
        h,
        0.034,
        tile.trim,
        color(0x876d55, 0.24),
        [0.1, 0.38, 0.94, 0.58],
        true,
      );
    }
    for (const y of [0.22, 0.73])
      fences.box(
        border,
        6.59,
        y,
        -0.061,
        14.84,
        0.099,
        0.095,
        tile.trim,
        color(0x6c5949),
      );
  }
  for (let x = -8.35; x < 8.0; x += 0.18) {
    const h = 1.05 + 0.12 * random();
    fences.box(
      world,
      x,
      h / 2,
      -14.03,
      0.158,
      h,
      0.041,
      tile.trim,
      color(0x7c6b55, 0.31),
      [0.04, 0.3, 0.94, 0.59],
      true,
    );
  }
  // Scale and sightline context at the far edges of the lot.
  const leaf = new THREE.MeshStandardMaterial({
    color: 0x5d673e,
    roughness: 1,
    flatShading: true,
  });
  const bark = new THREE.MeshStandardMaterial({
    color: 0x61523e,
    roughness: 1,
    flatShading: true,
  });
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const crowns = new THREE.InstancedMesh(crown, leaf, 18);
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.19, 1, 6),
    bark,
    6,
  );
  const marker = new THREE.Object3D();
  let i = 0;
  for (const [x, z] of [
    [-24.5, -17.2],
    [23.2, -18.5],
    [25.5, 1.5],
    [-27, -2.8],
    [12.15, -28.1],
    [-13.2, -29.5],
  ]) {
    const height = 2.8 + random() * 1.8;
    marker.position.set(x, height * 0.5, z);
    marker.scale.set(1, height, 1);
    marker.updateMatrix();
    trunks.setMatrixAt(i / 3, marker.matrix);
    for (let t = 0; t < 3; t++, i++) {
      marker.position.set(
        x + (random() - 0.5) * 1.6,
        height + 0.22 + t * 0.46,
        z + (random() - 0.5) * 1.6,
      );
      marker.scale.set(
        1.29 + random() * 0.39,
        1.3 + random() * 0.47,
        1.28 + random() * 0.41,
      );
      marker.rotation.y = random() * 6.2;
      marker.updateMatrix();
      crowns.setMatrixAt(i, marker.matrix);
      crowns.setColorAt(i, color(0xc3c997, 0.45));
    }
  }
  trunks.castShadow = crowns.castShadow = true;

  const material = new THREE.MeshStandardMaterial({
    ...textures,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const grass = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  group.add(
    ground.mesh("Soil, sidewalk and street", material, false),
    fences.mesh("Timber lot fences", material),
    greenery.mesh("Small dry grasses", grass, false),
    trunks,
    crowns,
  );
  return group;
}
