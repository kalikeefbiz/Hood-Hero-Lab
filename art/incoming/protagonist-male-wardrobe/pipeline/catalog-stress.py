"""Review the catalog on the accepted protagonist in the skill's stress poses."""
import json
from pathlib import Path
import sys

import bmesh
import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from review import BODY, RIG, SCENE, aim, pose, render_batch, stress_poses, studio
from masks import covered

ROOT=Path(__file__).resolve().parents[1]
destination,*selected=sys.argv[sys.argv.index("--")+1:]
output=Path(destination).resolve()
output.mkdir(parents=True,exist_ok=True)
outfits=json.loads((ROOT/"validation/outfits.json").read_text())
if selected:
    outfits={name:outfits[name] for name in selected}
sidecar=json.loads((ROOT/"body-masks.json").read_text())["wearables"]
source_masks=json.loads((output/"source-mask-faces.json").read_text())

with bpy.data.libraries.load(str(ROOT/"source/male-starter-outfit.blend")) as (source,target):
    target.objects=[name for name in source.objects if name in ("tee-white","jeans-denim-standard","court-sneakers-white")]
for obj in target.objects:
    bpy.context.collection.objects.link(obj)
    obj.parent=RIG
    next(m for m in obj.modifiers if m.type=="ARMATURE").object=RIG
    covered_vertices=covered(obj,BODY)
    source_masks[obj.name]=[f.index for f in BODY.data.polygons if all(i in covered_vertices for i in f.vertices)]

camera=studio()
camera.location=(.69,-4.1,1.27)
camera.data.ortho_scale=2.05
aim(camera,(0,.065,.92))
SCENE.display.shading.color_type="TEXTURE"
SCENE.display.shading.light="STUDIO"
SCENE.display.shading.show_shadows=True
SCENE.display.shading.show_cavity=True
SCENE.display.shading.background_type="WORLD"
BODY.hide_render=True
head=bpy.data.objects["Head_face_01"]
stress=stress_poses.run(armature=RIG.name)
# The generic role matcher doesn't recognize this accepted head bone name.
# Add its turn to the QA-only action without touching the canonical clips.
pose(stress["action"],50)
head_bone=RIG.pose.bones["spine.006"]
stress_poses._rotate(RIG,head_bone,(0,0,1),55)
for path in ("location","rotation_quaternion","rotation_euler","scale"):
    head_bone.keyframe_insert(path,frame=50)
stress["bones_used"]["head"]=head_bone.name
stress["missing_roles"].remove("head")
results={}
for label,ids in outfits.items():
    visible=set(ids)
    if any(sidecar[name].get("coversTop") for name in ids):
        visible={name for name in ids if sidecar[name]["slot"]!="top"}
    hide=set().union(*(set(source_masks[name]) for name in visible))
    body_copy=BODY.copy()
    body_copy.data=BODY.data.copy()
    bpy.context.collection.objects.link(body_copy)
    bm=bmesh.new()
    bm.from_mesh(body_copy.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in hide],context="FACES")
    bm.to_mesh(body_copy.data)
    bm.free()
    for obj in SCENE.objects:
        if obj.type=="MESH":
            obj.hide_render=obj not in (head,body_copy) and obj.name not in visible
    for frame in stress["frames"]:
        pose(stress["action"],frame)
        render_batch.run(engine="BLENDER_WORKBENCH",preset="preview",res=(280,350),
                         percent=100,device="CPU",out=str(output/f"stress-{label}-"),frames=str(frame))
    results[label]={"visible":sorted(visible),"frames":stress["frames"]}
    oldmesh=body_copy.data
    bpy.data.objects.remove(body_copy,do_unlink=True)
    bpy.data.meshes.remove(oldmesh)
print("@@JSON@@"+json.dumps({"stress":stress,"outfits":results}))
