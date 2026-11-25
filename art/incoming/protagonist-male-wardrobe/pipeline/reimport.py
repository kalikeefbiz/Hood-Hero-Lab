"""Round-trip the isolated staging exports through Blender's glTF importer."""
import json
from pathlib import Path
import sys

import bpy

records = []
for file in sys.argv[sys.argv.index("--")+1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(file).resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type=="MESH" and any(m.type=="ARMATURE" for m in obj.modifiers)]
    rigs = [obj for obj in bpy.context.scene.objects if obj.type=="ARMATURE"]
    assert len(meshes)==len(rigs)==1
    obj,rig=meshes[0],rigs[0]
    assert obj.modifiers[0].object == rig and len(rig.data.bones)==36
    assert not bpy.data.actions
    assert all(abs(v-1)<1e-5 for v in (*obj.scale,*rig.scale))
    obj.data.calc_loop_triangles()
    records.append({"id":Path(file).stem, "objects":len(meshes), "joints":len(rig.data.bones),
                    "triangles":len(obj.data.loop_triangles),
                    "sizeM":list(obj.dimensions), "uvLayers":len(obj.data.uv_layers)})
print("@@JSON@@"+json.dumps(records))
