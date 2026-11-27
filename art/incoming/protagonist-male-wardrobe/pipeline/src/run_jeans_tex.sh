#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
$PY jeans_tex.py 2>&1 | grep -E "written|Error|Trace"
BLEND=/home/claude/work/jeans_uv.blend V3=/home/claude/work/jeans_v3.npz KEYS=waist,hemL,hemR CKEYS= SHEEN=0.0 $PY tee_export.py jeans-denim-standard 2>&1 | grep -E "exported|Error|Trace"
(cd /tmp/gtx && node compress.mjs /home/claude/work/export/jeans-denim-standard_src.glb /home/claude/work/export/jeans-denim-standard.glb 2048 2>&1 | grep -E "wrote")
cp /home/claude/work/export/jeans-denim-standard.glb /home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe/models/bottoms/
cd /home/claude/hood-hero-lab && CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rva tee-white:models/tops/tee-white.glb,jeans-denim-standard:models/bottoms/jeans-denim-standard.glb,court-sneakers-white:models/footwear/court-sneakers-white.glb body detail jdetail sdetail 2>&1 | grep -E "wrote|failed"
