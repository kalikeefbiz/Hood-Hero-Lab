"""Preserve seam and weave contrast in the base-color fallback."""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

materials, output = map(Path, sys.argv[1:3])
for asset in dict.fromkeys("hoodie-gray-down" if item == "hoodie-gray-up" else item for item in sys.argv[3:]):
    source = materials / asset
    base, = source.glob("*_basecolor.png")
    normal, = source.glob("*_normal.png")
    rgb = np.asarray(Image.open(base).convert("RGB"), dtype=float) / 255
    tangent = np.asarray(Image.open(normal).convert("RGB"), dtype=float) / 127.5 - 1
    # A subtle, symmetric relief contribution preserves fabric and seam detail
    # without introducing a directional lighting cue into the albedo.
    relief = np.clip(1 - tangent[..., 2], 0, .45)
    rgb *= (1 - .25 * relief)[..., None]
    if "black" in asset:
        rgb = rgb * .94 + np.array([.043, .044, .046])
    path = output / asset / base.name
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.rint(np.clip(rgb, 0, 1) * 255))).save(path)
