import bpy
import sys; sys.path.insert(0,"/home/claude/work/pipe")
import numpy as np
from shell_tools import vertex_normals
d=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
# front-centre strip profile
m=(np.abs(V[:,0])<0.012)&(V[:,1]<0)&(V[:,2]>0.95)&(V[:,2]<1.3)
s=V[m]; s=s[np.argsort(s[:,2])]
print("front strip y vs z:"); print(np.round(s[::2][:,[2,1]],4).T)
# face quality: tiny/flipped
FN=[];A=[]
for f in F:
    p=V[list(f)]; n=np.cross(p[1]-p[0],p[2]-p[0]); 
    if len(f)==4: n=n+np.cross(p[2]-p[0],p[3]-p[0])
    A.append(np.linalg.norm(n)/2); FN.append(n/ (np.linalg.norm(n)+1e-15))
A=np.array(A); FN=np.array(FN); VN=vertex_normals(V,F)
bad=[k for k,f in enumerate(F) if np.mean([FN[k]@VN[v] for v in f])<0.2]
print("faces",len(F),"area<1e-7:",(A<1e-7).sum(),"faces disagreeing with vertex normals:",len(bad))
print([ (k,np.round(V[list(F[k])].mean(0),3).tolist(), round(A[k]*1e6,2)) for k in bad[:12]])
