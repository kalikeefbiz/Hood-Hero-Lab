import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from scipy.spatial import cKDTree
npz=sys.argv[1]
d=np.load(npz,allow_pickle=True); VT=d["VT"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; W=d["W"]; bones=list(d["bones"])
arm,body=open_source()
first=None
me=body.data; R=mesh_arrays(me)
key=np.round(R*1e5).astype(np.int64); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True); inv=inv.ravel()
bfaces=[tuple(int(inv[v]) for v in p.vertices) for p in me.polygons]
loops,_=boundary_loops(F); rimv=np.array([v for l in loops for v in l])
near=cKDTree(VT[rimv]).query(VT)[0]<0.05
res=[]
for act,step in (("Idle",10),("Walk",2),("Run",2)):
    nfr=int(bpy.data.actions[act].frame_range[1])
    for fr in range(1,nfr+1,step):
        set_pose(arm,act,fr); Pb=eval_verts(body)[first]
        B=bone_matrices(arm); M=lbs_matrices(W,B,bones); G=apply_lbs(M,VT)
        bvh=make_bvh(Pb,bfaces)
        sd=np.array([signed_dist(bvh,x)[0] for x in G])
        pen=sd<0; res.append((act,fr,pen.sum(),(pen&near).sum(),sd.min()))
        print("%-5s f%3d  penetrating %4d (near rims %3d)  deepest %.4f"%(act,fr,pen.sum(),(pen&near).sum(),sd.min()),flush=True)
import json; json.dump([list(map(lambda x: x if isinstance(x,str) else float(x),r)) for r in res],open(npz.replace(".npz","_anim.json"),"w"))
