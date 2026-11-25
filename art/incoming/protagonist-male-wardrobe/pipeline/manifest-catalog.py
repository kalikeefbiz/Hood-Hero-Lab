"""Add validated output measurements and merge masks with the starter records."""
import json
from pathlib import Path
import sys

from catalog_config import TOPS, BOTTOMS, FOOTWEAR

ROOT=Path(__file__).resolve().parents[1]
STAGING=Path(sys.argv[1])
directory=ROOT/"manifest.json"
manifest=json.loads(directory.read_text())
masks=json.loads((ROOT/"body-masks.json").read_text())
new=json.loads((STAGING/"body-masks.json").read_text())
for key in ("bodySha256","node","primitive","indexCount"):
    if masks[key]!=new[key]:
        raise ValueError(f"Cannot combine masks for different canonical body inputs: {key}")
masks["wearables"].update(new["wearables"])
(ROOT/"body-masks.json").write_text(json.dumps(masks,separators=(",",":"))+"\n")

labels={
    "tee-stixx-black":"The Stixx Black Graphic T-Shirt",
    "tank-white":"White Ribbed Tank Top",
    "flannel-long-sleeve":"Long-Sleeve Flannel",
    "hoodie-gray-down":"Gray Hoodie, Hood Down",
    "hoodie-gray-up":"Gray Hoodie, Hood Up",
    "windbreaker-black-open":"Open Black Windbreaker",
    "puffer-black-closed":"Closed Black Puffer Jacket",
    "jeans-black-skinny":"Black Skinny Jeans",
    "jeans-denim-baggy":"Baggy Denim Jeans",
    "cargo-black":"Black Cargo Pants",
    "sweats-gray":"Gray Sweatpants",
    "shorts-athletic":"Navy Athletic Shorts",
    "flip-flops":"Flip-Flops",
    "slides-black":"Black Slides",
    "court-sneakers-black":"Black Low-Top Court Sneakers",
}
limitations={
    "tee-stixx-black":"Shares the white crewneck fit. Extreme shoulder elevation can reveal a small patch at the collar or sleeve root.",
    "tank-white":"The deep armhole exposes the side of the upper torso as designed. The binding can crease against the shoulder at extreme elevation.",
    "flannel-long-sleeve":"The point collar and cuff can bunch in extreme arm and chest motion.",
    "hoodie-gray-down":"The folded hood rests near the back of the neck. A hard neck turn can compress the fold.",
    "hoodie-gray-up":"A hard neck turn can bunch the lower hood at the shoulder. Small skin flecks can show near the collar in a Run close-up. Hair needs a separate hood-fit check.",
    "windbreaker-black-open":"Layering was reviewed over the Stixx tee, which shares the white tee geometry. Larger or bulky tops need a fit check.",
    "puffer-black-closed":"Padded sleeves compress at the armhole in extreme arm raises. Hide the underlying top as documented.",
    "jeans-black-skinny":"A narrow ankle ring can show when the foot flexes. Deep knee flex compresses the fabric behind the knee.",
    "jeans-denim-baggy":"Long cuffs drape onto low footwear. Check the cuff over thicker footwear and in deep bends.",
    "cargo-black":"Bellows pockets fold with the thigh during deep crouches. A narrow ankle ring can show over low court shoes.",
    "sweats-gray":"Gathered ankle fabric can overlap the edge of the shoe collar during the stride.",
    "shorts-athletic":"Canonical Idle can place fingertips at the outer hip. The short cuffs leave the knee and lower leg visible.",
    "flip-flops":"The complete foot is visible. The toe post and strap fit are most sensitive during forefoot flex.",
    "slides-black":"The complete foot is visible. The molded band sits close to the foot in forefoot flex.",
    "court-sneakers-black":"Identical fit to the white court shoes. A small ankle ring can show with a short or flexed cuff.",
}
asset_records=manifest["modular"]["wearables"]
for row in json.loads((ROOT/"validation/catalog-exports.json").read_text()):
    asset=row["id"]
    config=(TOPS|BOTTOMS|FOOTWEAR)[asset]
    slot=masks["wearables"][asset]["slot"]
    folder=slot+"s" if slot in ("top","bottom") else slot
    closed=masks["wearables"][asset].get("coversTop",False)
    tex_ref=f"ref/{asset}.jpg"
    body_mask="Mask the covered body triangles. Preserve the visible skin and the opening margins."
    if asset in ("flip-flops","slides-black"):
        body_mask="Preserve the entire foot and lower leg."
    elif asset=="shorts-athletic":
        body_mask="Preserve lower legs and a ring of thigh at the cuff."
    elif asset=="windbreaker-black-open":
        body_mask="Mask covered shoulder and arm geometry. Keep the skin or shirt in the front opening."
    elif asset.startswith("court-sneakers"):
        body_mask="Mask the covered foot. Keep a ring of skin inside the collar."
    asset_records[asset]={
        "label":labels[asset],"slot":slot,"file":f"models/{folder}/{asset}.glb",
        "sourceArt":[tex_ref],"bodyVersion":manifest["bodyVersion"],
        "skeletonVersion":manifest["skeletonVersion"],
        "bodyVisibility":{"maskFile":"body-masks.json","maskKey":asset,"description":body_mask},
        "layerCompatibility":{"coversTop":closed},
        "knownClippingLimitations":limitations[asset],
        "triangles":row["triangles"],"materials":row["materialCount"],
        "textureResolution":row["textures"][0],"bytes":row["bytes"],
    }
    if asset.startswith("hoodie"):
        asset_records[asset]["garmentFamily"]="hoodie-gray"
        asset_records[asset]["hood"]=config["hood"]
        asset_records[asset]["sharedMaterials"]="hoodie-gray-down"
    if asset=="hoodie-gray-up":
        asset_records[asset]["layerCompatibility"]["hair"]="Hide hair unless the style has been tested inside the raised hood."
    if asset=="windbreaker-black-open":
        asset_records[asset]["layerCompatibility"]["topIds"]=["tee-white","tee-stixx-black","tank-white"]
    if asset in ("tee-stixx-black","court-sneakers-black"):
        ref="tee-white" if asset=="tee-stixx-black" else "court-sneakers-white"
        asset_records[asset]["sharedGeometry"]=ref
    if slot=="footwear":
        asset_records[asset]["groundOffsetMeters"]=.023 if config["shape"]=="court" else .020
manifest["catalogSource"]="source/male-wardrobe-catalog.blend"
art="art/source/hood-hero/protagonist/male/ref/outwear-master.PNG"
if art not in manifest["sourceArt"]:
    manifest["sourceArt"].append(art)
directory.write_text(json.dumps(manifest,indent=2)+"\n")
