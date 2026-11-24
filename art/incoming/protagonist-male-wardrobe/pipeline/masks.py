"""Generate reversible masks for the exact accepted, indexed Body primitive."""
import json
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

SLOTS = {
    "tee-white": ("top", ["region_torso","region_upper_arms"]),
    "jeans-denim-standard": ("bottom", ["region_torso","region_upper_legs","region_lower_legs"]),
    "court-sneakers-white": ("footwear", ["region_feet","region_lower_legs"]),
}


def covered(obj,body):
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
    shape = BVHTree.FromBMesh(bm)
    bm.free()

    def eligible(co):
        x,y,z = co
        if obj.name.startswith("tee"):
            return .982 < z and abs(x)<.367
        if obj.name.startswith("jeans"):
            return .105 < z < .993
        return z < max(.071,.111-y*.19)

    result = set()
    for v in body.data.vertices:
        if not eligible(v.co):
            continue
        _,_,dist = tree.find(v.co)
        if dist is not None and dist<.013:
            continue
        outward,n,_,distance = shape.ray_cast(v.co,v.normal,.120)
        if outward and v.normal.dot(n)>.22:
            result.add(v.index)
            continue
        # Very small intersecting skin patches can be safely occluded if they
        # are between the same surface and the conservatively retained rim.
        inward,n,_,distance = shape.ray_cast(v.co,-v.normal,.010)
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
    (out/"body-masks.json").write_text(json.dumps(result,separators=(",",":"))+"\n")
    (out/"source-mask-faces.json").write_text(json.dumps({
        name:[poly.index for poly in body.data.polygons if all(i in verts for i in poly.vertices)]
        for name,verts in masks.items()
    }))


if __name__=="__main__":
    main(*sys.argv[sys.argv.index("--")+1:][:2],sys.argv[sys.argv.index("--")+3:])
