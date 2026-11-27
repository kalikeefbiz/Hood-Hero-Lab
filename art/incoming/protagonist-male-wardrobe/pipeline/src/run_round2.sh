#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
echo "== shoe"; $PY shoe_build.py 2>&1 | grep -E "^verts|clearance|Counter|Error|Trace"; $PY shoe_rig.py 2>&1 | grep -E "hidden|Error|Trace"; $PY shoe_bake.py 2>&1 | grep -E "done|Error|Trace"; $PY shoe_tex.py 2>&1 | grep -E "written|Error|Trace"
echo "== jeans"; ./run_jeans_full.sh
echo "== tee export"; ./run_tee_export.sh
