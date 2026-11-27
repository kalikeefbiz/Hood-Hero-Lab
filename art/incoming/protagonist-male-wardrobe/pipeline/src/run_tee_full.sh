#!/bin/bash
set -e
PY=/home/claude/work/bpyenv/bin/python; cd /home/claude/work/pipe
$PY tee_finish.py 2>&1 | grep -E "pushed|untangle|Error|Trace"; $PY tee_skin.py 2>&1 | grep -E "REST|Error|Trace"
$PY mask_build.py /home/claude/work/tee_skin.npz /home/claude/work/tee_mask.npy '{"neck":0.02,"sleeve":0.035,"hem":0.05}' 2>&1 | grep hidden
./run_tee_tail.sh 2>&1 | grep -E "Error|Trace|coverage|wrote" || true
