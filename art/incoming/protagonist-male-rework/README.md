# Male Protagonist — Round 5 Anatomical & Animation Rework (Experimental Candidate)

Experimental anatomical, skeletal, and animation rework branched from `gemini/protagonist-male-round4` (`ab5ca9179247877679f424837fe55559c89cf9ac`). Preserves PR #75 (`art/incoming/protagonist-male/`) untouched and uses **0 additional Meshy credits**.

## Stage 1 Diagnosis (Round 4 Baseline)
Controlled Three.js comparisons across bind pose, unanimated relaxed pose, Idle/Walk/Run, and the starter outfit (`previews/stage1_r4_diagnosis.png`, `previews/stage1_r4_clothed.png`) isolated two compounding root causes:
1. **Body geometry & rest skeleton:** Even in an unanimated bind/relaxed pose, the upper back (`Z = 1.35–1.50 m`) bulged backward (`Y = +0.181 m`) while the neck slanted forward 23° (`Y_center = +0.068 m` at `Z = 1.535 m` vs head center `Y = +0.010 m`), creating a pronounced upper-back hunch and forward head jut. Fingers were rigidly flat and splayed in T-pose.
2. **Quanny-derived animations:** Inherited Quanny's slouched knee-bent Idle, slow `0.79 m/s` Walk (requiring `2.03×` speedup at the controller's `1.6 m/s`), and awkward crouched open-hand `2.55 m/s` Run (requiring `1.65×` speedup at `4.2 m/s`).

## Key Rework Changes
- **Standing anatomy & posture:** Smooth in-place vertex deformation on `Body` (preserving all `18,875` vertices, `23,934` triangles, UVs, and `region_*` groups) removes the 4.4 cm upper-back hunch (`Z = 1.40 m` `Y_back`: `+0.181 → +0.137 m`), opens the upper chest, aligns shoulders and neck onto the Ear → Shoulder → Hip → Ankle plumb line, and shapes relaxed progressively curved fingers + tucked thumb (no added finger bones).
- **Modular 5-head & 5-complexion continuity:** Lower neck (`Z = 1.538..1.605 m`) smoothly synced on all 5 heads (`face-01..05`) with zero modification above `Z = 1.605 m` (all facial identities and eyes untouched). Verified `0.0 mm` rest position diff, `0.0` weight diff, and `0.0 mm` animated gap across `Idle`, `Walk`, and `Run`.
- **Skeletal alignment (`GAME_RIG_Body`):** Updated `spine.002..006`, `shoulder.L/R`, `upper_arm.L/R`, `forearm.L/R`, `hand.L/R` rest positions to match the upright anatomy while preserving all 36 bone names, hierarchy, ≤ 4 normalized influences (`rig_check.py` `pass: true`, 0 errors).
- **Independent animations (zero Quanny reuse):**
  - `Idle`: `6.0 s` (`180` frames @ 30 fps, `0 m/s`), upright neutral spine, relaxed arms & hands, balanced shoulder-width stance, subtle breathing & micro-sway (`loop_check.py`: 0 pops, 0 hitches).
  - `Walk`: `1.0 s` (`30` frames @ 30 fps, `1.45 m/s` authored → `1.10×` at controller `1.6 m/s`), grounded 5-phase gait cycle with heel-to-toe roll and opposing arm swing (`loop_check.py`: 0 pops).
  - `Run`: `0.667 s` (`20` frames @ 30 fps, `3.80 m/s` authored → `1.11×` at controller `4.2 m/s`), controlled athletic run with ~9° forward inclination, ~86° bent elbows with palms inward, dynamic knee drive, brief flight phase (`loop_check.py`: 0 pops, 0 hitches).

## Wardrobe Compatibility Findings (Codex PR #76 Starter Outfit)
Tested with experimental copies of `tee-white.glb`, `jeans-denim-standard.glb`, `court-sneakers-white.glb`, and `body-masks.json` (Codex's original files untouched):
- **Skeleton binding:** All 36/36 joint nodes (including `root`) exist by exact name in `protagonist-male-rework.glb` and all 5 head GLBs — 100% joint parity with Codex's starter outfit.
- **Body masks (`body-masks.json`):** `Body` preserves the exact `23,934` triangles / `71,802` indices in the same ordinal order, so all existing triangle-ordinal mask ranges apply 1-to-1 with zero poke-through! Only `bodySha256` changes (`eb7cd60d...` → `06e7585513882d31ef28dd3233218231b6ced178da2087c15a3302bbafe71e74`) if promoted to canonical.
- **Garment fit:** Because `spine.003` and `shoulder.L/R` shifted forward cleanly with the upright anatomy, `tee-white.glb` automatically inherits the upright upper-back silhouette. Minor lower-back hem flare on `tee-white.glb` (present in Round 4 as well) and slight left-sleeve cuff clearance can be optionally tightened by Codex if this candidate is promoted, but no wardrobe rebuild is required.

## Standalone iPhone Preview
Open `preview.html` via any local static server (or Vite dev server) to orbit/pinch-zoom all 5 heads, toggle `Idle` / `Walk` / `Run`, switch between `1.0×` authored speed and controller speed (`1.6` / `4.2 m/s`), and toggle Day/Night lighting.
