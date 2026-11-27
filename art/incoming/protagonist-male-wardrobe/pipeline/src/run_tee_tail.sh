#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python
cd /home/claude/work/pipe
$PY tee_uv.py ANGLE_BASED 2>&1 | grep -E "scale spread|coverage|Error|Trace"
$PY tee_bake.py 2048 2>&1 | grep -E "displacement|bakes done|HIGH|Error|Trace"
$PY tee_tex.py 2>&1 | grep -E "written|Error|Trace"
PUSH="-0.04,0.097,1.544,0.04,0.007;0.04,0.097,1.544,0.04,0.007" $PY tee_export.py 2>&1 | grep -E "exported|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/tee-white_src.glb /home/claude/work/export/tee-white.glb 1024 2>&1 | grep -E "material|wrote")
$PY mask_runtime.py '{"tee-white":{"slot":"top","mask":"/home/claude/work/tee_mask.npy","regions":["region_torso","region_upper_arms"]}}' /home/claude/work/export/body-masks.json 2>&1 | grep -E "hidden|match"
W=/home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe
cp /home/claude/work/export/tee-white.glb $W/models/tops/; cp /home/claude/work/export/tee-white_src.glb $W/models/tops/; cp /home/claude/work/export/body-masks.json $W/
cd /home/claude/hood-hero-lab && CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rv tee-white:models/tops/tee-white.glb body detail 2>&1 | grep -E "wrote|failed"
