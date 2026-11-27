#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
echo "== shoes"; $PY shoe_rig.py 2>&1 | grep -E "hidden|faces|Error|Trace"; $PY shoe_bake.py 2>&1 | grep -E "done|Error|Trace"; $PY shoe_tex.py 2>&1 | grep -E "written|Error|Trace"
echo "== tee tex"; $PY tee_tex.py 2>&1 | grep -E "written|Error|Trace"; $PY tee_export.py 2>&1 | grep -E "exported|Error|Trace"; (cd /tmp/gtx && node compress.mjs /home/claude/work/export/tee-white_src.glb /home/claude/work/export/tee-white.glb 2048 2>&1 | grep -E "wrote"); cp /home/claude/work/export/tee-white.glb /home/claude/hood-hero-lab/art/incoming/protagonist-male-wardrobe/models/tops/
echo "== jeans"; $PY jeans_build.py 2>&1 | grep -E "^verts|signed|Error|Trace"; $PY jeans_finish.py 2>&1 | grep -E "pushed|Error|Trace"; $PY jeans_skin.py 2>&1 | grep -E "REST|Error|Trace"
$PY mask_build.py /home/claude/work/jeans_skin.npz /home/claude/work/jeans_mask.npy '{"hem":0.04,"default":0.03}' 2>&1 | grep hidden
$PY jeans_uv.py 2>&1 | grep -E "surface|Error|Trace"
./run_jeans_tail.sh 2>&1 | grep -E "Error|Trace|wrote"
./run_shoe_tail.sh 2>&1 | grep -E "Error|Trace|wrote|hidden"
cd /home/claude/hood-hero-lab && CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node art/incoming/protagonist-male-wardrobe/pipeline/review.mjs /home/claude/work/rva tee-white:models/tops/tee-white.glb,jeans-denim-standard:models/bottoms/jeans-denim-standard.glb,court-sneakers-white:models/footwear/court-sneakers-white.glb body detail jdetail sdetail 2>&1 | grep -E "wrote|failed"
