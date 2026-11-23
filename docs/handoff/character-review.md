# Handoff: character review and integration

For the Claude instance taking over review and integration of the character models that Codex and Gemini build. Written 2026-11-23 by the outgoing Claude; state as of Lab `main` at `361126f`.

Read first:
- `AGENTS.md`, especially 00, 00A, 00B and **00C** (character models)
- `docs/CHARACTER_PIPELINE.md`: the exact route the builders follow
- `docs/RESERVOIR_CANON.md` §D: who each character is

## Rules (from the owner; these override anything else)

1. **Nothing goes into the production repo `kalikeefbiz/Hood-Hero`.** Work only in `kalikeefbiz/Hood-Hero-Lab`. Lab `main` is fine: you merge accepted character PRs there.
2. **Work only on the big city map**: the walkable city in `strip.html` / `src/strip/**`. The old strategy board (`src/board/**`) is frozen; don't add characters to it (that includes `src/board/characterModels.ts`).
3. **Never delete files. Report them to the owner instead.** Accepting a delivery **moves** files with `git mv`; nothing is removed. If you think something should be deleted (a duplicate, a bad asset, an empty folder, a stale branch), list it for the owner and wait.
4. **Before any Meshy credits are spent, tell the owner what for**: which character, which task (image-to-3D, retexture…) and the expected cost. Codex's Mr. Lewis used **15 credits** for one image-to-3D task. The builders spend credits, not you, so remind them in every handoff to ask the owner first.

## Roles

| Who | Does | Doesn't |
| --- | --- | --- |
| **Reviewer (you)** | Visual review of every delivery and the checks below. Integration: move accepted files into place, register the model so the city draws it, update the hosted preview, report to the owner. | Game rules, schedules, NPC behaviour, dialogue, new characters. |
| **Codex** | Builds models by the pipeline. **Wiring and game functions:** engine character records for new cast, what a character does and where gameplay puts them. | Editing `public/assets/**`, `src/strip/**`, `src/render/**`. |
| **Gemini** | Builds models by the pipeline. Owns the NPC simulation (who walks where, when), so a character only appears walking around once Gemini's schedules include them. | Same as Codex. |
| **Owner** | Approves reference art, approves credit spend, approves anything beyond a delivery merge. | — |

## Character status

### Integrated (in `public/assets/models/characters/`, registered in `src/render/AvatarAdapter.ts`)

| id | Built by | Layout | Height | Walk / run (m/s) | In the city now? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `quanny` | Earlier Claude, by hand (pre-pipeline) | four files (`quanny.glb` + `-idle/-walk/-run.glb`) | 1.90 | 0.92 / 2.73 | Yes: posts up at Lil Jay's, walks his schedule | The reference rig; his clips are the starting point for every new character. Passes the checker. |
| `mr-lewis` | Codex, PR #62 (merged) | one file, `#Idle/#Walk/#Run` | 1.78 | 0.75 / 2.42 | Yes: home `res-home-04` → works Lil Jay's → home | **Follow-up open:** reference image not committed (see open issues). Run speed to verify (open issues). |
| `flacco` | Gemini, PR #61 (merged) | one file | 1.78 | 0.75 / 2.06 | **No**: registered, but he isn't in the simulation's cast | Appears automatically once Gemini schedules him. Reference: `art/source/hood-hero/flacco/ref/front.jpg`. |
| `mega` | Earlier Claude, Meshy auto-rig (pre-pipeline) | three files, no idle | 1.85 | not measured | No | **Below spec**: 24-bone Meshy rig, no idle clip, fails the checker. Its rig and clips stand in for the player's grey mannequin. A rebuild by the pipeline needs owner approval (credits). |

Sources, previews and manifests for the pipeline characters are in `art/source/hood-hero/<id>/`.

### Delivered, awaiting review

None. No `art/incoming/` folders and no open delivery PRs as of `361126f`.

### Not yet delivered

**Engine characters** (records exist in `src/content/characters.ts`; each needs **owner-approved art** before anyone builds):

| id | Name | Home | Approved art in repo |
| --- | --- | --- | --- |
| `loco` | Cristian Santiago | Rio | none found |
| `pablo` | Pablo | Rio | none found |
| `dizzy` | Dizzy | Rio | portrait `public/assets/characters/angels/dizzy-portrait.webp` |
| `babycanon` | Baby Canon | Rio | portrait `.../angels/baby-canon-portrait.webp` |
| `joker` | Joker | Rio | portrait `.../angels/joker-portrait.webp` |
| `justice` | Justice | Southside | none found |

