"""Front atlas, night emissive mask and tileable side texture for each storefront.

python prep_textures.py <buildings.json> <ref dir> <out tex dir>
"""
import json, sys, os
import numpy as np
from PIL import Image

spec_path, ref, out = sys.argv[1:4]
specs = {k: v for k, v in json.load(open(spec_path)).items() if not k.startswith("_")}
os.makedirs(out, exist_ok=True)
for bid, s in specs.items():
    im = Image.open(os.path.join(ref, s["src"])).convert("RGB")
    top = min(s.get("T", 1e9), s.get("Tl", 1e9), s.get("Tr", 1e9))
    crop = im.crop((s["L"], top, s["R"], s["G"]))
    w = min(1536, crop.width) // 4 * 4
    h = round(crop.height * w / crop.width) // 4 * 4
    crop = crop.resize((w, h), Image.LANCZOS)
    crop.save(os.path.join(out, f"{bid}_atlas.png"))
    # night glow: neon and lit glass only
    a = np.asarray(crop).astype(np.float32) / 255
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    neon = ((sat > 0.5) & (mx > 0.78)).astype(np.float32)
    glass = np.zeros(a.shape[:2], np.float32)
    sx, sy = w / (s["R"] - s["L"]), h / (s["G"] - top)
    for o in s["openings"]:
        if o["k"] != "glass":
            continue
        x0, x1, y0, y1 = o["r"]
        glass[int((y0 - top) * sy):int((y1 - top) * sy), int((x0 - s["L"]) * sx):int((x1 - s["L"]) * sx)] = 0.55
    lum = a.mean(2)
    m = np.clip(np.maximum(neon, glass * np.clip(lum * 1.6, 0, 1)), 0, 1)
    Image.fromarray((a * m[..., None] * 255).astype(np.uint8)).save(os.path.join(out, f"{bid}_emissive.png"))
    # side wall: the facade's own paint bands (median colour per row of a clean
    # strip) times brick/concrete detail, so it tiles without visible repeats
    x0, x1, y0, y1 = s["side"]
    strip = np.asarray(im.crop((x0, y0, x1, y1)).resize((64, 512), Image.LANCZOS)).astype(np.float32)
    prof = np.median(strip, axis=1)                       # 512 x 3
    k = np.ones(9) / 9
    prof = np.stack([np.convolve(np.pad(prof[:, c], 4, mode="edge"), k, "valid") for c in range(3)], 1)
    det = np.asarray(Image.open(os.path.join(out, s.get("sidedetail", "concrete") + "_albedo.png")).convert("RGB")
                     .resize((512, 512), Image.LANCZOS)).astype(np.float32)
    det = det.mean(2, keepdims=True)                    # luminance only: keep the facade's colours
    det = 1 + (det / det.mean() - 1) * 0.9
    side = np.clip(prof[:, None, :] * det, 0, 255).astype(np.uint8)
    tile = Image.fromarray(side)
    tile.save(os.path.join(out, f"{bid}_side.png"))
    print(bid, crop.size, "side", tile.size)
