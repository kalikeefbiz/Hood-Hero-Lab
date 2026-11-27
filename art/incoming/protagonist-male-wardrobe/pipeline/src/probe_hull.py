import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
bp=BodyPrep(); P=bp.Pw
wA=bp.grp(lambda n:n.startswith(("upper_arm","forearm","hand")))
m=(np.abs(P[:,2]-0.985)<0.01)&(np.abs(P[:,0])<0.3)
q=P[m]; print("slice n",m.sum(),"wA>0.25:",(wA[m]>0.25).sum())
print(np.round(np.c_[q[wA[m]>0.25],wA[m][wA[m]>0.25]],3)[:12])
