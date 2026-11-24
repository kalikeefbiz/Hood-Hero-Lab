"""Render the captured joint positions before the retarget bake."""
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt

source, output = map(Path, sys.argv[1:])
capture = json.loads(source.read_text())
fig, axes = plt.subplots(3, 3, figsize=(10, 9), constrained_layout=True)
fig.suptitle("100STYLE · original Xsens motion in side view", fontweight="bold", fontsize=17)
for row, (name, take) in enumerate(capture.items()):
    frames = take["frames"]
    for col, phase in enumerate((0, .25, .50)):
        ax = axes[row, col]
        frame = frames[int((len(frames) - 1) * phase)]
        hips = frame["Hips"]
        bottom = min(frame[key][2] for key in ("LeftToe", "RightToe"))
        for joint, parent in take["parents"].items():
            if parent is None:
                continue
            a, b = frame[joint], frame[parent]
            colour = "#2c6093" if joint.startswith("Left") else "#955138" if joint.startswith("Right") else "#253235"
            ax.plot([hips[1] - a[1], hips[1] - b[1]], [a[2] - bottom, b[2] - bottom],
                    linewidth=2.6, color=colour, solid_capstyle="round")
        ax.axhline(0, linewidth=.6, color="#b7c3cc")
        ax.set(xlim=(-.55, .6), ylim=(-.05, 1.72), aspect="equal", title=f"{name} · {phase:.0%} of window")
        ax.axis("off")
fig.savefig(output, dpi=135, facecolor="#f2f5f7")
