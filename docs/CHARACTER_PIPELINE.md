# Character pipeline (for Codex and Gemini)

**Why this exists:** Hood Hero needs 100+ rigged, animated characters. Claude should not build them one by one. This is the route Codex and Gemini follow to produce a character Claude can drop into the city after a short review. It's also a test of whether that works, so follow it exactly and report every place it didn't.

Owner decision 2026-11-23. You deliver **only** into `art/incoming/<id>/` (AGENTS.md 00C). The male protagonist is modular (body, swappable heads and complexions) and has its own contract on top of this one: `docs/handoff/protagonist-male.md`. Claude reviews, places the file in `public/assets/models/characters/` and wires it up.

## Tools

You have Meshy, Blender and Node in your environment. Use them directly.

- **Blender 5.3**, headless: `blender -b`. 5.2 LTS is the minimum the skills support.
- **Blender agent skills: `EL4CTEO/blender-skills`**, pinned to commit `1a1cc6c49312f9f370aae86f52b7b907f29c94f6` (2026-11-21). Every Blender step below runs one of its scripts. Read each skill's `SKILL.md` before the step that uses it; they hold the rules this doc doesn't repeat.

  ```
  git clone https://github.com/EL4CTEO/blender-skills && cd blender-skills
  git checkout 1a1cc6c49312f9f370aae86f52b7b907f29c94f6
  ./install/install.sh --agent codex      # Codex
  ./install/install.sh --agent gemini     # Gemini CLI  (or --agent agents for ~/.agents/skills)
  ```

  Below, `S` means the installed skills folder (`~/.agents/skills` or the clone's `skills/`). Every script runs headless the same way:

  ```
  python $S/blender-core/scripts/run_in_blender.py --blend in.blend $S/<skill>/scripts/<script>.py -- <args> --save out.blend
  ```

  It prints the script's JSON result. **Keep that output for each step; it goes in your PR.**
- **Meshy** for the base mesh only. Don't use Meshy's auto-rig or stock animations: that's how Mega was made, and he ended up with a 24-bone rig and no idle.
- **Node**, for the final compression with `art/source/hood-hero/quanny/pipeline/compress.mjs`. Install its packages in a scratch folder outside the repo: `npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions ktx2-encoder meshoptimizer sharp`. Since 2026-11-25 it **keeps PBR**: base colour and emissive as sRGB KTX2, normal, metallic-roughness and occlusion as linear KTX2, authored metallic and roughness values untouched. It prints which slots survived for each material. Never edit the script to get a delivery through; report the loss.
- **Checker:** `node scripts/check-character.mjs art/incoming/<id>` must print `PASS` before you open a PR.
- **Review sheets:** `node scripts/review-character.mjs` renders the model in **three.js, the game's renderer, with the city's day and night lighting**: face and neck close-ups, a run frame and full-body views. Claude reviews from these same sheets. Blender renders (Cycles, EEVEE, Workbench) hide texture tears and seams that three.js shows, so a delivery checked only in Blender isn't checked. It needs the repo's packages (`npm ci`) and a Chromium for Playwright (`npx playwright install chromium`, or set `CHROMIUM_PATH`); no GPU needed.

### Visual quality standard (owner decision 2026-11-25)

Hood Hero is a flagship Black House title, not an arcade experiment. Optimization follows a visual standard; it doesn't set one. Limits that were chosen before anyone measured a device are provisional.

- **Two profiles**, set in the manifest (`"profile": "standard" | "hero"`, default `standard`). `standard` keeps the original budgets for existing characters. `hero` is for flagship characters and wardrobe: PBR maps required (normal, roughness/metallic), textures up to 2048, higher triangle, material and size ceilings. The hero ceilings in `scripts/check-character.mjs` are placeholders to be tightened from on-device profiling once the benchmark outfit is approved.
- **Keep a high-quality source independent of the runtime file.** Author at 2K or higher in `source/<id>_source.blend` with textures packed. The runtime GLB is a derived copy; never optimize the source in place.
- **PBR maps carry the detail.** Fabric weave, stitching, seams and folds go in the normal map, distinct material response (denim, cotton, leather, nylon) in roughness/metallic, contact shading in occlusion. Don't paint fake folds into base colour if the normal map can carry them.
- **Inspect at full size.** Contact sheets spot animation problems; they can't show texture quality. Every delivery also needs individual renders (one view per image, 1080p or larger, three.js with the city lighting), material close-ups, and an in-engine capture on a phone.
- **Approve the look before fitting, rigging or optimizing.** A new garment type or character look is approved from renders by the owner before the fitting and optimization work spends effort on it.

### Reuse before you build (owner decision 2026-11-25)

We aren't a AAA studio. Before generating, modelling or painting anything, search for an existing free asset and use it when it fits: PBR fabric, denim, leather and nylon materials, trim sheets, normal and roughness maps, and any ready-made geometry. Meshy credits are for geometry that can't be found or reused, and only up to the amount the owner has approved for the task.

- **Licence first.** Hood-Hero-Lab is a public repo and the game ships commercially, so every borrowed asset must allow commercial use and redistribution. Accepted: CC0, CC-BY (credited), MIT, Apache-2.0, Unlicense. Rejected: non-commercial, no-derivatives, engine-locked, "free for personal use", or an unclear licence. Read the asset's own licence page; a site-wide claim isn't enough.
- **Record it.** List every borrowed asset in `manifest.thirdParty` as `{ "name", "url", "license", "usedFor" }` and add a line to `art/incoming/<id>/CREDITS.md`. `check-character` fails on a missing CREDITS file or a licence outside the accepted list.
- **Reuse doesn't replace fitting.** A borrowed material or mesh still has to be fitted to the frozen body and pass every check below.

### Why the review sheets exist (2026-11-24)

Mr. Lewis, Flacco and the protagonist's face-01 all shipped or were delivered with **torn, shard-like texture round the eyes, mouth and jaw**. It's visible only up close, and none of the Blender previews showed it. Quanny, built by hand, is clean. The likely causes are low face resolution in a full-body Meshy image and step 2's decimation collapsing across UV seams, where the eyes and mouth are densest. Which of the two it is hasn't been settled, because nobody kept a render of Meshy's raw output. The before/after shots in steps 1 and 2 settle it for every new character.

Skills used, in order:
- `blender-core` (always first)
- `blender-asset-qa`
- `blender-retopology-uv`
- `blender-game-optimization`
- `blender-character-rigging`
- `blender-animation`
- `blender-export-pipelines`
- `blender-rendering`

The playbook these steps follow is `blender-workflow-recipes` §3, "Game character".

## Inputs, before you start

1. **A canonical character id** that exists in the engine (`src/content/characters.ts`), e.g. `mr-lewis`. Don't invent characters (AGENTS.md 6). Canon cast without an engine record needs Codex to add the record first.
2. **Owner-approved art**, front view at least. If the owner gives it to you in chat, commit it in your delivery as `art/incoming/<id>/ref/`, so Claude can compare the model against it. No approved art, no model.
3. **Height** from the owner, or 1.78 m if none is given. Quanny is 1.90 m.

## Steps

Work in a scratch folder. Save a `.blend` after every step (`--save`). The **Gate** lines are stop-and-fix points.

### 0. Environment

`python $S/blender-core/scripts/run_in_blender.py $S/blender-core/scripts/env_report.py`

Gate: Blender 5.2 or newer is reported. Read `blender-core/SKILL.md`, in particular the 5.x API changes (`action.fcurves` no longer exists).

### 1. Base mesh (Meshy, then import)

- Meshy image-to-3D from the approved front view: `meshy-t2.5`, **T-pose** (arms straight out, palms down), 2k texture, **PBR on for the `hero` profile** (it generates normal, roughness and metallic maps; `standard` may keep it off). T-pose matters: step 5 reuses Quanny's clips, and retargeting needs matching rest poses.
- Check it against the art: face, clothes, colours, accessories. If it's wrong, regenerate; don't fix likeness in Blender.
- **Before shot:** `node scripts/review-character.mjs --raw <meshy model.glb> --out <scratch>/review` (add `--bust` for a head-only model and `--yaw 180` if it faces away). Open `*_raw_face.png`. If the raw face is torn, blotchy or smeared, Meshy made it: regenerate. Keep these sheets; they go in the PR.
- **Credits:** Meshy gives each task **4 free retries**. Use them whenever the output is wrong, without asking. A **new** task (different input images or mode) costs credits: quote the exact cost and get the owner's approval first.
- Don't use Meshy's rigging or animation. Note the Meshy task id for the manifest.
- Import into Blender. Name the body object `Body`; join any accessory meshes into it. Scale to the owner's height, face **−Y** (Blender front), feet at z = 0, centred on x = 0, transforms applied (`blender-core` rules).
- `qa_check.py -- --objects Body --profile render`.

Gate: no errors; `ob.dimensions.z` equals the height.

### 2. Make it game-weight (`blender-retopology-uv`, `blender-game-optimization`)

- `auto_retopo.py -- --objects Body --method decimate --tris 32000`. Use `decimate`, not `quadriflow`: decimate keeps Meshy's UVs and texture, so nothing needs re-baking. Target 30k–38k triangles. It creates `Body_low`; rename it to `Body` and delete the source.
- `make_lods.py -- --objects Body --cleanup` merges by distance and removes degenerate and loose geometry. It **also creates `Body_LOD1`–`Body_LOD3`; delete them**. If `qa_check` still reports Meshy fin faces (non-manifold, flipped winding, z-fighting pairs), remove those few faces with a targeted bmesh pass, and list how many you removed.
- `mesh_stats.py -- --objects Body --budget web`, then `qa_check.py -- --objects Body --profile game`.
- `review_shots.py -- --objects Body --mode material`, then `--mode wire`. Open both PNGs.
- **After shot:** export `Body` as a quick GLB (`export_asset.py -- --preset web --objects Body --out //body_step2.glb`) and run `review-character.mjs --raw` on it with the same `--yaw`. Put its face sheet next to step 1's. **Anything new round the eyes, mouth or jaw (shards, tears, smears) came from this step.** Fix it before going on:
  - protect the face from decimation (Blender's Decimate modifier in Collapse mode with a face vertex group and *Invert*), or
  - ask Meshy for the triangle budget directly (`--target-polycount`) so decimation barely runs.

Gate: QA `"pass": true`; one or two materials; the face and hands read at phone size; seams intact; **the step-2 face sheet is no worse than the raw one.**

### 3. Rig and skin (`blender-character-rigging`)

1. `rigify_build.py -- --add basic_human --no-face --fit Body` creates `META_Body`.
2. **Place the joints.** The fit only scales the metarig. Move each joint to its pivot of rotation, inside the volume: hip sockets, knees, ankles, ball of foot, clavicle roots, shoulder sockets, elbows, wrists, neck base, head. Give elbows and knees a slight bend in their natural direction. Symmetrize. Check with `review_shots.py` in `wire` and `solid` modes, or MCP `look` with `xray` if you work live. **This is the step most likely to go wrong. Save a contact sheet of the placed joints for the PR.**
3. `rigify_build.py -- --metarig META_Body --generate` creates `RIG_Body`, the control rig with IK/FK.
4. `bind_mesh.py -- --armature RIG_Body --meshes Body`: heat weights with an automatic voxel-proxy fallback (the same method Quanny was skinned with). **On the proxy fallback it can leave up to 9 influences** despite its docs. Check `max_influences` in its output. If it's over 4: lock hair/head vertices above the jaw to the head deform bone, remove weights under 0.01, limit to 4 (`vertex_group_limit_total`), then normalize.
5. Follow the skill's **weight painting rules**:
   - hair, hats and headwraps 100% `head`
   - rigid props (chains, phones) 100% on one bone
   - hanging cloth smoothly blended
6. `stress_poses.py -- --armature RIG_Body`, then render the stress frames (`render_batch.py -- --preset preview --frames 1,10,20,30,40,50 --out //stress_####`). Fix collapsing elbows, candy-wrapped forearms, sunken shoulders and hip creases with the skill's fixes.
7. `rigify_build.py -- --rig RIG_Body --game-skeleton` creates `GAME_RIG_Body`: `root` plus deform bones, `DEF-` stripped (`spine`, `thigh.L`, `upper_arm.L`…). This is what ships.
8. `rig_check.py -- --armature GAME_RIG_Body --profile game --fix`.

Gate: `rig_check` is clean, every vertex is weighted, there are at most 4 influences, and no stress frame tears.

### 4. Animate (`blender-animation`)

Reuse Quanny's clips as the starting point. They're hand-made street animations; retargeting puts them on your rig with the right proportions.

1. Append Quanny's rig and actions from `art/source/hood-hero/quanny/quanny_source.blend`: object `QuannyRig`, actions `Idle`, `Walk`, `Run`. Use `bpy.data.libraries.load` (`blender-core/references/bpy-patterns.md`, append/link).
2. **Don't use `--map auto` onto the Rigify control rig.** It maps onto `ORG-`/`DEF-` bones that Rigify's constraints drive, so the result is overwritten. Instead:
   - switch `RIG_Body`'s four limbs to FK (`IK_FK = 1.0` on each limb's parent control)
   - pass an explicit JSON map from Quanny's bones to the FK controls (22 bones: `torso`, `spine_fk.001`–`003`, `neck`, `head`, `shoulder.L/R`, `*_fk.L/R`). Gemini wrote this map for Flacco (#61). Once it's merged it lives at `art/source/hood-hero/quanny/pipeline/quanny_to_rigify_fk.json`; reuse it, don't rewrite it.
   
   Check with `--show-map`.
3. For each clip, set `QuannyRig`'s active action, then run `retarget.py -- --source QuannyRig --target RIG_Body --map <that json> --in-place --name Walk`, and the same for `Run` and `Idle`. Gate: `max_error_deg` under 1.
4. **Make it this character's motion**, on `RIG_Body`, following the skill's studio workflow (blocking, breakdowns, spline, polish):
   - Mr. Lewis, for example: shorter stride, upright, less hip swing, slower idle with a glance at the store.
   - Read the character's canon in `docs/RESERVOIR_CANON.md` §D.
   - Keep feet planted (IK) and the clip in place.
   - Optional: if the retargeted clip is wrong for the character, author it from scratch on `RIG_Body` instead.
5. `bake_action.py -- --source RIG_Body --target GAME_RIG_Body --actions Idle Walk Run`. Don't pass `--root-motion`: the city needs **in-place** clips.
6. `loop_check.py -- --object GAME_RIG_Body --action <baked action> --fix` for each clip. Gate: no pops or hitches reported.
7. Rename the three baked actions to exactly **`Idle`**, **`Walk`**, **`Run`**, with a fake user on each.

Clip rules (the checker enforces these):

| Clip | Loop length | Notes |
| --- | --- | --- |
| Walk | 0.8–1.6 s | Quanny: 1.20 s (36 frames) |
| Run | 0.5–0.9 s | Quanny: 0.733 s (22 frames) |
| Idle | 4–12 s | Quanny: 8 s (240 frames) |

All clips: 30 fps, first frame equals last, root not moving, no animated scale.

**Ground speed** (manifest `speedMps`) is how fast the character travels when the clip plays at 1×. **Measure it; don't scale it from Quanny.** Take the distance the planted foot moves backwards over one cycle, divided by the cycle length. Claude re-measures it on review, and anything more than 5% off is sent back. Quanny's walk is 0.92 m/s and his run 2.73 m/s. Retargeted clips start near `0.92 × (your hips height ÷ 0.97 m)`. The city plays the clip at the character's real speed, so a wrong value makes the feet slide.

### 5. Export and compress (`blender-export-pipelines`)

1. `export_asset.py -- --preset web --objects GAME_RIG_Body Body --set export_animation_mode=ACTIONS export_def_bones=False --out //<id>_raw.glb`. List `Body` explicitly, and turn off `export_def_bones`: the preset's deform-only setting drops the unweighted `root` bone, which the city needs. This writes meshopt geometry and WebP textures. Keep WebP; `compress.mjs` can't read KTX2 input.
   Gate: the returned summary shows 1 skin, 3 animations named `Idle`/`Walk`/`Run` and nothing else, and the expected triangle count.
   `hero` profile: before compressing, confirm `<id>_raw.glb` contains the normal, roughness/metallic and occlusion maps. If the exporter dropped them, fix the Blender material nodes and re-export; don't patch the compressor.
2. `node compress.mjs <id>_raw.glb <id>.glb 1024` for `standard` (KTX2 at 1024, quantized, meshopt, **PBR maps kept**; pass `0` as a fourth argument only to strip the normal map to save size), or `node compress.mjs <id>_raw.glb <id>.glb 2048` for `hero`. Read its per-material output and list any slot that was lost in your PR. Budget: **≤ 1.4 MB** for the one file on `standard`; see the profile table in `scripts/check-character.mjs` for `hero`.

You ship **one file**, `<id>.glb`, with mesh, skin and the three named clips. Quanny's four-file layout is also accepted, but don't use it for new characters.

### 6. Previews (`blender-rendering`, `blender-asset-qa`)

Put these in `previews/`:
- `<id>_sheet.png`: `review_shots.py -- --objects Body --mode material`
- `<id>_joints.png`: the joint placement sheet from step 3
- `<id>_stress.png`: the stress frames
- `<id>_walk.mp4`, `<id>_run.mp4`, `<id>_idle.mp4`: `render_batch.py -- --preset preview --format MP4`, side view, one full loop, 512 px

With no GPU (`env_report` shows `gpu.backend: NONE`), headless EEVEE won't render. Use `BLENDER_WORKBENCH` with Studio lighting and texture colour for all previews.

### 7. Check and deliver

1. Build the folder:

   ```
   art/incoming/<id>/
     <id>.glb                    mesh + skin + Idle/Walk/Run, compressed
     manifest.json
     ref/                        the approved art you built from (exactly as the owner gave it)
     source/
       <id>_source.blend         Body, RIG_Body, GAME_RIG_Body, actions, textures packed
     previews/                   the files from step 6
   ```

2. Run `node scripts/review-character.mjs art/incoming/<id>`. It writes `previews/threejs/*_face.png` and `*_body.png`. **Open every sheet.** Fix what you see before going on: tears, flecks, seams, gaps, geometry poking out.
3. Run `node scripts/check-character.mjs art/incoming/<id>` until it prints `PASS`. It requires the three.js sheets.
4. Open a PR from `codex/<id>-model` or `gemini/<id>-model` that changes **only** `art/incoming/<id>/`. In the body:
   - the checker output
   - the three.js sheets, with the step 1 and step 2 face sheets beside them
   - **what the sheets show, in plain words.** Name every flaw you can see and say whether you fixed it. A metric ("0.000 mm seam gap") doesn't replace looking.
   - the JSON results from steps 1–5
   - the joint, stress and sheet images
   - the Meshy task id
   - every deviation from this route and why
   - **ready for Claude review**
5. Don't edit `public/assets/**`, `src/**` or `characterModels.ts`.

`manifest.json`:

```json
{
  "id": "mr-lewis",
  "displayName": "Mr. Lewis",
  "heightM": 1.78,
  "bindPose": "T",
  "facing": "+Z",
  "triangles": 32000,
  "texture": 1024,
  "rig": "rigify-game",
  "clips": {
    "Idle": { "seconds": 8.0, "frames": 240, "speedMps": 0 },
    "Walk": { "seconds": 1.333, "frames": 40, "speedMps": 0.80 },
    "Run":  { "seconds": 0.733, "frames": 22, "speedMps": 2.50 }
  },
  "animatedFrom": "retargeted from Quanny, then reworked",
  "sourceArt": ["art/incoming/mr-lewis/ref/front.png"],
  "meshyTaskId": "…",
  "blender": "5.3",
  "skillsCommit": "1a1cc6c49312f9f370aae86f52b7b907f29c94f6",
  "approvedBy": "owner",
  "thirdParty": [{ "name": "Fabric 026", "url": "https://…", "license": "CC0-1.0", "usedFor": "denim base colour, normal, roughness" }],
  "notes": "Deviations, known issues."
}
```

## What Claude accepts

All of these must hold.

**Checked by `scripts/check-character.mjs`:**
- Folder, manifest and source as above. The manifest `id` matches; height is 1.2–2.2 m; bind pose is T or A; source art is listed; `approvedBy` is `"owner"`.
- Model (`standard` profile; `hero` uses the ceilings and PBR requirements in the script):
  - ≤ 1.4 MB, 8k–40k triangles, ≤ 2 materials
  - meshopt, `KHR_mesh_quantization` and KTX2 textures ≤ 1024 px
  - one skin with 20–100 joints and every body part present (root, hips, chest, neck, head; each side's upper arm, forearm, hand, thigh, shin and foot)
  - no Rigify control or helper bones (`MCH-`/`ORG-`/`DEF-`)
- Clips: exactly `Idle`, `Walk` and `Run`.
  - every channel targets a skin bone; root translation is constant; no animated scale
  - lengths match the manifest and the table above; speeds are in range

- `previews/threejs/` holds the face and body sheets from `review-character.mjs`.

**Checked by Claude from the three.js sheets and in the city (`strip.html`):**
- No texture tears, shards or flecks on the face at close-up, day or night.
- Faces forward; feet on the ground; height matches the manifest.
- Looks like the approved art at phone size, day and night.
- No skinning tears in any clip.
- At the manifest speed the feet don't slide (± 5%).
- Loops are seamless, and blending idle → walk → run doesn't pop.
- The motion fits the character's canon.

A failed delivery gets a PR comment naming the failing check, the clip and the frame. Fix and push to the same PR.

## What Claude does on acceptance

The reviewer moves the files with `git mv` (nothing is deleted; see `docs/handoff/character-review.md`):
- `<id>.glb` to `public/assets/models/characters/`
- `source/`, `previews/`, `ref/` and `manifest.json` to `art/source/hood-hero/<id>/`

It then registers the id in `src/render/AvatarAdapter.ts`, with clips referenced inside the file (`<id>.glb#Walk`) and the manifest's height and speeds. The placeholder figure for that id disappears.

## Reference: how Quanny was built

Quanny predates the skills. He was rigged by hand with a custom 32-bone, Mixamo-style skeleton, and his clips come from a procedural IK gait script. See `art/source/hood-hero/quanny/README.md` and `pipeline/`. His shipped files pass the checker in the four-file layout, and his clips are the starting point for step 4. Don't copy his rig scripts for new characters; the skills route above replaces them.
