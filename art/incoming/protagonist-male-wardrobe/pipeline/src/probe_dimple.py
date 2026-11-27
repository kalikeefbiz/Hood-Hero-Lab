import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw; bvh=make_bvh(P,bp.faces)
d=np.load("/home/claude/work/tee_v2.npz"); V=d["V"]
m=(V[:,2]>0.97)&(V[:,2]<1.12)
sd=np.array([signed_dist(bvh,x)[0] for x in V[m]])
print("waist shell verts",m.sum(),"sd min %.4f p5 %.4f median %.4f"%(sd.min(),np.percentile(sd,5),np.median(sd)))
idx=np.where(m)[0][sd<0.012]
print("close verts",len(idx)); print(np.round(V[idx][:15],3))
# body points near those
for i in idx[:5]:
    _,loc,n=signed_dist(bvh,V[i]); print("nearest body",np.round(loc,3))
