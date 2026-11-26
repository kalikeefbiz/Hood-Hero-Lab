# Male Protagonist — Modular Production Contract & Handoff (Stages 1–3)

- **Branch:** `gemini/male-protagonist-production`
- **Handoff location:** `art/incoming/protagonist-male/`
- **Blender:** `5.3.0` (headless)
- **Blender Skills (`EL4CTEO/blender-skills`):** pinned to `1a1cc6c49312f9f370aae86f52b7b907f29c94f6` (verified latest commit on `origin/main`, matching Hood Hero's documented baseline).
- **Scope of current delivery:** **Stages 1–3 only** (Shared Male Body, Permanent Skeletal Foundation + Idle/Walk/Run Locomotion, Five Facial Variants + Matching Skin Complexion Presets). Clothing, footwear, and hairstyles are intentionally deferred until Stage 1–3 approval.

## Canonical Specifications (v1.0.0)

| Property | Value |
| --- | --- |
| Canonical Body Version | `protagonist-male-body-v1` |
| Canonical Skeleton Version | `protagonist-male-rig-v1` (`rigify-game`, 36 joints) |
| Height | `1.78 m` (feet at `z = 0`, centered on `x = 0`) |
| Orientation | Facing `-Y` in Blender (exports `+Z` in glTF / Three.js) |
| Bind Pose | T-pose, arms horizontal, palms down (normalized from forward-facing palms in `ref/body/t-pose-front.png`) |
| Max Influences / Vertex | `4` (normalized, weights `< 0.01` stripped) |
| Animation Clips | `Idle` (8.0 s, 240 f), `Walk` (1.2 s, 36 f), `Run` (0.733 s, 22 f) — 30 fps, in-place, seamless loops, no animated scale |
| Retarget Source | `art/source/hood-hero/quanny/quanny_source.blend` via `art/source/hood-hero/quanny/pipeline/quanny_to_rigify_fk.json`, reworked for an ordinary playable protagonist |

## Modular Body Regions (Visibility Masking)

To allow runtime occlusion under clothing without permanently deleting geometry or splitting the body into excessive draw calls, the canonical body defines named **vertex groups / material-or-section regions**:
- `region_head`
- `region_neck`
- `region_torso`
- `region_upper_arms`
- `region_forearms`
- `region_hands`
- `region_upper_legs`
- `region_lower_legs`
- `region_feet`

## Stable Customization Slot Categories

`body` · `face` · `complexion` · `hair` · `top` · `outerwear` · `bottom` · `footwear`

## Five Facial & Complexion Variants (Stage 3)

| ID | Variant | Primary Ref | Complexion Preset |
| --- | --- | --- | --- |
| `face-01` | Black | `ref/heads/face-01/` + `ref/body/t-pose-front.png` | `complexion-face-01` |
| `face-02` | White | `ref/heads/face-02/` | `complexion-face-02` |
| `face-03` | Hispanic/Latino | `ref/heads/face-03/` | `complexion-face-03` |
| `face-04` | Asian | `ref/heads/face-04/` | `complexion-face-04` |
| `face-05` | Mixed-heritage | `ref/heads/face-05/` | `complexion-face-05` |

All five variants share the exact same canonical body proportions, `GAME_RIG_Body` skeleton, neck-seam ring, and locomotion clips.
