import bpy, numpy as np
bpy.ops.wm.open_mainfile(filepath="/home/claude/hood-hero-lab/art/incoming/protagonist-male-rework/source/protagonist-male-rework_source.blend")
for o in bpy.data.objects:
    if o.type=="MESH":
        me=o.data; V=np.array([v.co for v in me.vertices])
        print(o.name, len(me.vertices), len(me.polygons), "z[%.3f,%.3f]"%(V[:,2].min(),V[:,2].max()), [m.name for m in me.materials], [m.type for m in o.modifiers], o.parent.name if o.parent else None, len(o.vertex_groups))
print([c.name for c in bpy.data.collections])
