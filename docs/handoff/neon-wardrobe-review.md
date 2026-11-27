# Review brief: male protagonist wardrobe benchmark (PR #85)

You are the second reviewer. Your job is to judge the work honestly and report what you find. You do not edit files, push commits or merge.

## What to review

PR #85 on `kalikeefbiz/Hood-Hero-Lab`, branch `claude/wardrobe-benchmark`:

- `art/incoming/protagonist-male-wardrobe/models/tops/tee-white.glb`
- `art/incoming/protagonist-male-wardrobe/models/bottoms/jeans-denim-standard.glb`
- `art/incoming/protagonist-male-wardrobe/models/footwear/court-sneakers-white.glb`
- `art/incoming/protagonist-male-wardrobe/body-masks.json`
- `art/incoming/protagonist-male-rework/heads/face-01.glb` (rebuilt head)
- Previews in `art/incoming/protagonist-male-wardrobe/previews/` and `.../previews/city/`

All three garments are worn on the approved round-5 body (`art/incoming/protagonist-male-rework`).

## How to look at it yourself

From the repo root after `npm ci`:

- `node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs <out-dir> tee-white:models/tops/tee-white.glb,jeans-denim-standard:models/bottoms/jeans-denim-standard.glb,court-sneakers-white:models/footwear/court-sneakers-white.glb body detail jdetail sdetail`
  renders three.js sheets with the city's day and night lighting.
- `node art/incoming/protagonist-male-wardrobe/pipeline/city-review.mjs <out-dir>`
  puts the outfit into the real city (`strip.html`) at iPhone size, idle, walking, running and at night.
- `node scripts/review-character.mjs art/incoming/protagonist-male-rework` and `node scripts/check-character.mjs art/incoming/protagonist-male-rework`
  render and check the heads.

If headless Chromium is not on the default path, set `CHROMIUM_PATH`.

## The owner's bar (judge against this, not against earlier rounds)

1. **Anatomy and posture:** the clothes sit on this body convincingly.
2. **Silhouette and folds:** they look like real fabric, with no PS1-era boxiness.
3. **Materials:** cotton, denim, leather and rubber are distinguishable.
4. **Construction:** stitching, seams, pockets and hems are visible and correct.
5. **Movement:** clean deformation through idle, walk and run, with no visible skin poking through cloth.
6. **Face-01:** it resembles `art/incoming/protagonist-male/ref/heads/face-01/{front,left,rear}.png`, with no visible neck seam.
7. **Phone presentation:** it reads well in the real city on a phone-sized screen.

The PR description lists the known defects. Confirm or dispute each one. Then add anything the PR does not mention.

## What to report

For each item, give a verdict (passes / fails / borderline), with the view, frame or file that shows it. Rank the defects by how much each one hurts the look on a phone. Say plainly whether you would approve the benchmark as it stands. Do not soften findings.
