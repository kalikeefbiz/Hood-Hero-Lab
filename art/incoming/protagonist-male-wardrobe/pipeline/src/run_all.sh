#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
echo "== tee"; $PY tee_build.py 2>&1 | grep -E "^verts|Error|Trace"; $PY tee_finish.py 2>&1 | grep -E "pushed|Error|Trace"; $PY tee_skin.py 2>&1 | grep -E "REST|Error|Trace"
$PY mask_build.py /home/claude/work/tee_skin.npz /home/claude/work/tee_mask.npy '{"neck":0.02,"sleeve":0.035,"hem":0.05}' 2>&1 | grep hidden
./run_tee_tail.sh 2>&1 | grep -E "Error|Trace|coverage" || true
echo "== jeans"; $PY jeans_build.py 2>&1 | grep -E "^verts|Error|Trace"; $PY jeans_finish.py 2>&1 | grep -E "pushed|Error|Trace"; $PY jeans_skin.py 2>&1 | grep -E "REST|Error|Trace"
$PY mask_build.py /home/claude/work/jeans_skin.npz /home/claude/work/jeans_mask.npy '{"hem":0.04,"default":0.03}' 2>&1 | grep hidden
$PY jeans_uv.py 2>&1 | grep -E "surface|Error|Trace"
./run_jeans_tail.sh 2>&1 | grep -E "Error|Trace|wrote|hidden"
echo "== layering"; timeout 1500 $PY layer_check.py 2>&1 | grep "outside" | sort -t: -k2 -n | tail -4
