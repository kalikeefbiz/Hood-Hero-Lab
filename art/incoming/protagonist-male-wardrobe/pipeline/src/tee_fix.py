import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw
d=np.load("/home/claude/work/tee_shell0.npz")
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
X=np.load("/home/claude/work/tee_X.npy")
bvh=make_bvh(P,bp.faces)
for k in range(12):
    bad=0
    for i in range(len(X)):
        sd,loc,n=signed_dist(bvh,X[i])
        if sd<0.004: X[i]=loc+n*0.006; bad+=1
    nb=neighbors_from_faces(F,len(X))
    if k%3==2:
        Y=X.copy()
        for i in range(len(X)): Y[i]=X[i]+0.2*(X[nb[i]].mean(0)-X[i])
        X=Y
    print(k,"fixed",bad)
sd=np.array([signed_dist(bvh,x)[0] for x in X]); print("min",sd.min(),"max",sd.max())
np.save("/home/claude/work/tee_X.npy",X)
# quick point-cloud render front/side/back
from PIL import Image, ImageDraw
im=Image.new("RGB",(1800,900),(30,30,36)); dr=ImageDraw.Draw(im)
def proj(p,view):
    if view==0: return p[0],p[2]
    if view==1: return -p[1],p[2]
    return -p[0],p[2]
for vi in range(3):
    for p in P:
        if 0.75<p[2]<1.56:
            u,v=proj(p,vi); dr.point((vi*600+300+u*500,900-(p[2]-0.72)*1000+0),fill=(70,70,80))
    for f in F:
        pts=[proj(X[k],vi) for k in f]
        pts=[(vi*600+300+u*500,900-(v-0.72)*1000) for u,v in pts]
        dr.polygon(pts,outline=(240,200,60))
im.save("/home/claude/work/tee_shell_view.png")
