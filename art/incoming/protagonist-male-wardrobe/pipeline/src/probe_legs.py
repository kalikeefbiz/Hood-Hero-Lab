import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
bp=BodyPrep(); P=bp.Pw
print([b for b in bp.bones if any(k in b for k in ("thigh","shin","foot","toe","pelvis","spine"))])
for s in "LR":
    for b in ("thigh","shin","foot"):
        pb=bp.arm.pose.bones.get(f"{b}.{s}")
        if pb: print(b,s,"head",np.round(np.array(pb.head),3),"tail",np.round(np.array(pb.tail),3))
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
for z in (0.95,0.9,0.86,0.82,0.75,0.6,0.5,0.4,0.3,0.2,0.12,0.09):
    s=P[(np.abs(P[:,2]-z)<0.005)&(np.isin(rid,[1,4,5,6,7]))&(np.abs(P[:,0])<0.3)]
    L=s[s[:,0]>0.01]
    print("z %.2f n=%d  x[%.3f,%.3f] y[%.3f,%.3f]  Lx[%.3f,%.3f]"%(z,len(s),s[:,0].min(),s[:,0].max(),s[:,1].min(),s[:,1].max(),L[:,0].min() if len(L) else 0,L[:,0].max() if len(L) else 0))
