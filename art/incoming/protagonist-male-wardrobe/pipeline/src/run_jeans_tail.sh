#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
[ "$1" != "notex" ] && { $PY jeans_bake.py 2048 2>&1 | grep -E "displacement|bakes done|Error|Trace"; }
$PY jeans_tex.py 2>&1 | grep -E "written|Error|Trace"
BLEND=/home/claude/work/jeans_uv.blend V3=/home/claude/work/jeans_v3.npz KEYS=waist,hemL,hemR CKEYS= SHEEN=0.0 $PY tee_export.py jeans-denim-standard 2>&1 | grep -E "exported|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/jeans-denim-standard_src.glb /home/claude/work/export/jeans-denim-standard.glb 1024 2>&1 | grep -E "material|wrote")
$PY mask_runtime.py '{"tee-white":{"slot":"top","mask":"/home/claude/work/tee_mask.npy","regions":["region_torso","region_upper_arms"]},"jeans-denim-standard":{"slot":"bottom","mask":"/home/claude/work/jeans_mask.npy","regions":["region_torso","region_upper_legs","region_lower_legs"]}}' /home/claude/work/export/body-masks.json 2>&1 | grep -E "hidden"
W=/home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe
cp /home/claude/work/export/jeans-denim-standard.glb $W/models/bottoms/; cp /home/claude/work/export/body-masks.json $W/
cd /home/claude/hood-hero-lab && CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rvj tee-white:models/tops/tee-white.glb,jeans-denim-standard:models/bottoms/jeans-denim-standard.glb jdetail 2>&1 | grep -E "wrote|failed"
