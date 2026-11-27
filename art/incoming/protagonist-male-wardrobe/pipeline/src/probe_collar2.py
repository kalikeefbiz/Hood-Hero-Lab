import bpy, sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
from shell_tools import vertex_normals
from facetypes import face_types
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; V=d["VT"]; ft=face_types(F,v3)
outer=[f for f,t in zip(F,ft) if t<=1]; N=vertex_normals(V,outer)
col=[list(map(int,r)) for r in v3["collar"]]
for r in range(3):
    R=np.array(col[r]); P=V[R]; nn=N[R]
    # angle between consecutive normals along the ring
    dots=np.einsum("ij,ij->i",nn,np.roll(nn,-1,0)); k=np.argsort(dots)[:3]
    print("ring",r,"min consecutive normal dot",dots[k].round(3),"at",P[k].round(3).tolist())
# faces of outer band with flipped orientation vs neighbours
FN=[]
for f in outer:
    p=V[list(f)]; n=np.cross(p[1]-p[0],p[2]-p[0]); n=n+(np.cross(p[2]-p[0],p[3]-p[0]) if len(f)==4 else 0); FN.append(n/np.linalg.norm(n))
bad=[(i,np.round(V[list(f)].mean(0),3).tolist()) for i,f in enumerate(outer) if np.mean([FN[i]@N[v] for v in f])<0.5]
print("outer faces disagreeing:",len(bad),bad[:8])
