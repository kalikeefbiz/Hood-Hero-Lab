#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python
cd /home/claude/work/pipe
$PY tee_export.py 2>&1 | grep -E "exported|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/tee-white_src.glb /home/claude/work/export/tee-white.glb 2048 2>&1 | grep -E "wrote")
W=/home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe
cp /home/claude/work/export/tee-white.glb $W/models/tops/; cp /home/claude/work/export/tee-white_src.glb $W/models/tops/
cd /home/claude/hood-hero-lab && export CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome
node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rv tee-white:models/tops/tee-white.glb detail 2>&1 | grep -E "wrote|failed"
REVIEW_QS="debug=vnormal" node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/dbg_vnormal tee-white:models/tops/tee-white.glb detail 2>&1 | grep -E "wrote|failed"
