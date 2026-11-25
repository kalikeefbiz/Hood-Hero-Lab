# Male protagonist wardrobe · Round 5

The 18 wearables use the body and 36-joint rest rig from PR #79 at
`art/incoming/protagonist-male-rework/`. Each ID and equipment slot from PR #77
remains independently equippable. The source blends retain the original panels,
UVs and trim. The existing Round 5 body and animation clips supply all motion.

## Assembly

1. Load the Round 5 body, head and complexion with Three.js GLTFLoader,
   MeshoptDecoder and KTX2Loader. Check the body SHA-256 against
   [the manifest](manifest.json) before using [the masks](body-masks.json).
2. Equip each GLB using its ID. Bind its ordered inverse-bind palette and bind
   matrix to the live body bones by name. Meshopt's position decode is folded
   into the wearable's inverse binds. Keep the body as the only animation mixer.
3. Apply the union of the visible wearables' mask ranges to a copy of the
   original Body index. The ordinals target the exact Round 5 export. Restore the
   original index before recalculating the union on each swap. Closed outerwear
   hides the top until removed. The open windbreaker uses the
   `visibleTopRanges` for each supported T-shirt to keep the front visible
   through the placket. Removing it restores the full tee index.
4. The court shoes sit at the barefoot bind-pose ground plane. The sole
   offsets for open footwear are in the manifest. Open footwear keeps all foot
   skin visible. Hide hair when equipping the raised hood until the hairstyle
   has passed a fit check.

[Equipment assembly](pipeline/assemble.mjs) and the
[Three.js review](pipeline/round5-review.html) use those same bindings and masks.

## Fit and material production

Round 5 fitting transfers surface motion by matching the old and new body
triangles in Blender. Each pattern keeps its shape and gets local corrections
at the cuffs, collar, hem, seat, or sole. The skill's body-to-garment transfer
rebinds clothing to the Round 5 rest rig. The raised hood uses the existing
head joint. The feet use the existing foot and toe influences.

Dark fabrics and black footwear use charcoal values with the original seams
and prints. The base colors carry the original stitch and fold treatment with a
small relief contribution from the source normal maps. Both color and normal
textures are KTX2. The shared compressor's standard character invocation
with `0` strips normals. This wardrobe uses its existing `1` option to keep the
normal maps. The compressor removes any packed metallic-roughness map and
assigns metallic `0` and roughness `0.75`. The source materials use no packed
metallic-roughness maps. A wardrobe-local step restores each exported scalar
roughness value after compression.

The source blends use Blender 5.3.0 and the
[EL4CTEO Blender Skills pin](https://github.com/EL4CTEO/blender-skills/tree/1a1cc6c49312f9f370aae86f52b7b907f29c94f6).
This refit used zero Meshy credits.

## Review and reproduction

The [Round 5 review](validation/round5/REVIEW.md) links the comparison images
and Three.js recordings, with visible defects and coverage notes. Earlier
`previews/` and `validation/` files outside the Round 5 folders cover PR #77.

With Blender 5.3, the pinned skills checkout, Chromium, FFmpeg, Pillow, NumPy,
the repository npm dependencies and the compression dependencies in
`docs/CHARACTER_PIPELINE.md`, run the phases in order with
[pipeline/produce-round5.sh](pipeline/produce-round5.sh). The script takes a
scratch directory and one of `starter`, `tops`, `outerwear`, `bottoms`, or
`footwear`. It uses the PR #77 head as the default source. If your checkout lacks that commit, fetch
`codex/male-wardrobe-catalog` first. The script writes per-phase
masks, reports and source blends into the scratch directory along with the
review baseline and compressed GLBs. The delivery includes the combined
mask and packed starter and catalog blends. Run the Three.js capture with
the scratch directory's `baseline` folder as the first argument and a new
output directory as the second argument.

```sh
CHROMIUM_PATH=/usr/bin/chromium node \
  art/incoming/protagonist-male-wardrobe/pipeline/round5-review.mjs \
  /tmp/wardrobe-round5/baseline /tmp/wardrobe-round5/review starter
```
