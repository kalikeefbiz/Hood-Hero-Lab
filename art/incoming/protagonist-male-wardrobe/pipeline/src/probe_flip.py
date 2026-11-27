import bpy, sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
from shell_tools import vertex_normals
d=np.load(sys.argv[1],allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
rim=set(int(v) for k in ("neck","sleeveL","sleeveR","hem") if k in d for v in d[k])
FN=[]
for f in F:
    p=V[list(f)]; n=np.cross(p[1]-p[0],p[2]-p[0])
    if len(f)==4: n=n+np.cross(p[2]-p[0],p[3]-p[0])
    FN.append(n/(np.linalg.norm(n)+1e-15))
FN=np.array(FN); VN=vertex_normals(V,F)
for k,f in enumerate(F):
    sc=np.mean([FN[k]@VN[v] for v in f])
    if sc<0.3: print(k,f,"score %.2f"%sc,"rim verts",[v for v in f if v in rim],np.round(V[list(f)].mean(0),3))
