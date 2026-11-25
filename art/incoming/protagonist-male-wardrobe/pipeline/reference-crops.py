"""Make untouched crops at the design panel boundaries of the approved artwork."""
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
REFERENCES=ROOT.parents[2]/"art/source/hood-hero/protagonist/male/ref"
BOXES={
    "tops-master.PNG":{
        "tank-white":(8,72,337,436), "tee-white":(344,73,671,434),
        "tee-stixx-black":(8,447,336,830), "flannel-long-sleeve":(344,447,670,830),
    },
    "outwear-master.PNG":{
        "hoodie-gray-down":(7,68,336,443), "hoodie-gray-up":(343,68,674,444),
        "windbreaker-black-open":(7,449,336,825), "puffer-black-closed":(344,449,674,825),
    },
    "bottoms-master.PNG":{
        "jeans-black-skinny":(6,54,229,438), "jeans-denim-baggy":(235,54,449,438),
        "jeans-denim-standard":(455,54,674,432), "cargo-black":(6,443,230,836),
        "sweats-gray":(235,443,449,836), "shorts-athletic":(455,443,674,836),
    },
    "footwear-master.PNG":{
        "flip-flops":(8,60,336,428), "slides-black":(345,60,672,428),
        "court-sneakers-white":(9,432,335,822), "court-sneakers-black":(345,432,671,822),
    },
}
for sheet,items in BOXES.items():
    with Image.open(REFERENCES/sheet) as source:
        factor=source.height/850
        for name,frame in items.items():
            crop=source.crop(tuple(round(v*factor) for v in frame))
            path=ROOT/"ref"/f"{name}.jpg"
            if not path.exists():
                crop.convert("RGB").save(path,quality=92)
        if sheet=="tops-master.PNG":
            source.crop(tuple(round(v*factor) for v in (80,686,162,765))).save(ROOT/"ref/stixx-logo-panel.png")
