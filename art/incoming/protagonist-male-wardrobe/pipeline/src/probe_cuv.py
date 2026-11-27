import bpy, sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/tee_uv.blend")
me=bpy.data.objects["tee-white"].data
U=np.load("/home/claude/work/tee_uv.npz",allow_pickle=True); lab=U["lab"]
uv=np.zeros((len(me.loops),2)); me.uv_layers[0].data.foreach_get("uv",uv.ravel())
V=np.array([v.co for v in me.vertices]); out=[]
for p in me.polygons:
    if lab[p.index]!="collar": continue
    li=list(p.loop_indices); vs=list(p.vertices); P3=V[vs]; P2=uv[li]
    a3=np.linalg.norm(np.cross(P3[1]-P3[0],P3[2]-P3[0])); e1=P2[1]-P2[0]; e2=P2[2]-P2[0]; a2=(e1[0]*e2[1]-e1[1]*e2[0])
    out.append((np.sqrt(abs(a2)/max(a3,1e-12)),np.sign(a2),P3.mean(0)))
r=np.array([o[0] for o in out]); sg=np.array([o[1] for o in out]); med=np.median(r)
print("collar faces",len(r),"scale ratio min %.2f max %.2f; flipped(sign differs from majority) %d"%(r.min()/med,r.max()/med,(sg!=np.sign(np.median(sg))).sum()))
for o in out:
    if o[0]/med>2 or o[0]/med<0.5 or o[1]!=np.sign(np.median(sg)): print(round(o[0]/med,2),o[1],np.round(o[2],3))
