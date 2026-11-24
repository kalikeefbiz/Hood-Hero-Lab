# Male protagonist: delivery contract (for Gemini)

Owner-directed 2026-11-24. Written by Claude, who reviews and integrates the delivery. It
**extends** `docs/CHARACTER_PIPELINE.md`. Follow that pipeline exactly, except where this
contract says otherwise. Where they conflict, this contract wins for `protagonist-male` only.

References: `art/source/hood-hero/protagonist/male/hood-hero-male-protagonist-references.zip`
(primary body `ref/body/t-pose-front.png`; heads `ref/heads/face-01`…`face-05`, each with
`front.png`, `left.png`, `rear.png` and `original.jpeg`). Pull latest `main` first: the
package's README changed on 2026-11-24 and your unpacked copy is stale. Re-copy `ref/`.

## What's different from a normal character

The protagonist is the player, not an engine NPC. So:

- **Id:** `protagonist-male`. It needs no record in `src/content/characters.ts`.
- **It's modular.** Every character so far has shipped as one fixed file. This one ships:
  - one body with the rig and clips
  - swappable heads
  - swappable body skin textures (complexions)

  The player will pick a head. Hair, clothing and footwear come later as separate parts on the
  same skeleton, so build nothing that blocks them.
- **Folder:** `art/incoming/protagonist-male/`, the same 00C exception as any character.

## Pilot first (two Meshy jobs), then stop

Do **not** generate all five heads. The risky part is a head that Meshy made separately
sitting on the shared neck with no visible seam. Prove that once before spending on the rest.

| Job | Input | Meshy mode | Why this mode |
| --- | --- | --- | --- |
| 1. Body + face-01 | `ref/body/t-pose-front.png` | `image-to-3d`, `meshy-t2.5`, T-pose, PBR off, 2k | It's the only body view in the target pose. Do **not** add `original-turnaround.jpeg`: its pose and muscle mass differ, and the README forbids that drift. |
| 2. Head face-02 | `ref/heads/face-02/front.png`, `left.png`, `rear.png` | `multi-image-to-3d`, `meshy-t2.5`, PBR off, 2k | The views exist, so use them. Single-image would invent the side and back of the skull. |

Rules for both:

- **Credits.** Each Meshy task has **4 free retries**: use them whenever the output is wrong,
  without asking. A **new** task (new input images or mode) costs credits: post the exact cost
  from `meshy` and wait for the owner's approval.
- **Before shots.** Render every raw Meshy output with
  `node scripts/review-character.mjs --raw <model.glb>` (`--bust` for heads) before touching it.
  If the raw face is torn or blotchy, spend a free retry. These sheets go in the PR.
- **Inputs stay as given.** Plain resampling (Lanczos) of the ~303 px crops is allowed. AI
  upscaling, retouching or inpainting is not; it changes the likeness.
- **`original.jpeg` is for checking likeness only. Never feed it to Meshy:** it has hair and a
  T-shirt, which would bake in.
- **Cutting a corner?** Write down why in the PR. Example: dropping a view because Meshy
  rejected it. Silent substitutions get sent back.

After the pilot passes review, faces 03, 04 and 05 each follow job 2's recipe (multi-image,
front/left/rear), as a separate approval.

### Round 2 (after Claude's review of PR #71, 2026-11-24)

The body, rig, clips and complexions are accepted as delivered. The heads aren't. The defects and
their causes:

| Defect | Cause | Fix |
| --- | --- | --- |
| face-01: torn shards round the eyes, cheek and jaw | Not yet known: the face is ~100 px wide in a full-body image, and/or step-2 decimation tore UVs. Mr. Lewis and Flacco show the same thing. | Render job 1's raw GLB with `--raw`. **Raw face clean:** the processing did it; redo it with the face protected from decimation (no credits). **Raw face bad:** spend job 1's free retries. If those fail too, make face-01 a multi-image head from `ref/heads/face-01/{front,left,rear}.png` like face-02 (a new task: quote and wait). |
| Hard colour line round the base of the neck, both heads | No colour blend was made across the seam | See **Seam → Colour** below. |
| face-02: streaked neck | One UV per stitched collar triangle | Give the collar band real UVs, or bake it from the body texture. |
| face-02: dark flaps at the trapezius | Meshy's bust shoulders weren't fully cut away | No head geometry below the seam ring or outside the body's neck surface. |
| face-02: dark flecks on the cheek | Left over from the vertex-merge passes | Find and remove; compare with the raw sheet. |
| face-01: spike under the throat | Seam-cut geometry | Remove. |

