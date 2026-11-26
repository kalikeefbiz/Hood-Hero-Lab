import bpy, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/home/claude/work/meshy/raw_model.glb")
for o in bpy.data.objects:
    if o.type=="MESH":
        V=np.array([o.matrix_world@v.co for v in o.data.vertices]); print(o.name,len(o.data.vertices),len(o.data.polygons),"min",V.min(0).round(3),"max",V.max(0).round(3))
        # nose: most extreme point in -Y and +Y at upper third
        up=V[V[:,2]>np.percentile(V[:,2],60)]; print("front -y",up[up[:,1].argmin()].round(3),"front +y",up[up[:,1].argmax()].round(3))
