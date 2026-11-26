import bpy, sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
from shell_tools import vertex_normals
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/tee_uv.blend")
me=bpy.data.objects["tee-white"].data
V=np.array([v.co for v in me.vertices]); F=[tuple(p.vertices) for p in me.polygons]
N=vertex_normals(V,F)
cn=np.array([c.vector for c in me.corner_normals])
li=np.array([l.vertex_index for l in me.loops])
dev=np.einsum("ij,ij->i",cn,N[li])
bad=np.where(dev<0.8)[0]
print("loops",len(li),"deviating corner normals",len(bad),"smooth faces",sum(p.use_smooth for p in me.polygons),"/",len(me.polygons))
vb=np.unique(li[bad]); print(np.round(V[vb][:15],3))
print("sharp edges", sum(1 for e in me.edges if e.use_edge_sharp))
