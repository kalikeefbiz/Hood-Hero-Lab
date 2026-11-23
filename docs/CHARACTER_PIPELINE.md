# Character pipeline: the Blender route (for Codex and Gemini)

How Quanny was built, written so another agent can build the next character the same way and hand Claude a file set that drops straight into the city. Follow it exactly. When a step says "as Quanny", the working reference is `art/source/hood-hero/quanny/`.

Owner decision 2026-11-23: Codex and Gemini may produce character models by this route. You deliver **only** into `art/incoming/<id>/` (see AGENTS.md 00C). Claude reviews, places the files in `public/assets/models/characters/` and wires them into the game.

## What was used

- **Blender** run headless from the command line (`blender -b -P script.py -- args`). Quanny was built in **Blender 5.3**; use 5.3 so the `.blend` and the action API match (`animate.py` already handles the layered-action API).
- **Python `bpy` scripts**: the seven files in `art/source/hood-hero/quanny/pipeline/`. They are the method. Copy them; don't rewrite them.
- **glTF Transform** (Node) with `ktx2-encoder`, `meshoptimizer` and `sharp`: `compress.mjs`. Install those in a scratch folder outside the repo: `npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions ktx2-encoder meshoptimizer sharp`.
- **Meshy** for the base mesh only (the owner's Meshy account). Meshy's auto-rig and stock animations are **not** used on this route; Mega used them, which is why he has no idle and a 24-bone rig.
- **Agent skills:** none were used to build Quanny. His pass was hand-scripted in Blender in an earlier Claude session. When Claude makes base meshes it uses the `meshy-3d-agent:meshy-3d-generation` skill. You don't have that skill: use Meshy's web app or API with the settings in step 1.
- **Checker:** `node scripts/check-character.mjs art/incoming/<id>` must print `PASS`. Quanny's shipped files pass it (54 checks).

## Inputs you need before starting

1. **A canonical character id** that exists in the engine (`src/content/characters.ts`), e.g. `mr-lewis`. Do not invent characters (AGENTS.md 6). Canon cast without an engine record (Ty Ty, Baby Reek…) needs Codex to add the record first.
2. **Owner-approved art** of that character: front view at least; side view if available. It goes in `art/source/hood-hero/<id>/ref/`. No approved art, no model.
3. **Height** in metres from the owner, or 1.78 m if none is given. Quanny is 1.90 m.

## Steps

Work in a scratch folder. Copy `art/source/hood-hero/quanny/pipeline/` into it, then do a find-and-replace in every script: `'Quanny'` → your mesh name (e.g. `'MrLewis'`), `'QuannyRig'` → `'<Name>Rig'`, `quanny` in file names → `<id>`. Each script starts with `sys.path.insert(0,'/home/claude/scripts')`: change that to your scratch folder.

### 1. Base mesh (Meshy)

- Meshy image-to-3D from the approved front view. Settings: `--ai-model meshy-t2.5`, `--pose-mode t-pose` (arms straight out, palms down), PBR off, 2k texture. Quanny's upload was a high-detail model of about 580k triangles.
- Check the result against the art: face, clothes, colours, accessories. If it's wrong, regenerate; don't fix likeness in Blender.
- Download the textured GLB. **Do not** run Meshy's rigging or animation.
- Note the Meshy task id; it goes in the manifest.

### 2. Clean up and decimate (Blender)

This step isn't scripted in the Quanny folder, so do exactly this in a small script of your own:

1. Import the GLB. Keep one mesh and one material with a base-colour texture. Delete everything else (lights, cameras, empties, extra meshes; join accessory meshes into the body first).
2. Orientation: Blender is Z-up. The character faces **−Y in Blender** (this exports as +Z in glTF, which is what the city expects). Rotate if needed.
3. Scale so the top of the head is at the owner's height. Put the feet on the ground (lowest vertex at z = 0) and centre the body on x = 0, y = 0. Apply all transforms.
4. Decimate to **30,000–38,000 triangles**: Decimate modifier, `Collapse`, ratio = target ÷ current triangle count, `use_collapse_triangulate=True`, delimit `{'UV','SEAM'}` so texture seams survive. Apply it.
5. Save as `<id>_clean.blend`. Check: no holes at the seams, the face reads at phone size, triangle count is in range.

### 3. Rig (`build_rig.py`)

Run: `blender -b -P build_rig.py -- <id>_clean.glb <id>_rigged.blend`. Export step 2's result to GLB first, or change the script to open the `.blend`.

Before running, edit **only** these parts of `build_rig.py`:

- `body.location.z += 0.9517` is Quanny's ground offset. Set it to 0 if step 2 already put the feet at z = 0.
- **The joint table `B`.** Quanny's joints are absolute positions measured on his 1.90 m body. For your character:
  1. Scale every coordinate by `H / 1.90`, where H is your character's height, as a first guess.
  2. Then move each joint onto the body's real landmarks, measured from the mesh. Hips: top of the pelvis, between the hip sockets. UpLeg: hip socket. Leg: knee centre. Foot: ankle centre. ToeBase: ball of the foot. Shoulder: clavicle root. Arm: shoulder socket. ForeArm: elbow. Hand: wrist. Fingers and thumbs: along the real fingers. Neck: base of the neck. Head: top of the neck.
  3. Joints must sit **inside** the mesh, centred in the limb.
- Keep these exact: the **bone names and hierarchy**, `Root` at the origin with `use_deform = False`, and the roll rule (`align_roll`).
- Quanny's `Bandana` bone is his alone. A character with a hanging accessory (chain, bag strap, long coat flap) may add **one or two** extra bones parented to `Hips` or `Spine2`, named after the item (`Chain`, `Strap`). Nothing else may be added.

The required 31 bones (the checker enforces these names):

```
Root > Hips > Spine > Spine1 > Spine2 > Neck > Head
Spine2 > LeftShoulder > LeftArm > LeftForeArm > LeftHand > LeftHandFingers1 > LeftHandFingers2
                                               LeftHand > LeftHandThumb1 > LeftHandThumb2
Hips > LeftUpLeg > LeftLeg > LeftFoot > LeftToeBase
(and the same for Right)
```

Weights come from Blender's heat weighting on a voxel-remeshed proxy (voxel size 0.009), copied to the real mesh with a Data Transfer modifier. The script already does this.

### 4. Fix weights (`fix_weights.py`)

Run: `blender -b -P fix_weights.py -- <id>_rigged.blend <id>_weighted.blend`.

- The **bandana and hair selections are Quanny's**: they pick vertices by colour and position. Delete those blocks and write the equivalent for your character's accessories and hair (hair and headwear → 100% `Head`; hanging items → their own bone, blended into the parent near the attachment point).
- Keep the last block exactly as it is: fill unweighted vertices from neighbours, clean weights under 0.01, **limit to 4 influences per vertex**, normalise. The script must print `still unweighted 0`.
- Check: pose the rig (arms down 70°, a deep knee bend, head turned 45°) and render a still with `common.py`'s `render()`. No tearing at the armpits, crotch, neck or elbows; nothing stretches between the legs; accessories follow the right bone.

### 5. Animate walk and run (`animate.py`)

Walk: `blender -b -P animate.py -- <id>_weighted.blend <id>_walk.blend '<walk params json>'`
Run: the same command with `<id>_run.blend` and the run params.

`animate.py` builds a procedural, IK-planted gait from parameters, bakes it to plain FK and removes its helper bones. Quanny's exact parameters are in `walk_params.json` and `run_params.json`; anything not listed uses the defaults at the top of `animate.py`.

Adjust per character:

| Parameter | Meaning | Quanny walk | Quanny run | Scale or adjust for yours |
| --- | --- | --- | --- | --- |
| `N` | frames per cycle at 30 fps | 36 | 22 | older or slower: walk 38–42 |
| `cyc` | metres per cycle | 1.10 | 2.0 | × H / 1.90 |
| `base` | hip height in the cycle (m) | 0.925 | 0.89 | × H / 1.90 |
| `fx` | foot spacing from centre (m) | 0.125 | 0.085 | × H / 1.90 |
| `lift` | foot lift in swing (m) | 0.075 | 0.22 | × H / 1.90 |
| `bob`, `swayx` | body bounce and side sway (m) | 0.02 / 0.026 | 0.034 / 0.012 | smaller for a calm or older character |
| `roll`, `yaw`, `tilt` | pelvis roll, twist, forward tilt (°) | 6 / 8 / 4 | 3.5 / 6 / 7 | swagger up, stiffness down |
| `arms`, `armdown` | arm swing (°), arm hang (°) | 16 / 65 | 30 / 76 | — |
| `name` | action name | `Walk` | `Run` | keep exactly `Walk` / `Run` |

Run params that only apply to the run (`flex`, `curl1`, `curl2`, `chest`…) can stay as Quanny's. Accessory params (`band`, `bandback`) drive the `Bandana` bone: rename them to your accessory bone or drop them.

**Ground speed** = `cyc ÷ (N ÷ 30)`. Quanny's walk is 1.10 ÷ 1.2 = 0.92 m/s. Write it in the manifest. The city plays the clip at the speed the character actually moves; a wrong value makes the feet slide.

The script prints `max foot IK error`, which must be under 0.01. Check visually:
- planted feet don't slide or sink
- knees point forward
- frame 0 equals the last frame (seamless loop)
- no root motion: the character walks on the spot

### 6. Idle (`idle.py`)

Run: `blender -b -P idle.py -- <id>_weighted.blend <id>_idle.blend`. This gives an 8 s loop (240 frames), feet planted by IK.

- The pose keys in `idle.py` are **Quanny's attitude**: weight on the right leg, thumb in his pocket, scanning the block. Rewrite the key poses for your character's canon (RESERVOIR_CANON D). Mr. Lewis, for example: weight even, hands together or one on the hip, slower breathing, a glance toward the store door.
- Keep it subtle: breathing, a weight shift, one head turn and one hand gesture per loop.
- Loop: 4–12 s, first frame equals last. Name the action `Idle`.

### 7. Combine and save the source (`combine.py`, `add_action.py`)

`combine.py` puts Walk and Run into one file; `add_action.py` adds Idle. Pack the textures. The result is `<id>_source.blend` with mesh, rig, weights and the three actions (`use_fake_user` on each).

### 8. Export (`export_parts.py`)

Run it four times against `<id>_source.blend`, with modes `model`, `walk`, `run`, `idle`:

- `model`: mesh and skin in **bind pose** (T-pose), no animation.
- `walk`, `run`, `idle`: the armature only, with that one action, force-sampled at 30 fps.

Before each clip export, set the armature's active action to that clip. The script exports whatever action is active.

Also export one uncompressed master (2048 textures, no animation) as `<id>_master_uncompressed.glb` for close-ups.

### 9. Compress (`compress.mjs`)

```
node compress.mjs <id>.glb       out/<id>.glb       1024 0
node compress.mjs <id>-walk.glb  out/<id>-walk.glb  1024 0
node compress.mjs <id>-run.glb   out/<id>-run.glb   1024 0
node compress.mjs <id>-idle.glb  out/<id>-idle.glb  1024 0
```

This gives KTX2 ETC1S base colour at 1024, no normal map (the 4th argument `0`; the city doesn't use one at this size), quantized and meshopt-compressed. Size budget:
- model ≤ 1 MB (Quanny: 727 KB)
- each clip ≤ 117 KB (Quanny: 35–42 KB)

### 10. Previews

Render with `common.py` (`setup_render`, `cam`, `render`), Cycles, 512 px:

- `previews/<id>_bind.png`: front, side, back and three-quarter views of the bind pose on one sheet.
- `previews/<id>_walk.gif`, `<id>_run.gif`, `<id>_idle.gif`: one full loop each, side view, ground line visible.

### 11. Check and deliver

1. Build `art/incoming/<id>/` exactly as below and fill in `manifest.json`.
2. Run `node scripts/check-character.mjs art/incoming/<id>` until it prints `PASS`.
3. Open a PR from `codex/<id>-model` or `gemini/<id>-model` that changes **only** `art/incoming/<id>/`:
   - paste the checker output and the four previews into the PR body
   - list the Meshy task id and any step where you deviated from this route, and why
   - say **ready for Claude review**
4. Do not edit `public/assets/**`, `src/strip/**`, `src/render/**` or `characterModels.ts`. Wiring the character in is Claude's job.

```
art/incoming/<id>/
  <id>.glb                 model, bind pose, no clip
  <id>-idle.glb            armature + "Idle"
  <id>-walk.glb            armature + "Walk"
  <id>-run.glb             armature + "Run"
  manifest.json
  source/
    <id>_source.blend      mesh, rig, weights, Idle/Walk/Run, textures packed
    <id>_master_uncompressed.glb
    pipeline/              your edited copies of the scripts + walk_params.json, run_params.json
  previews/
    <id>_bind.png  <id>_walk.gif  <id>_run.gif  <id>_idle.gif
```

`manifest.json`:

```json
{
  "id": "mr-lewis",
  "displayName": "Mr. Lewis",
  "heightM": 1.78,
  "bindPose": "T",
  "facing": "+Z",
  "triangles": 34500,
  "texture": 1024,
  "extraBones": [],
  "clips": {
    "Idle": { "seconds": 8.0, "frames": 240, "speedMps": 0 },
    "Walk": { "seconds": 1.333, "frames": 40, "speedMps": 0.77 },
    "Run":  { "seconds": 0.733, "frames": 22, "speedMps": 2.56 }
  },
  "sourceArt": ["art/source/hood-hero/mr-lewis/ref/front.png"],
  "meshyTaskId": "…",
  "blender": "5.3",
  "approvedBy": "owner",
  "notes": "Anything Claude should know: deviations, known weight issues."
}
```

## What Claude accepts

A delivery is accepted when **all** of these hold. The checker covers the first block; Claude checks the rest by eye in the city.

**Checked by `scripts/check-character.mjs`:**
- Files and folders as listed above; the manifest parses, its `id` matches the folder, height is 1.2–2.2 m, the bind pose is T or A, source art is listed and `approvedBy` is `"owner"`.
- Model:
  - ≤ 1 MB, 8k–40k triangles, ≤ 2 materials
  - KTX2 textures ≤ 1024 px
  - `EXT_meshopt_compression`, `KHR_mesh_quantization` and `KHR_texture_basisu`
  - one skin with 31–40 joints including all 31 required names
  - no animation
- Each clip:
  - ≤ 117 KB, no mesh, exactly one animation named `Idle` / `Walk` / `Run`
  - every channel targets a model bone; Root translation is constant (in place)
  - length matches the manifest
  - walk 0.8–1.6 s, run 0.5–0.9 s, idle 4–12 s; speeds in range

**Checked by Claude in the city (`strip.html`):**
- Faces +Z; feet exactly on the ground; height matches the manifest.
- Looks like the approved art at phone size, day and night.
- No skinning tears in walk, run or idle; accessories follow.
- Walking at the manifest speed, the feet don't slide (± 5%).
- Loops are seamless, and blending idle → walk → run doesn't pop.
- It reads as the canon character's attitude (RESERVOIR_CANON D).

A delivery that fails gets a PR comment naming the failing check, the clip and the frame. Fix and push to the same PR.

## What Claude does on acceptance

Claude moves the four GLBs to `public/assets/models/characters/` and registers the id in `src/render/AvatarAdapter.ts` (`APPROVED_CHARACTER_ASSETS`) and `src/board/characterModels.ts`, using the manifest's clip speeds. Claude also moves `source/` and `previews/` to `art/source/hood-hero/<id>/` and deletes `art/incoming/<id>/`. The placeholder figure for that id disappears automatically.
