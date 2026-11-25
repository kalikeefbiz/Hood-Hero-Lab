"""Combine independently reviewed phase sources onto a single Round 5 rig."""
from pathlib import Path
import sys

import bpy

output, *sources = sys.argv[sys.argv.index("--") + 1:]
rig = bpy.data.objects["GAME_RIG_Body"]
rig.animation_data_clear()
rig.data.pose_position = "REST"
for bone in rig.pose.bones:
    for constraint in list(bone.constraints):
        bone.constraints.remove(constraint)
for obj in list(bpy.context.scene.objects):
    if obj != rig:
        bpy.data.objects.remove(obj, do_unlink=True)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

for source in sources:
    with bpy.data.libraries.load(str(Path(source).resolve())) as (available, selected):
        names = [name for name in available.objects if name != rig.name]
        for name in names:
            previous = bpy.context.scene.objects.get(name)
            if previous:
                bpy.data.objects.remove(previous, do_unlink=True)
        selected.objects = names
    for obj in selected.objects:
        bpy.context.collection.objects.link(obj)
        obj.parent = rig
        for modifier in obj.modifiers:
            if modifier.type == "ARMATURE":
                modifier.object = rig

assert sum(obj.type == "MESH" for obj in bpy.context.scene.objects) == 15
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=False, do_recursive=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(Path(output).resolve()), compress=True)
