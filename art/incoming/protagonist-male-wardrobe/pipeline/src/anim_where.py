import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
d=np.load(sys.argv[1],allow_pickle=True); VT=d["VT"]; W=d["W"]; bones=list(d["bones"]); inner=set(d["inner"].tolist())
arm,body=open_source(); me=body.data; R=mesh_arrays(me)
key=np.round(R*1e5).astype(np.int64); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True); inv=inv.ravel()
bfaces=[tuple(int(inv[v]) for v in p.vertices) for p in me.polygons]
rid=np.load("/home/claude/work/apose.npz")["rid"][first]
names=["neck","torso","upper_arm","forearm","hand","upper_leg","lower_leg","foot"]
for act,fr in (("Idle",161),("Walk",23),("Run",7)):
    set_pose(arm,act,fr); Pb=eval_verts(body)[first]
    G=apply_lbs(lbs_matrices(W,bone_matrices(arm),bones),VT); bvh=make_bvh(Pb,bfaces)
    hist={}; zs=[]
    for i,x in enumerate(G):
        sd,loc,n=signed_dist(bvh,x)
        if sd<0:
            _,_,fi,_=bvh.find_nearest(Vector(x)); r=names[rid[bfaces[fi][0]]]
            k=(r,"inner" if i in inner else "outer"); hist[k]=hist.get(k,0)+1; zs.append((round(sd,3),r,np.round(VT[i],2).tolist()))
    print(act,fr,sorted(hist.items(),key=lambda t:-t[1])); zs.sort(); print("  deepest",zs[:4])
