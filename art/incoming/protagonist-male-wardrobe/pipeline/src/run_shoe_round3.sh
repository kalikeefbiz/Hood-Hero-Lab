#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
$PY shoe_build.py 2>&1 | grep -E "Error|Trace" || true
$PY shoe_rig.py 2>&1 | grep -E "hidden|Error|Trace"; $PY shoe_bake.py 2>&1 | grep -E "done|Error|Trace"; $PY shoe_tex.py 2>&1 | grep -E "written|Error|Trace"
BLEND=/home/claude/work/shoe_uv.blend V3=/home/claude/work/shoeL_v1.npz KEYS=none CKEYS= SHEEN=0.0 DECIMATE=0.42 DEC_LABELS=/home/claude/work/shoe_uv.npz $PY tee_export.py court-sneakers-white 2>&1 | grep -E "decimated|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/court-sneakers-white_src.glb /home/claude/work/export/court-sneakers-white.glb 1024 2>&1 | grep -E "wrote")
$PY mask_runtime.py '{"tee-white":{"slot":"top","mask":"/home/claude/work/tee_mask.npy","regions":["region_torso","region_upper_arms"]},"jeans-denim-standard":{"slot":"bottom","mask":"/home/claude/work/jeans_mask.npy","regions":["region_torso","region_upper_legs","region_lower_legs"]},"court-sneakers-white":{"slot":"footwear","mask":"/home/claude/work/shoe_mask.npy","regions":["region_feet","region_lower_legs"]}}' /home/claude/work/export/body-masks.json 2>&1 | grep -E "hidden"
W=/home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe
cp /home/claude/work/export/court-sneakers-white.glb $W/models/footwear/; cp /home/claude/work/export/body-masks.json $W/
