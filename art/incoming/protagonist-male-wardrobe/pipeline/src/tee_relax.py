import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw
d=np.load("/home/claude/work/tee_shell0.npz"); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
hem_end=d["hem_end"]; hem=d["hem"]; neck=d["neck"]; sl=np.concatenate([d["sleeveL"],d["sleeveR"]])
bvh=make_bvh(P,bp.faces); nb=neighbors_from_faces(F,len(V))
N0=vertex_normals(P,bp.faces)
nv_body=len(V)
# ease per vertex: snug at shoulders/neck, loose at torso/hem, airy sleeves
z=V[:,2]
ease=np.interp(z,[0.70,0.96,1.15,1.35,1.46],[0.030,0.022,0.014,0.007,0.004])
ease[sl]=0.016
# initial: push along nearest-body normal
X=V.copy()
for i in range(len(V)):
    sd,loc,n=signed_dist(bvh,V[i])
    if loc is None: continue
    X[i]=V[i]+n*ease[i] if i<len(d["vid"]) else V[i]+ (n*ease[i])
fixed=set(map(int,neck))|set(map(int,sl))
hem_free=set(range(len(d["vid"]),len(V)))
def project(X):
    for i in range(len(X)):
        sd,loc,n=signed_dist(bvh,X[i])
        if loc is None: continue
        mn=min(ease[i]*0.5,0.012)+0.002
        if sd<mn: X[i]=loc+n*mn
    return X
for it in range(60):
    Y=X.copy()
    for i in range(len(X)):
        if i in fixed and it<50: pass
        c=X[nb[i]].mean(0)
        a=0.35 if i not in fixed else 0.15
        Y[i]=X[i]+a*(c-X[i])
    X=project(Y)
# hem skirt: hang more freely, gravity pulls straight down then collide
sd=np.array([signed_dist(bvh,x)[0] for x in X])
print("min signed dist %.4f  mean %.4f  max %.4f"%(sd.min(),sd.mean(),sd.max()))
np.save("/home/claude/work/tee_X.npy",X)
