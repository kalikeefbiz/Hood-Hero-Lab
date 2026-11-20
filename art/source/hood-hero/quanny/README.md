# Quanny: rigged character (v2, 2026-11-20)

Replaces the earlier Meshy auto-rigged Quanny. Same file names and same
`quanny` id, so `src/board/characterModels.ts` and `src/strip/layout.ts`
pick him up with no code change.

## Shipped files (`public/assets/models/characters/`)

| File | What | Size |
|---|---|---|
| `quanny.glb` | Mesh + skeleton, bind pose (T-pose), no clip. 35k triangles, one 1024 KTX2 (ETC1S) base-color texture, meshopt + quantized. | 727 KB |
| `quanny-walk.glb` | Skeleton + `Walk` clip only | 40 KB |
| `quanny-run.glb` | Skeleton + `Run` clip only | 36 KB |

Same extensions as every other board model: `EXT_meshopt_compression`,
`KHR_mesh_quantization`, `KHR_texture_basisu`. Load through the existing
`boardGltfLoader()` (KTX2 transcoder in `public/basis/`).

## Rig

32 bones, Mixamo-style names (the loader's `passingTime()` looks for
`LeftFoot` / `RightFoot`, which exist):

`Root > Hips > Spine > Spine1 > Spine2 > Neck > Head`,
`Left/Right` + `Shoulder, Arm, ForeArm, Hand, HandFingers1-2, HandThumb1-2`,
`Left/Right` + `UpLeg, Leg, Foot, ToeBase`, and `Bandana` (the bandana
hanging from his belt; animated with follow-through in both clips).

Real-world scale: he is 1.90 m tall in metres, Y-up, facing +Z. The board
rescales him to `FIGURE_HEIGHT` anyway.

## Clips

Both are in place (no root motion), loop seamlessly (first frame equals last
frame) and are sampled at 30 fps.

| Clip | Length | Ground speed to move the character at | Feel |
|---|---|---|---|
| `Walk` | 1.20 s (36 frames) | **0.92 m/s** at 1.90 m tall (1.10 m per cycle) | Confident street walk: pelvis drop and sway, counter-rotating shoulders, slight bounce, relaxed lagging arm swing, heel-to-toe roll, bandana swing |
| `Run` | 0.733 s (22 frames) | **2.73 m/s** at 1.90 m tall (2.0 m per cycle) | Easy street run: forward lean, flight phase, back-kick, bent-elbow arm pump |

If the board scales him to `FIGURE_HEIGHT`, scale the speed by the same
factor (`speed × FIGURE_HEIGHT / 1.90`) or the feet will slide. Planted feet
were verified to move at exactly constant ground speed with zero vertical
drift.

## Sources (this folder)

- `quanny_source.blend`: Blender 5.3 file with mesh, rig, weights and both
  actions (`Walk`, `Run`), textures packed.
- `quanny_master_uncompressed.glb`: uncompressed master (2048 textures incl.
  normal map, no clip) for close-up or offline use.
- `quanny_walk_preview.gif`, `quanny_run_preview.gif`: rendered previews.
- `pipeline/`: the scripts that built everything (Blender `bpy` + glTF
  Transform). `animate.py` is fully parameterised; the exact parameters
  used are in `walk_params.json` / `run_params.json`. New clips (idle,
  lean-on-wall, etc.) can be authored the same way on the same rig. Paths
  inside the scripts point at the original scratch folder; adjust before
  re-running.

The original 68 MB Meshy upload (`Blue_Bandana_Stance_Meshy_AI_2026-11-20`)
is not committed; it lives in the owner's Meshy account.
