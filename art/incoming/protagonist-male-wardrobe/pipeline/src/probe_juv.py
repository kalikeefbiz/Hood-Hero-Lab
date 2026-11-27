import bpy, numpy as np
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/jeans_uv.blend")
me=bpy.data.objects["jeans-denim-standard"].data; U=np.load("/home/claude/work/jeans_uv.npz",allow_pickle=True); lab=U["lab"]
uv=np.zeros((len(me.loops),2)); me.uv_layers[0].data.foreach_get("uv",uv.ravel()); V=np.array([v.co for v in me.vertices])
out=[]
for p in me.polygons:
    li=list(p.loop_indices); P2=uv[li]; e1=P2[1]-P2[0]; e2=P2[2]-P2[0]; a2=abs(e1[0]*e2[1]-e1[1]*e2[0])/2
    out.append((a2,p.index,lab[p.index],len(li),np.round(V[list(p.vertices)].mean(0),3)))
out.sort(key=lambda t:-t[0]); print(out[:5])
# check manifoldness / duplicate faces
from collections import Counter
fs=Counter(tuple(sorted(p.vertices)) for p in me.polygons); print("duplicate faces",sum(1 for v in fs.values() if v>1))
