import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw; bones=bp.bones
d=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
fr=np.array([np.bincount(rid[list(f)],minlength=8).argmax() for f in bp.faces])
armF=[k for k in range(len(bp.faces)) if fr[k] in (2,3)]; torF=[k for k in range(len(bp.faces)) if fr[k] in (0,1,5)]
bvhA=make_bvh(P,[bp.faces[k] for k in armF]); bvhT=make_bvh(P,[bp.faces[k] for k in torF])
isarm=np.zeros(len(V),bool)
for s_ in "LR":
    h,dv,L=bp.arm_axis(s_); t=((V-h)@dv)/L; q=(V-h)-np.outer((V-h)@dv,dv); rr=np.linalg.norm(q,axis=1)
    isarm|=((V[:,0]>0) if s_=="L" else (V[:,0]<0))&(t>0.22)&(rr<0.10)
print("sleeve verts",isarm.sum())
bvh=make_bvh(P,bp.faces)
# --- transfer: barycentric weights of the nearest body triangle
W=np.zeros((len(V),len(bones))); dB=np.zeros(len(V))
for i,p in enumerate(V):
    if isarm[i]: loc,n,fi,dd=bvhA.find_nearest(Vector(p)); fi=armF[fi]
    else: loc,n,fi,dd=bvhT.find_nearest(Vector(p)); fi=torF[fi]
    f=bp.faces[fi]; tri=P[list(f)]; q=np.array(loc)
    v0,v1=tri[1]-tri[0],tri[2]-tri[0]; v2=q-tri[0]
    d00,d01,d11,d20,d21=v0@v0,v0@v1,v1@v1,v2@v0,v2@v1; den=d00*d11-d01*d01
    b1=(d11*d20-d01*d21)/den; b2=(d00*d21-d01*d20)/den; b0=1-b1-b2
    bc=np.clip([b0,b1,b2],0,1); bc/=bc.sum()
    W[i]=bc@bp.Ww[list(f)]; dB[i]=dd
# hanging hem should follow the pelvis, not the thighs
thigh=[k for k,n in enumerate(bones) if n.startswith(("thigh","shin","foot","toe"))]
fz=np.interp(V[:,2],[0.90,0.96,1.02],[0.95,0.5,0.15])
W[:,thigh]*=fz[:,None]; W/=W.sum(1,keepdims=True)
# --- smooth over the garment graph (keeps rims/facings coherent with the outer shell)
nb=neighbors_from_faces(F,len(V))
alpha=np.clip((dB-0.008)/0.02,0,1)*0.6+0.1   # close to skin: keep the skin's weights
W0=W.copy()
for it in range(8):
    W=(1-alpha[:,None])*W+alpha[:,None]*np.array([W[n].mean(0) for n in nb])
print("dist to body: median %.4f  p90 %.4f"%(np.median(dB),np.percentile(dB,90)))
# also tie inner facing / collar verts to their nearest outer vertex (same fold moves together)
# bands (collar, hems) move as one piece: every ring copies its rim column's weights, smoothed along the loop
v3b=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
for key in ("collar","hemL","hemR","hemB"):
    rings=[list(map(int,r)) for r in v3b[key]]; base=W[rings[0]].copy()
    for _ in range(3): base=0.5*base+0.25*(np.roll(base,1,0)+np.roll(base,-1,0))
    for r in rings: W[r]=base
# top-4 influences
idx=np.argsort(-W,1)[:,:4]; W4=np.take_along_axis(W,idx,1); W4/=W4.sum(1,keepdims=True)
Wd=np.zeros_like(W); np.put_along_axis(Wd,idx,W4,1)
B=bp.B; M=lbs_matrices(Wd,B,bones)
VT=invert_lbs(M,V)
print("roundtrip err",np.abs(apply_lbs(M,VT)-V).max())
# rest-pose penetration vs rest body
bvhR=make_bvh(bp.Rw,bp.faces)
sdR=np.array([signed_dist(bvhR,x)[0] for x in VT])
print("REST: min sd %.4f  verts <0: %d  <1mm: %d"%(sdR.min(),(sdR<0).sum(),(sdR<0.001).sum()))
np.savez("/home/claude/work/tee_skin.npz",isarm=isarm,VA=V,VT=VT,F=d["F"],W=Wd,bones=np.array(bones),inner=d["inner"])
