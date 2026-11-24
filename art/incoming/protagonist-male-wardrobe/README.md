# Male protagonist wardrobe

The starter outfit includes the cotton crewneck `tee-white`, five-pocket
`jeans-denim-standard`, and leather `court-sneakers-white`. Each GLB is a
separate skinned visual component. [The manifest](manifest.json) records
version compatibility, body masks, layer fit, texture sizes and asset costs.

| Asset | Triangles | Materials | Base color and normal | Compressed bytes |
| --- | ---: | ---: | ---: | ---: |
| White T-shirt | 2,616 | 1 | 256 × 256 each | 136,948 |
| Standard jeans | 3,296 | 1 | 512 × 512 each | 385,728 |
| White court sneakers (pair) | 3,960 | 1 | 256 × 256 each | 144,360 |

The assembled player with face-01 and complexion-01 has 25,930 visible
triangles, five estimated material draws before shadow passes, and about 1.69 MB
of compressed assets. The wearable GLBs add about 667 KB to the existing
protagonist payload. The live animation mixer belongs to the body.

## Assembly for Claude

1. Load the body, head, and complexion through the same Three.js paths as
   the protagonist integration. The canonical input is the accepted
   `protagonist-male.glb` from PR #71. PR #74 moves that file into
   `public/assets/models/characters/protagonist-male/` at the same hash.
   [PR #71](https://github.com/kalikeefbiz/Hood-Hero-Lab/pull/71) ·
   [PR #74](https://github.com/kalikeefbiz/Hood-Hero-Lab/pull/74)
2. Use the project's Meshopt decoder and KTX2 loader for each equipped GLB.
   Find the wearable `SkinnedMesh` by its stable ID. Attach that mesh beside
   `Body`, map its ordered joints by name to the existing live body bones,
   and bind with its own inverse-bind palette and bind matrix. The compression
   pass folds the wearable's position quantization frame into those matrices.
   Each GLB includes 36 matching joint nodes for import and zero animation clips.
3. Apply the union of equipped `body-masks.json` entries to a geometry copy of
   the accepted `Body` primitive. The ranges are zero-based triangle ordinals
   in its original index buffer. Bind the mask to the specified body SHA-256
   and index count. Rebuild from the original indices when a slot changes.
   The collar, cuffs, hands and ankles keep a ring of canonical skin. A garment
   replacement removes the current mesh in that slot and applies its own mask.
4. Use the existing body mixer to play Idle, Walk, and Run. The sneakers put
   the soles approximately 23 mm beneath the barefoot bind-pose plane. If
   needed for presentation, apply a footwear-specific model lift in the
   avatar assembly without moving the controller or touching the clip tracks.

[Reference assembly code](pipeline/assemble.mjs) runs in the
[Three.js QA harness](pipeline/runtime-review.html). The baseline runtime
renders are in [previews/threejs](previews/threejs).
The low-top shoe geometry and white tee pattern are the bases for the planned
black colorways.

The starter outfit was fit as an untucked combination. The canonical Idle can
place fingertips at the outer jean hip. A narrow ankle ring can show between
the jeans and shoe collar during a stride. Deep stress poses place additional
demands on the knee and underarm fabric. The Blender poke scan is a
bidirectional ray test that can register interior surfaces and nearby openings,
so use the rendered poses to locate exposed intersections.

## Editable source and production

`source/male-starter-outfit.blend` contains independent editable mesh objects,
packed texture maps and the canonical rest rig used by their Armature
modifiers. To animate in Blender, use the build staging blend that has the
accepted body and original actions. Production uses Blender 5.3.0 and Blender
Skills commit `1a1cc6c49312f9f370aae86f52b7b907f29c94f6`, release 1.3.3.
Meshy spend was **0 credits**.

The build drafts joined quad panels around the actual body, with openings and
trim topology. Blender Skills transfers deform weights from a temporary copy
of the canonical body without the region groups. The skill builds the UV
texture materials and exports isolated staging files. Quanny's existing
`compress.mjs` produces Meshopt and quantized GLBs with KTX2 textures. The shoe
pair and its laces intentionally share stacked UV charts.

Install the repository npm dependencies and the compression dependencies listed
in the character pipeline. The Python texture script uses Pillow and NumPy.
Set `BLENDER_EXE` to Blender 5.3 and optionally `BLENDER_SKILLS` to the
installed skill root. From the repository root run:

```sh
bash art/incoming/protagonist-male-wardrobe/pipeline/produce-starter.sh
CHROMIUM_PATH=/usr/bin/chromium node art/incoming/protagonist-male-wardrobe/pipeline/runtime-review.mjs /tmp/hood-hero-wardrobe-review
```

`produce-starter.sh` also accepts the canonical runtime directory, the source
blend path and a staging directory in that order. This supports the asset
relocation in PR #74. Pass
`/assets/models/characters/protagonist-male` as the second argument to
`runtime-review.mjs` to validate Claude's relocated runtime inputs.

The full-character checker covers the accepted body and head package. This
handoff uses the same GLB compression and skin checks with a separate garment
validator, since the clip library is held by the body.

## Complete catalog

`source/male-wardrobe-catalog.blend` contains the 15 follow-up patterns with
packed materials. The starter source provides the other three. The source
includes both fleece hood configurations. They share the same base pattern,
material and drawstring sweep. The raised hood follows the canonical head
bone above the neckline. Keep hair hidden when equipping a raised hood until
the hairstyle has passed a fit check. No hairstyle assets are included.

The black and white tees have identical mesh and skin accessors, including
their inverse binds. The court sneaker colorways pass the same comparison.
The manifest records the shared geometry IDs. An integrator can reuse the
base geometry and assign the variant material. Each GLB also works by itself.

The open windbreaker keeps the top visible. The hoodie and closed puffer
hide the top until removed. The lightweight tee layering checks are recorded
in `validation/outfits.json`. Flip-flops and slides use empty body masks so
the original toes and heels remain visible. Athletic shorts preserve the lower
legs. Closed footwear has an individual ground offset in the manifest.

The catalogs use textured stitches and trim on folded sections, matching UV
charts on material variants, and deliberately stacked UVs on mirrored
footwear. Blender generates the hood drawstrings with the installed Geometry
Nodes skill and realizes them into the game mesh. The hood-down lip overlaps
the back-neck binding on the inside of the garment.

[Catalog renders](previews/catalog) include front and rear standalone views,
equipped Idle/Walk/Run samples in Three.js, and Blender stress tests. The
[three.js report](validation/catalog-runtime.json) records each equipped
configuration's loaded asset size, visible triangles and estimated material
draws. The summer outfit retains the most body geometry. Desktop Chromium
and Blender provide the production checks. In-city and physical iPhone
testing are part of final integration.

To reproduce the catalog and its runtime review, run from the repository root:

```sh
bash art/incoming/protagonist-male-wardrobe/pipeline/produce-catalog.sh
CHROMIUM_PATH=/usr/bin/chromium node art/incoming/protagonist-male-wardrobe/pipeline/review-catalog.mjs /tmp/hood-hero-catalog-review
```

Supply the same positional canonical inputs to `produce-catalog.sh` as to the
starter script. The catalog build also expects the starter manifest and masks
from the independent first delivery.
