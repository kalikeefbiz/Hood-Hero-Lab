import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from scipy.spatial import cKDTree
bp=BodyPrep(); P=bp.Pw; bones=bp.bones
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
d=np.load("/home/claude/work/jeans_v3.npz",allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
fr=np.array([np.bincount(rid[list(f)],minlength=8).argmax() for f in bp.faces]); fc=np.array([P[list(f)].mean(0) for f in bp.faces])
groups={"L":[k for k in range(len(bp.faces)) if fr[k] in (5,6,7) and fc[k,0]>0],
        "R":[k for k in range(len(bp.faces)) if fr[k] in (5,6,7) and fc[k,0]<0],
        "T":[k for k in range(len(bp.faces)) if fr[k] in (1,5)]}
bvhs={g:make_bvh(P,[bp.faces[k] for k in ids]) for g,ids in groups.items()}
W=np.zeros((len(V),len(bones))); dB=np.zeros(len(V))
for i,p in enumerate(V):
    g="T" if p[2]>0.86 else ("L" if p[0]>0 else "R")
    loc,n,fi,dd=bvhs[g].find_nearest(Vector(p)); f=bp.faces[groups[g][fi]]; tri=P[list(f)]; q=np.array(loc)
    v0,v1=tri[1]-tri[0],tri[2]-tri[0]; v2=q-tri[0]; d00,d01,d11,d20,d21=v0@v0,v0@v1,v1@v1,v2@v0,v2@v1; den=d00*d11-d01*d01
    b1=(d11*d20-d01*d21)/den; b2=(d00*d21-d01*d20)/den; bc=np.clip([1-b1-b2,b1,b2],0,1); bc/=bc.sum()
    W[i]=bc@bp.Ww[list(f)]; dB[i]=dd
nb=neighbors_from_faces(F,len(V))
alpha=np.clip((dB-0.008)/0.02,0,1)*0.5+0.1
for it in range(8): W=(1-alpha[:,None])*W+alpha[:,None]*np.array([W[n].mean(0) for n in nb])
for key in ("waist","hemL","hemR"):
    rings=[list(map(int,r)) for r in d[key]]; base=W[rings[0]].copy()
    for _ in range(3): base=0.5*base+0.25*(np.roll(base,1,0)+np.roll(base,-1,0))
    for r in rings: W[r]=base
# belt loops: copy the nearest shell vertex
ns=int(d["nshell"]); shellv=sorted(set(v for f in F[:ns] for v in f)); kd=cKDTree(V[shellv])
for st,n in d["loops"]:
    vs=sorted(set(v for f in F[st:st+n] for v in f)); _,ii=kd.query(V[vs]); W[vs]=W[np.array(shellv)[ii]]
idx=np.argsort(-W,1)[:,:4]; W4=np.take_along_axis(W,idx,1); W4/=W4.sum(1,keepdims=True)
Wd=np.zeros_like(W); np.put_along_axis(Wd,idx,W4,1)
M=lbs_matrices(Wd,bp.B,bones); VT=invert_lbs(M,V)
print("roundtrip err",np.abs(apply_lbs(M,VT)-V).max())
bvhR=make_bvh(bp.Rw,[f for f in bp.faces if not np.all(rid[list(f)]==7)])
sdR=np.array([signed_dist(bvhR,x)[0] for x in VT]); print("REST: min sd %.4f  verts <0: %d"%(sdR.min(),(sdR<0).sum()))
np.savez("/home/claude/work/jeans_skin.npz",VA=V,VT=VT,F=d["F"],W=Wd,bones=np.array(bones),inner=d["inner"],isarm=np.zeros(len(V),bool))
