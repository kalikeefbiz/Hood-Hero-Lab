"""Publish the final render evidence from the catalog's disposable staging directory."""
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw
from catalog_config import TOPS, BOTTOMS, FOOTWEAR

root=Path(__file__).resolve().parents[1]
staging=Path(sys.argv[1])
destination=root/"previews"/"catalog"
destination.mkdir(parents=True,exist_ok=True)
outfits=json.loads((root/"validation/outfits.json").read_text())
runtime=json.loads((staging/"runtime/catalog-runtime.json").read_text())

for asset in (TOPS|BOTTOMS|FOOTWEAR):
    for angle in ("front","back"):
        image=Image.open(staging/f"{asset}-{angle}0000.png")
        image.convert("RGB").save(destination/f"{asset}-{angle}.jpg",quality=91)

for name in outfits:
    src=staging/"runtime"/name
    steps=("idle","walk","run","back")
    w,h=300,396
    page=Image.new("RGB",(w*len(steps),h+32),(54,59,66))
    draw=ImageDraw.Draw(page)
    for i,clip in enumerate(steps):
        image=Image.open(src/f"threejs-{clip}.png")
        page.paste(image.resize((w,h),Image.Resampling.LANCZOS),(i*w,32))
        draw.text((i*w+14,10),clip.capitalize(),fill=(242,242,243))
    page.save(destination/f"equipped-{name}.jpg",quality=92)
    w,h=250,312
    frames=(1,10,20,30,40,50)
    page=Image.new("RGB",(w*len(frames),h+30),(58,58,59))
    draw=ImageDraw.Draw(page)
    for i,frame in enumerate(frames):
        image=Image.open(staging/f"stress-{name}-{frame:04}.png")
        page.paste(image.resize((w,h),Image.Resampling.LANCZOS),(i*w,30))
        draw.text((i*w+12,8),f"Frame {frame}",fill=(242,242,243))
    page.save(destination/f"stress-{name}.jpg",quality=92)
(root/"validation/catalog-runtime.json").write_text(json.dumps(runtime,indent=2)+"\n")
