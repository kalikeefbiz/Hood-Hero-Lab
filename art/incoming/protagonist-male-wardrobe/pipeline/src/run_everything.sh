#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
echo "== tee"; $PY tee_build.py 2>&1 | grep -E "neckline|^verts|Error|Trace"; ./run_tee_full.sh
echo "== shoe"; $PY shoe_build.py 2>&1 | grep -E "^verts|Error|Trace"; $PY shoe_rig.py 2>&1 | grep -E "hidden|Error|Trace"; $PY shoe_bake.py 2>&1 | grep -E "done|Error|Trace"; $PY shoe_tex.py 2>&1 | grep -E "written|Error|Trace"
echo "== jeans"; ./run_jeans_full.sh
echo "== checks"; $PY probe_collar2.py 2>&1 | grep -E "ring|disagree"
