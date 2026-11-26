import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
d=np.load(sys.argv[1],allow_pickle=True); VT=d["VT"]; W=d["W"]; bones=list(d["bones"]); inner=set(d["inner"].tolist())
hidden=np.load(sys.argv[2])
arm,body=open_source(); me=body.data; R=mesh_arrays(me)
key=np.round(R*1e5).astype(np.int64); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True); inv=inv.ravel()
bfaces=[tuple(int(inv[v]) for v in p.vertices) for p in me.polygons]
rid=np.load("/home/claude/work/apose.npz")["rid"][first]
names=["neck","torso","upper_arm","forearm","hand","upper_leg","lower_leg","foot"]
tot={}; worst={}
for act,step in (("Idle",10),("Walk",2),("Run",2)):
    nfr=int(bpy.data.actions[act].frame_range[1])
    for fr in range(1,nfr+1,step):
        set_pose(arm,act,fr); Pb=eval_verts(body)[first]
        G=apply_lbs(lbs_matrices(W,bone_matrices(arm),bones),VT); bvh=make_bvh(Pb,bfaces)
        for i,x in enumerate(G):
            if i in inner: continue
            loc,n,fi,dd=bvh.find_nearest(Vector(x))
            if dd>0.03 or hidden[fi]: continue
            sd,_,_=signed_dist(bvh,x)
            if sd<-0.001:
                r=names[rid[bfaces[fi][0]]]; tot[(act,r)]=tot.get((act,r),0)+1
                if sd<worst.get((act,r),(0,))[0]: worst[(act,r)]=(round(sd,4),fr,np.round(VT[i],2).tolist())
for k in sorted(tot): print(k,"vertex-frames",tot[k],"worst",worst[k])
