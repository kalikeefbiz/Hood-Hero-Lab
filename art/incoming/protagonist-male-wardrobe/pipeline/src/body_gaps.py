import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from scipy.spatial import cKDTree
arm,body=open_source(); me=body.data; R=mesh_arrays(me)
key=np.round(R*1e5).astype(np.int64); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True)
rid=np.load("/home/claude/work/apose.npz")["rid"][first]
for act,step in (("Idle",20),("Walk",4),("Run",4)):
    nfr=int(bpy.data.actions[act].frame_range[1]); out=[]
    for fr in range(1,nfr+1,step):
        set_pose(arm,act,fr); Pb=eval_verts(body)[first]
        tor=cKDTree(Pb[(rid==1)|(rid==5)])
        hg=tor.query(Pb[rid==4])[0].min(); ag=tor.query(Pb[(rid==2)&(Pb[:,2]<1.25)])[0].min() if ((rid==2)&(Pb[:,2]<1.25)).any() else 9
        fg=tor.query(Pb[rid==3])[0].min()
        hz=Pb[rid==4][:,2]; out.append((fr,round(hg,3),round(ag,3),round(fg,3),round(hz.min(),2),round(hz.max(),2)))
    print(act,"(frame, hand-torso/hip gap, upperarm-torso gap, forearm gap, hand z range)"); print("  ",out)
