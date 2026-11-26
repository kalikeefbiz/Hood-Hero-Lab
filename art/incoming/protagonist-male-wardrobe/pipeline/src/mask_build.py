"""Body mask for a garment: hide body polygons that are covered by the garment (rest pose) and far enough from its rims."""
import sys, json; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from scipy.spatial import cKDTree
npz, out = sys.argv[1], sys.argv[2]
margins = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
d=np.load(npz,allow_pickle=True); VT=d["VT"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
arm,body=open_source(); me=body.data; R=mesh_arrays(me)
key=np.round(R*1e5).astype(np.int64); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True); inv=inv.ravel()
Rw=R[first]; bfaces=[tuple(int(inv[v]) for v in p.vertices) for p in me.polygons]
N=vertex_normals(Rw,bfaces)
bvhG=make_bvh(VT,F)
cov=np.zeros(len(Rw),bool)
for i,(p,n) in enumerate(zip(Rw,N)):
    h=bvhG.ray_cast(Vector(p+n*1e-4),Vector(n),0.09)
    cov[i]=h[0] is not None
# rim distance: rims are the garment boundary loops; classify each by name via centroid
loops,_=boundary_loops(F)
rimpts=[]; rimm=[]
for l in loops:
    c=VT[l].mean(0)
    kind="hem" if c[2]<1.1 else ("neck" if abs(c[0])<0.1 else "sleeve")
    m=margins.get(kind,margins.get("default",0.025)); print("rim",kind,len(l),"margin",m)
    rimpts.append(VT[l]); rimm.append(np.full(len(l),m))
rimpts=np.vstack(rimpts); rimm=np.concatenate(rimm)
# project rim points to the body, then distance from body verts to those projections
bvhB=make_bvh(Rw,bfaces)
proj=np.array([np.array(bvhB.find_nearest(Vector(p))[0]) for p in rimpts])
tree=cKDTree(proj); dd,ii=tree.query(Rw,k=8)
far=np.all(dd>rimm[ii],axis=1)
hidev=cov&far
hidden=np.array([all(hidev[v] for v in f) for f in bfaces])
np.save(out,hidden)
print("covered verts",cov.sum(),"hidden verts",hidev.sum(),"hidden polygons",hidden.sum(),"of",len(bfaces))