Push to the same PR (#71).

## Body

- **Proportions:** keep `t-pose-front.png`. Height 1.78 m unless the owner says otherwise.
- **Palms:** the reference has palms forward, fingers spread. The pipeline needs palms down.
  Normalize the hands in Blender before rigging, and show the before/after in the joint sheet.
- **Cut the head off at the neck seam** (see Seam). Everything above it becomes
  `heads/face-01.glb`. The body file has no head.
- **Rig and clips:** the rest follows the pipeline, steps 2–5 unchanged:
  - Rigify
  - `GAME_RIG_Body`
  - Quanny's clips retargeted through the FK map, then made into this character's motion
  - `Idle`, `Walk`, `Run`
  - speeds measured with `scripts/measure-foot-speed.mjs`

  **Motion:** a neutral, grounded young man. The player shouldn't read as anyone's
  caricature.
- **Default texture:** the body's embedded texture is complexion-01.

## Seam (the part that has to be right)

- **Where:** one closed edge loop round the base of the neck, just above the collarbones,
  where a crew-neck collar will later sit.
- **Shared exactly:** the body and **every** head share that loop. Check each of these with a
  script and put the numbers in the PR:
  - same vertex count, same order
  - positions within 0.1 mm
  - normals copied from the body (Data Transfer)
  - identical bone weights on the seam vertices
- **No gap or crease** at any frame of Idle, Walk or Run, including the run's head bob and any
  head turn in the idle.
- **Colour:** at the seam, a head's skin colour must match its paired complexion. Matching
  geometry doesn't do this; the two textures come from separate Meshy jobs and never match on
  their own. **Required step:** sample both textures along the ring and repaint or bake the
  head's lowest 3–4 cm so its colour fades into the body's at the ring, for each head and its
  complexion. Proof is the three.js `neck · front` and `neck · back 3/4` views: no visible
  line, day or night.

## Heads

- **Scalp:** close-shaved, with the stubble texture from the reference. No hair geometry; hair
  cards come later. Ears, eyes and stubble may be in the texture.
- **Skeleton:** each head is skinned to the **same `GAME_RIG_Body` skeleton**, unchanged.
  - Export it with the head the way the body exports (`export_def_bones=False`).
  - Weights: 100% `head` above the jaw, blending into `neck` towards the seam.
  - The runtime binds heads to the body's bones by name.
- **Budget:** at most 8k triangles, one material, KTX2 texture at most 1024 px, at most
  350 KB, compressed with `compress.mjs`.
- **No animations** in head files.
- **Pairing:** each `face-0N` pairs with `complexion-0N`.

## Complexions

- **Same body, recoloured:** body albedo variants on the **same body mesh and UVs**. Make them
  by recolouring the body texture in Blender or an image tool, keeping the muscle and shading
  detail. **No new Meshy jobs for skin.**
- **Colour targets:** `sheets/body-complexion-study.png`, matched to the paired head's neck at
  the seam. Your `materials/complexions.json` samples are a fine starting point. Your labels
  are fine too: the owner approved them.
- **Format:** one standalone `.ktx2` per complexion, at most 1024 px and 300 KB. Encode with the
  same settings as `compress.mjs` (the `ktx2-encoder` package the pipeline already installs).
- **Which ones:** the pilot ships `complexion-01` and `complexion-02`. Later heads add theirs.

## Delivery layout

```
art/incoming/protagonist-male/
  protagonist-male.glb          headless body + skin + Idle/Walk/Run (must pass the normal checks)
  heads/face-01.glb
  heads/face-02.glb
  complexions/complexion-01.ktx2
  complexions/complexion-02.ktx2
  manifest.json
  ref/                          the reference package, as given
  source/protagonist-male_source.blend   body, every head, META/RIG/GAME rigs, actions, textures packed
  previews/
    protagonist-male_sheet.png  body with each head and its complexion, front/side/back
    protagonist-male_joints.png includes palms before/after
    protagonist-male_stress.png
    protagonist-male_walk.mp4, _run.mp4, _idle.mp4   with face-01
    seam_face-01.png, seam_face-02.png               neck close-ups at the worst frames, neutral + day + night light
    swap_face-02_walk.mp4                            face-02 on the body, one walk loop
```

`manifest.json` is the pipeline manifest, plus:

```json
"modular": {
  "seam": "neck-base",
  "defaultHead": "face-01",
  "heads": {
    "face-01": { "file": "heads/face-01.glb", "complexion": "complexion-01", "label": "…",
                 "meshyTaskId": "…", "meshyMode": "image-to-3d", "inputs": ["ref/body/t-pose-front.png"] },
    "face-02": { "file": "heads/face-02.glb", "complexion": "complexion-02", "label": "…",
                 "meshyTaskId": "…", "meshyMode": "multi-image-to-3d",
                 "inputs": ["ref/heads/face-02/front.png", "ref/heads/face-02/left.png", "ref/heads/face-02/rear.png"] }
  },
  "complexions": {
    "complexion-01": { "file": "complexions/complexion-01.ktx2", "label": "…", "hex": "#…" },
    "complexion-02": { "file": "complexions/complexion-02.ktx2", "label": "…", "hex": "#…" }
  }
}
```

Set the top-level `meshyTaskId` to job 1's id.

## Check and hand off

1. Run `node scripts/review-character.mjs art/incoming/protagonist-male`. It writes a face
   sheet and a body sheet **per head** to `previews/threejs/`, rendered in three.js with the
   city's lighting, exactly as Claude reviews. Open every one and fix what you see.
   Then run `node scripts/check-character.mjs art/incoming/protagonist-male` until it prints
   `PASS`. It now also checks the modular parts:
   - every head and complexion file is listed in the manifest
   - head budgets, and no animations in heads
   - head joints are body bones, with the same rest pose
   - complexions are KTX2 and within budget

   It cannot check the seam. Your seam numbers and close-ups cover that.
2. Push the branch and open a PR to `main` that changes only `art/incoming/protagonist-male/`.
   In the body, include:
   - the checker output
   - the three.js sheets, with the raw (`--raw`) face sheets beside them
   - **what the sheets show, in plain words**: every flaw you can see and whether you fixed it.
     A seam metric doesn't replace looking.
   - the JSON from each pipeline step
   - the seam numbers
   - the Meshy task ids, modes, inputs and credits spent
   - every deviation and why
   - the words **ready for Claude review**
3. **Stop.** Don't start faces 03–05, hair, clothing or footwear.

## What Claude does

Claude reviews the delivery in `strip.html`:

- each head on the body
- the seams in day and night lighting, through all three clips
- likeness against `original.jpeg` at phone size
- foot slide at the manifest speeds

Claude also extends the player avatar (`src/strip/player/avatar.ts`) with head and complexion
swapping, binding heads to the body skeleton by bone name. On acceptance, Claude moves the
files as in `docs/handoff/character-review.md`.
