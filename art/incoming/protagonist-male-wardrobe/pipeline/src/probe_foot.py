import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
bp=BodyPrep(); P=bp.Pw; R=bp.Rw
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
for nm,Q in (("posed",P),("rest",R)):
    f=Q[(rid==7)&(Q[:,0]>0)]
    print(nm,"L foot n",len(f),"x[%.3f,%.3f] y[%.3f,%.3f] z[%.3f,%.3f]"%(f[:,0].min(),f[:,0].max(),f[:,1].min(),f[:,1].max(),f[:,2].min(),f[:,2].max()))
    l=Q[(np.isin(rid,[6,7]))&(Q[:,0]>0)&(np.abs(Q[:,2]-0.09)<0.005)]
    print("  ankle slice z0.09 x[%.3f,%.3f] y[%.3f,%.3f]"%(l[:,0].min(),l[:,0].max(),l[:,1].min(),l[:,1].max()))
pb=bp.arm.pose.bones
for b in ("foot.L","toe.L"): print(b,np.round(np.array(pb[b].head),3),np.round(np.array(pb[b].tail),3))
