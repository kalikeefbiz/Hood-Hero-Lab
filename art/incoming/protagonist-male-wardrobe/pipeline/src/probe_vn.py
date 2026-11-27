import bpy, sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
from shell_tools import vertex_normals, neighbors_from_faces
from facetypes import face_types
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; V=d["VA"]
ft=face_types(F,v3); shellF=[f for f,t in zip(F,ft) if t<=1]
N=vertex_normals(V,shellF); nb=neighbors_from_faces(shellF,len(V))
bad=[]
for i in range(len(V)):
    if len(nb[i])==0: continue
    m=N[nb[i]].mean(0); m/=np.linalg.norm(m)+1e-12
    if N[i]@m<0.5: bad.append(i)
print("deviating verts",len(bad)); print(np.round(V[bad][:20],3))
# faces with tiny area near collar
A=[]
for k,f in enumerate(shellF):
    p=V[list(f)]; a=np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))/2
    if len(f)==4: a+=np.linalg.norm(np.cross(p[2]-p[0],p[3]-p[0]))/2
    A.append(a)
A=np.array(A); print("faces area<0.2mm2:",(A<2e-7).sum())
