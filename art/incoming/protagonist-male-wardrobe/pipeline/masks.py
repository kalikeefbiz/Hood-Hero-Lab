"""Generate reversible masks for the exact accepted, indexed Body primitive."""
import json
from pathlib import Path
import sys

import bmesh
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from catalog_config import TOPS, BOTTOMS, FOOTWEAR
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

SLOTS = {
    "tee-white": ("top", ["region_torso","region_upper_arms"]),
    "jeans-denim-standard": ("bottom", ["region_torso","region_upper_legs","region_lower_legs"]),
    "court-sneakers-white": ("footwear", ["region_feet","region_lower_legs"]),
}

for name,config in TOPS.items():
    shape=config["shape"]
    slot="outerwear" if shape in ("hoodie","windbreaker","puffer") else "top"
    groups=["region_torso","region_upper_arms"]
    if shape in ("hoodie","windbreaker","puffer","flannel"):
        groups.append("region_forearms")
    SLOTS[name]=(slot,groups)
for name,config in BOTTOMS.items():
    SLOTS[name]=("bottom",["region_torso","region_upper_legs"]+([] if config["shape"]=="shorts" else ["region_lower_legs"]))
for name,config in FOOTWEAR.items():
    SLOTS[name]=("footwear",["region_feet","region_lower_legs"] if config["shape"]=="court" else [])


def covered(obj,body):
    if obj.name in ("flip-flops","slides-black"):
        return set()
    shape=TOPS.get(obj.name,BOTTOMS.get(obj.name,{"shape":"other"}))["shape"]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # The shoe mixes closed tread, an open collar and small lace islands.
    # Use the modeled upper for the clearance test, and ignore lace ends.
    border = [e for e in bm.edges if e.is_boundary]
    if obj.name.startswith("court-sneakers"):
        border = [e for e in border if min(v.co.y for v in e.verts) > -.035]
    boundary = [e.verts[0].co.lerp(e.verts[1].co,t) for e in border for t in (0,.5)]
    tree = KDTree(len(boundary))
    for i,point in enumerate(boundary):
        tree.insert(point,i)
    tree.balance()
    surface = BVHTree.FromBMesh(bm)
    bm.free()

    def eligible(co):
        x,y,z = co
        if obj.name.startswith("tee"):
            return .982 < z and abs(x)<.367
        if shape=="tank":
            return .985<z<1.49 and abs(x)<.18
        if shape=="flannel":
            return .946<z and abs(x)<.685
        if shape=="windbreaker":
            return z>.968 and abs(x)<.685
        if shape in ("hoodie","puffer"):
            return .963<z and abs(x)<.685
        if shape=="shorts":
            return .56<z<.993
        if obj.name.startswith("jeans") or obj.name in BOTTOMS:
            return (.09 if shape=="baggy" else .105)<z<.993
        return z < max(.071,.111-y*.19)

    result = set()
    for v in body.data.vertices:
        x,y,z=v.co
        closed_torso = shape in ("flannel", "hoodie", "puffer") or obj.name.startswith("tee")
        if abs(x) < .18 and 1.008 < z < 1.39 and (closed_torso or (shape == "windbreaker" and y > .045)):
            result.add(v.index)
            continue
        # At the shoulder cap, the closest surface can be the collar rim
        # instead of the covering sleeve. Keep the neckline and hide just
        # the under-sleeve patch outside the collar.
        if shape in ("flannel","hoodie","windbreaker","puffer") and .154<abs(x)<.252 and 1.426<z<1.535:
            result.add(v.index)
            continue
        if not eligible(v.co):
            continue
        _,_,dist = tree.find(v.co)
        if dist is not None and dist<.013:
            continue
        outward,n,_,distance = surface.ray_cast(v.co,v.normal,.120)
        if outward and v.normal.dot(n)>.22:
            result.add(v.index)
            continue
        # Very small intersecting skin patches can be safely occluded if they
        # are between the same surface and the conservatively retained rim.
        inward,n,_,distance = surface.ray_cast(v.co,-v.normal,.010)
        if inward and v.normal.dot(n)>.55:
            result.add(v.index)
    return result


def ranges(values):
    output=[]
    for i in values:
        if output and i==output[-1][0]+output[-1][1]:
            output[-1][1]+=1
        else:
            output.append([i,1])
    return output


def main(runtime_path,out,selected):
    reference=json.loads(Path(runtime_path).read_text())
    bpy.context.view_layer.update()
    body=bpy.data.objects["Body"]
    tree=KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        tree.insert(v.co,v.index)
    tree.balance()
    matched=[tree.find(Vector(p))[1:] for p in reference["vertices"]]
    maximum=max(dist for _,dist in matched)
    if maximum>.002:
        raise ValueError(f"Source body does not match accepted runtime body: {maximum:.5f} m")
    index=reference["indices"]
    out=Path(out)
    result={
        "bodySha256":reference["sha256"],
        "node":reference["node"],"primitive":reference["primitive"],
        "indexCount":len(index),
        "encoding":"zero-based triangle ordinal ranges [start,count]",
        "maxSourceVertexMatchErrorMeters":round(maximum,6),
        "wearables":{},
    }
    masks={}
    for name in selected:
        masks[name]=covered(bpy.data.objects[name],body)
        hidden=[i//3 for i in range(0,len(index),3)
                if all(matched[j][0] in masks[name] for j in index[i:i+3])]
        slot,regions=SLOTS[name]
        result["wearables"][name]={"slot":slot,"regions":regions,"triangles":len(hidden),"ranges":ranges(hidden)}
        if slot=="outerwear":
            result["wearables"][name]["coversTop"]=name!="windbreaker-black-open"
    (out/"body-masks.json").write_text(json.dumps(result,separators=(",",":"))+"\n")
    (out/"source-mask-faces.json").write_text(json.dumps({
        name:[poly.index for poly in body.data.polygons if all(i in verts for i in poly.vertices)]
        for name,verts in masks.items()
    }))


if __name__=="__main__":
    runtime_path,output,*items=sys.argv[sys.argv.index("--")+1:]
    main(runtime_path,output,items)
    print("@@JSON@@"+json.dumps({"ok":True,"wearables":len(items)}))
