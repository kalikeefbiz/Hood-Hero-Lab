#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
BLEND=/home/claude/work/shoe_uv.blend V3=/home/claude/work/shoeL_v1.npz KEYS=none CKEYS= SHEEN=0.0 DECIMATE=0.42 DEC_LABELS=/home/claude/work/shoe_uv.npz $PY tee_export.py court-sneakers-white 2>&1 | grep -E "exported|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/court-sneakers-white_src.glb /home/claude/work/export/court-sneakers-white.glb 1024 2>&1 | grep -E "material|wrote")
$PY mask_runtime.py '{"tee-white":{"slot":"top","mask":"/home/claude/work/tee_mask.npy","regions":["region_torso","region_upper_arms"]},"jeans-denim-standard":{"slot":"bottom","mask":"/home/claude/work/jeans_mask.npy","regions":["region_torso","region_upper_legs","region_lower_legs"]},"court-sneakers-white":{"slot":"footwear","mask":"/home/claude/work/shoe_mask.npy","regions":["region_feet","region_lower_legs"]}}' /home/claude/work/export/body-masks.json 2>&1 | grep -E "hidden"
W=/home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe
cp /home/claude/work/export/court-sneakers-white.glb $W/models/footwear/; cp /home/claude/work/export/body-masks.json $W/
cd /home/claude/hood-hero-lab && CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rva tee-white:models/tops/tee-white.glb,jeans-denim-standard:models/bottoms/jeans-denim-standard.glb,court-sneakers-white:models/footwear/court-sneakers-white.glb sdetail 2>&1 | grep -E "wrote|failed"
