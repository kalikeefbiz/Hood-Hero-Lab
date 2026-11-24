"""Save an editable wardrobe source and export isolated modular staging GLBs."""
import json
import os
from pathlib import Path
import sys

import bpy

SKILLS = Path(os.environ.get("BLENDER_SKILLS", Path.home()/".agents/skills"))
sys.path.insert(0,str(SKILLS/"blender-export-pipelines/scripts"))
import export_asset

source, staging, *names = sys.argv[sys.argv.index("--")+1:]
rig = bpy.data.objects["GAME_RIG_Body"]
rig.animation_data_clear()
for bone in rig.pose.bones:
    for constraint in list(bone.constraints):
        bone.constraints.remove(constraint)
rig.data.pose_position = "POSE"
for obj in list(bpy.context.scene.objects):
    if obj.name not in [rig.name,*names]:
        bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
bpy.ops.outliner.orphans_purge(do_local_ids=True,do_linked_ids=False,do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()),compress=True)
for name in names:
    # The Blender exporter includes all children of the selected rig.
    # Reopen the packed source before isolating each garment.
    bpy.ops.wm.open_mainfile(filepath=str(Path(source).resolve()),load_ui=False)
    for other in names:
        if other != name:
            bpy.data.objects.remove(bpy.data.objects[other],do_unlink=True)
    result = export_asset.run(preset="web", objects=[name,"GAME_RIG_Body"],
                              out=str(Path(staging).resolve()/f"{name}.glb"),no_anim=True,
                              set=["export_meshopt_compression_enable=false","export_image_format=AUTO",
                                   "export_def_bones=false","export_tangents=true"])
    print("@@JSON@@"+json.dumps(result))
    if not result.get("ok"):
        raise RuntimeError(result)