Portraits are head-and-shoulders, not full-body fronts. Ask the owner whether they're enough, or whether a front reference is coming. Generic `resident-*` / `contact-*` records are background people and don't need unique models.

**Reservoir canon cast without engine records** (`docs/RESERVOIR_CANON.md` §D). These are **blocked on Codex adding the character records first**, then owner art:
- Blocc Boys: Ty Ty, Mookie, Big Riq, Dooda, J-Money, Bam, Trell, Boogie, Nook
- Splash Gang: Baby Reek, Tay Savage, Lil Deuce, K3
- Residents: Miss Denise, Unc Ray, Ms. Tonya, Nell Price, Mr. Harris, Keisha, Miss Pat, Shay, Reggie

Suggested ids are in the canon doc.

## Delivery spec (exactly what Gemini and Codex were given)

The full route is `docs/CHARACTER_PIPELINE.md`. The contract:

- **Tools:** Meshy (base mesh only: `meshy-t2.5`, **T-pose**, PBR off, 2k texture; never Meshy's rig or animations), Blender **5.3** headless, `EL4CTEO/blender-skills` pinned to **`1a1cc6c49312f9f370aae86f52b7b907f29c94f6`**, and `art/source/hood-hero/quanny/pipeline/compress.mjs` for the final pass.
- **Inputs:** a canonical character id that exists in the engine, owner-approved front art, and a height from the owner (default 1.78 m).
- **Scale and orientation:** metres, real height, feet on the ground (z = 0 in Blender), centred, facing −Y in Blender (exports as +Z, which the city expects), transforms applied.
- **Mesh budget:** 8k–40k triangles (target 30k–38k, `auto_retopo --method decimate` keeps Meshy's UVs), at most 2 materials. Model file **≤ 1.4 MB** (one-file) or ≤ 1.1 MB (four-file).
- **Textures:** KTX2 (ETC1S) base colour, **≤ 1024 px**, no normal map (`compress.mjs <in> <out> 1024 0`), quantized and meshopt-compressed.
- **Rig:** Rigify `basic_human --no-face` → **game skeleton** (`root` + deform bones, `DEF-` stripped: `spine…`, `thigh.L`, `upper_arm.L`…), 20–100 joints, no `MCH-`/`ORG-`/`DEF-` helper bones, ≤ 4 influences per vertex, normalized, head and hair rigid.
- **Clips:** exactly **`Idle`**, **`Walk`**, **`Run`**, at 30 fps, looping (first frame equals last), **in place** (root doesn't travel), no animated scale.
  - Walk 0.8–1.6 s, run 0.5–0.9 s, idle 4–12 s.
  - Start from Quanny's clips (retargeted with `art/source/hood-hero/quanny/pipeline/quanny_to_rigify_fk.json`), then rework them for the character's canon.
- **Naming:** folder and files named by the **character id**: `<id>.glb`.
- **Where files go:** the builder writes **only** `art/incoming/<id>/`:

  ```
  art/incoming/<id>/
    <id>.glb                 mesh + skin + Idle/Walk/Run (one file, preferred)
    manifest.json            id, heightM, bindPose, facing, triangles, texture, rig,
                             clips {Idle/Walk/Run: seconds, frames, speedMps},
                             sourceArt, meshyTaskId, blender, skillsCommit, approvedBy, notes
    ref/                     the approved art they built from
    source/<id>_source.blend packed Blender source (Body, RIG_Body, GAME_RIG_Body, actions)
    previews/                material sheet, joint sheet, stress sheet, walk/run/idle MP4s
  ```

- **PR:** branch `codex/<id>-model` or `gemini/<id>-model`, changing only that folder. The PR includes:
  - checker output, and each step's JSON
  - joint, stress and sheet images
  - the Meshy task id, and credits used
  - deviations from the route
  - "ready for Claude review"

## Review checklist

Work through it in order. Don't trust the PR's own report; re-run everything.

### 1. Mechanics (must all pass)
- `git diff --stat origin/main...origin/<branch>` touches **only** `art/incoming/<id>/`.
- `node scripts/check-character.mjs art/incoming/<id>` prints **PASS**. It checks: files and manifest, size, triangles, materials, compression, KTX2 ≤ 1024, one skin, every body part present, no helper bones, the three clips with correct names and lengths, in place, no scale animation, speeds in range.
- `ref/` holds the approved art; `manifest.sourceArt` points at it; the id is canonical.
- **Speed:** `node scripts/measure-foot-speed.mjs art/incoming/<id>/<id>.glb`. Walk must be within **±5%** of `speedMps`. The run reading is ~16% low by design; the script prints a corrected value. If the PR has a direct sole measurement from Blender, trust that for the run.

### 2. Looks (open each preview image)
- **Likeness:** compare against `ref/` (and any portraits in `public/assets/characters/<id>/`). If they differ, ask the owner which is intended (Flacco's model differs from his portraits; the owner confirmed the reference was right).
- **Joint sheet:** joints sit inside the body at the pivots (hip sockets, knees, ankles, shoulders, elbows, wrists), centred in front and side views.
- **Stress sheet:** no tearing, collapsed elbows or knees, or stretching between the legs; accessories follow the right bone. Clothing folds in extreme poses the game never uses (Mr. Lewis's apron at full hip flex) are acceptable.
- **Clips:** the walk has heel-to-toe contact, the run has a flight phase, and the idle never freezes. The motion fits the character's canon.

### 3. Readability at board scale (in the city)

The owner plays on an iPhone (about 390 px wide). Judge at the real camera distances:
- **Follow camera** (walk mode, 5.2 m behind the player): the face, clothing colours and silhouette read clearly.
- **Overview** (`strip.html#select`, the default framing about 10–20 m off): the character must be **identifiable by silhouette and colour blocks alone**, distinct from the grey placeholder people and from the other characters standing at the same place. All-black outfits on dark pavement at dusk are the usual failure; check day and night (the **Dusk / Night** button).
- **Name tag** shows within 14 m; it must not be the only thing that identifies them.
- Take a screenshot at iPhone 13 size (`deviceScaleFactor: 2`) for each of the above and attach them to your review comment.

### 4. Verdict
- **Accept** when 1 passes fully and 2–3 have no blocking problems. Small manifest fixes, like a speed 6% off, can be requested and re-checked; don't make a full rebuild for them.
- **Send back** with a PR comment that names the failing check, the clip and the frame, and what "fixed" looks like. Typical reasons:
  - checker FAIL
  - walk speed more than 5% off
  - tearing in the clips
  - joints visibly outside the limb
  - wrong likeness, or reference art missing
  - files outside `art/incoming/<id>/`
  - a Meshy spend the owner didn't approve
- End every GitHub comment with the footer the environment requires.

## Integration steps (on acceptance)

On a branch `claude/<id>-integrate` from fresh `main`, after merging the delivery PR:

1. **Move, don't delete** (`git mv`):
   - `art/incoming/<id>/<id>.glb` → `public/assets/models/characters/<id>.glb`
   - `art/incoming/<id>/{source,previews,ref,manifest.json}` → `art/source/hood-hero/<id>/`
   - fix `manifest.sourceArt` to the new `ref/` path
   - check `cmp` that the GLB bytes are unchanged
   - empty `art/incoming/<id>/` folders don't exist in git, so nothing needs removing
   - if the delivery contains a reusable tool (like the retarget map), move it next to Quanny's pipeline and tell the owner
2. **Register** in `src/render/AvatarAdapter.ts` → `APPROVED_CHARACTER_ASSETS`, using the manifest's values:

   ```ts
   "<id>": {
     heightM: 1.78,
     clipSpeedMps: { walk: 0.75, run: 2.42 },
     modelUrl: "assets/models/characters/<id>.glb",
     clips: {
       idle: "assets/models/characters/<id>.glb#Idle",
       walk: "assets/models/characters/<id>.glb#Walk",
       run: "assets/models/characters/<id>.glb#Run",
     },
     usesApprovedModel: true,
   },
   ```

   Four-file layouts use plain file URLs instead of `#Clip`. The city (`src/strip/living.ts`) then draws that NPC with the model instead of a placeholder, and the simulation moves them at `clipSpeedMps` so feet don't slide. **Don't** edit `src/board/characterModels.ts`: the old board is frozen.
3. **Test:**
   - `npx tsc -b`, `npm test` (all green), `npm run build`
   - the strip Playwright specs: `npx playwright test tests/strip-walk.spec.ts tests/strip-preview.spec.ts --project=chromium-mobile --trace off`
   - In this cloud container the pinned Playwright browser is missing. Point it at `/opt/pw-browsers/chromium` with a local config, and use `--use-angle=swiftshader` for WebGL. Software rendering is slow; long specs can need more time.
   - Watch the character in the city: `npm run build && npx vite preview`, then `strip.html` (walk mode) or `strip.html?select`. To see someone not in the sim's cast, temporarily pass `?avatar`-style test code locally only; never commit it.
4. **PR** to Lab `main` describing what you checked, with screenshots. The owner merges integration PRs unless they've said otherwise.
5. **Preview URLs:**
   - **Lab site:** `https://kalikeefbiz.github.io/Hood-Hero-Lab/strip.html` (walk), `…/strip.html?select` (selector), `#dev` for Gemini's inspector.
   - **Private artifact** (the owner's iPhone link): `https://claude.ai/artifact/5h64jK7hUhtp6Le5qdeKGs`. To update it:

     ```
     VITE_BASE_PATH=./ VITE_DEV_FEEDBACK=1 npx vite build --outDir /tmp/pb --emptyOutDir
     python3 scripts/package-hosted-preview.py /tmp/pb /tmp/ps
     ```

     Then read the artifact (`action: "read"`, with its url) and publish `/tmp/ps/living-reservoir.html` with `url` set to it, root `/tmp/ps`, and the printed `files` list. That host serves no `.glb`/`.ktx2`; the script packs them as JSON and adds the unpacking shim.
     - **Size:** 46.7 MB as of now; one publish is capped at 64 MB, so after a few more characters publish in two calls (assets first, then the page).
     - Files left out of a publish are kept, and `null` removes one, but **don't remove** without the owner's OK (rule 3).
   - Before sending a link, check it loads: serve `/tmp/ps` with `python3 -m http.server` and open it in Playwright.

## Open issues

1. **Lab deployment.** The 365-day simulation exceeded its 60 s limit in [run 92](https://github.com/kalikeefbiz/Hood-Hero-Lab/actions/runs/45120560748). [The next Pages run](https://github.com/kalikeefbiz/Hood-Hero-Lab/actions/runs/45121736206) passed and published the Living Reservoir at commit `6452b85`. The test now reuses owned state across day advancement and routine actions to avoid repeatedly copying accumulated history.
2. **Mr. Lewis's reference image.** The earlier Codex attachment and its staged PNG are unavailable in the current workspace. The recorded Meshy task could not be retrieved from the connected account. Recover the original JPEG or verified PNG for `art/source/hood-hero/mr-lewis/ref/front.png` in an isolated asset PR. The SHA-256 of the staged PNG is `4bd0c3fb9961beaaec65802818863c1cc8d9a5d0baf6cc169e543d7eef841fbb`.
3. **Mr. Lewis's run speed.** The approved manifest uses 2.42 m/s from Codex's baked-sole measurement. On the shipped GLB, `measure-foot-speed.mjs` reads 2.33 m/s at the planted foot. Its Quanny-based scaling factor of 1.19 estimates 2.77 m/s, about 14.5% above the manifest. The correction is approximate. Claude owns visual acceptance. Trigger a commotion near Mr. Lewis from the clock sheet and watch his foot contact as he flees.
4. **Texture quality:** the owner finds the results a bit "PS2". The source `.blend` files keep Meshy's 2k texture. A re-export at 2048 px with higher-quality KTX2, perhaps with a normal map, may fix most of it without rebuilding. **Owner's call; not started.** It changes the budget in the pipeline doc and the checker (1024 px cap), so update both together if the owner says go.
5. **Speeds:** the player walks at 1.6 m/s, and the sim's placeholder people at ~1.25–1.55 m/s. Characters with models now move at their clip speed (0.75–0.92 m/s walks), which is realistic but slower than everyone else. If it looks wrong next to placeholders, that's a city tuning question (the previous Claude), not a model fault.
6. **Mega** is pre-pipeline and below spec (see status). Rebuilding him costs credits: owner approval first.
7. **Pipeline gotchas** at the pinned skills commit are documented in `docs/CHARACTER_PIPELINE.md` (LOD generation, the 9-influence proxy fallback, retargeting onto Rigify, root export). When a builder hits a new one, add it there in the same PR as your review, so the next build doesn't.

## Next action

1. Ask the owner which characters to build next, and confirm each has approved full-body art. The engine already has records for `loco`, `pablo`, `dizzy`, `babycanon`, `joker` and `justice`. For each, get the expected Meshy credit spend approved (about 15 credits per image-to-3D). Then hand each builder the short brief: character id, art location, "follow `docs/CHARACTER_PIPELINE.md`, deliver to `art/incoming/<id>/`, ask the owner before spending credits".
2. For Reservoir canon cast, ask Codex to add the engine character records first.
3. Chase Mr. Lewis's reference image (issue 2).
