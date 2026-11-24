"""Render and measure wearables on the real animated protagonist."""
import json
import os
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

SKILLS = Path(os.environ.get("BLENDER_SKILLS", Path.home() / ".agents/skills"))
for name in ("clothing","character-rigging","rendering"):
    sys.path.insert(0, str(SKILLS/f"blender-{name}"/"scripts"))
import garment
import render_batch
import stress_poses

SCENE = bpy.context.scene
BODY = bpy.data.objects["Body"]
RIG = BODY.parent


def aim(obj, point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat("-Z","Y").to_euler()


def studio():
    for o in SCENE.objects:
        if o.type in {"CAMERA","LIGHT"}:
            bpy.data.objects.remove(o,do_unlink=True)
    for name, at, power, size, tint in (
        ("Key",(-3,-4,5),490,3.0,(1,.94,.88)),
        ("Fill",(3,-2,2.6),265,3.1,(.82,.90,1)),
        ("Rim",(1,3,4),550,2.3,(.91,.94,1)),
    ):
        lamp = bpy.data.lights.new(name,"AREA")
        lamp.energy, lamp.shape, lamp.size, lamp.color = power,"DISK",size,tint
        light = bpy.data.objects.new(name,lamp)
        SCENE.collection.objects.link(light)
        light.location = at
        aim(light,(0,0,.88))
    w = bpy.data.worlds.new("Wardrobe studio")
    w.use_nodes = True
    w.node_tree.nodes.get("Background").inputs[0].default_value = (.13,.13,.13,1)
    w.node_tree.nodes.get("Background").inputs[1].default_value = .55
    SCENE.world = w
    c = bpy.data.cameras.new("Review")
    c.type = "ORTHO"
    camera = bpy.data.objects.new("Review",c)
    SCENE.collection.objects.link(camera)
    SCENE.camera = camera
    return camera


def pose(clip=None, frame=0):
    RIG.data.pose_position = "POSE" if clip else "REST"
    RIG.animation_data.action = bpy.data.actions.get(clip) if clip else None
    SCENE.frame_set(frame)
    bpy.context.view_layer.update()


def render(camera, output, target, offset, scale, res=(480,640)):
    camera.location = Vector(target)+Vector(offset)
    aim(camera,target)
    camera.data.ortho_scale = scale
    return render_batch.run(engine="CYCLES", preset="preview", samples=12, percent=100,
                            res=res, out=str(output), frames=str(SCENE.frame_current),
                            device="CPU", view="AgX")


def main(folder, names, mode):
    assets = [bpy.data.objects[name] for name in names]
    for o in SCENE.objects:
        if o.type=="MESH":
            o.hide_render = o not in (BODY,bpy.data.objects["Head_face_01"],*assets)
    camera = studio()
    if mode in {"images","tee","standalone"}:
        for obj in assets:
            for o in (BODY,bpy.data.objects["Head_face_01"],*assets):
                o.hide_render = o != obj
            pose()
            bbox = [Vector(c) for c in obj.bound_box]
            center = sum(bbox,Vector())/8
            scale = max(obj.dimensions)*1.19
            for angle, off in (("front",(1.40,-4,1.15)),("back",(-1.30,4,.60))):
                render(camera, folder/f"{obj.name}-{angle}", center, off, scale, (380,380) if mode=="standalone" else (500,500))
        if mode=="standalone":
            return
        for o in (BODY,bpy.data.objects["Head_face_01"],*assets):
            o.hide_render = False
        if mode == "tee":
            pose("Idle", 60)
            render(camera, folder/"tee-idle-fit", (0, .065, 1.25), (.13, -3, .13), .88)
            pose("Run", 6)
            render(camera, folder/"tee-run-fit", (0, .065, 1.25), (1.5, -3, .32), .88)
            return

    mask_files = folder/"source-mask-faces.json"
    if mask_files.exists():
        hide = set().union(*(set(indices) for name,indices in json.loads(mask_files.read_text()).items() if name in names))
        body_preview = BODY.copy()
        body_preview.data = BODY.data.copy()
        bpy.context.collection.objects.link(body_preview)
        bm = bmesh.new()
        bm.from_mesh(body_preview.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index in hide],context="FACES")
        bm.to_mesh(body_preview.data)
        bm.free()
        BODY.hide_render = True
        body_preview.hide_render = False
    else:
        body_preview = BODY
    results = {}
    for clip, frames in ((None,[0]),("Idle",list(range(0,241,4))),
                         ("Walk",list(range(37))),("Run",list(range(23)))):
        results[clip or "rest"] = []
        for frame in frames:
            pose(clip,frame)
            results[clip or "rest"].append({"frame":frame,"assets":{
                obj.name:{"unmasked":garment.penetration(obj,BODY),
                          "masked":garment.penetration(obj,body_preview)} for obj in assets
            }})
    stress = stress_poses.run(armature=RIG.name)
    results["stress"] = []
    for frame in stress["frames"]:
        pose(stress["action"],frame)
        results["stress"].append({"frame":frame,"assets":{
            obj.name:{"unmasked":garment.penetration(obj,BODY),
                          "masked":garment.penetration(obj,body_preview)} for obj in assets
        }})
    (folder/"poke-scan.json").write_text(json.dumps(results,indent=2)+"\n")
    pose()
    render(camera, folder/"equipped-rest", (0,.06,.89), (1,-4,.22),2.0)
    for action,frames in (("Idle",[60]),("Walk",[6,24]),("Run",[5,16]),("QA_Stress",[10,20,30,40,50])):
        for frame in frames:
            pose(action,frame)
            render(camera, folder/f"equipped-{action.lower()}-{frame}", (0,.06,.89),
                   (2 if frame%2==0 else -1.25,-4,.20),2.0)


if __name__ == "__main__":
    dest,mode,*items = sys.argv[sys.argv.index("--")+1:]
    main(Path(dest).resolve(),items,mode)
