import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from mathutils import Vector
bp=BodyPrep(); P=bp.Pw; bvh=make_bvh(P,bp.faces)
for ph in np.radians([-90,-60,-30,0,30,60,90]):
    for a,b,yc in [(0.080,0.074,0.022)]:
        x,y=a*np.cos(ph),yc+b*np.sin(ph)
        hits=[];o=Vector((x,y,1.75))
        for _ in range(4):
            h=bvh.ray_cast(o,Vector((0,0,-1)))
            if h[0] is None: break
            hits.append(round(h[0].z,3)); o=h[0]+Vector((0,0,-1e-4))
        print("phi %4d x %.3f y %.3f hits %s"%(np.degrees(ph),x,y,hits))
m=(P[:,2]>1.40)&(P[:,2]<1.56)
for z in [1.42,1.45,1.48,1.51,1.54]:
    s=P[np.abs(P[:,2]-z)<0.006]; s=s[np.abs(s[:,0])<0.15]
    print("z",z,"neck slice x[%.3f,%.3f] y[%.3f,%.3f]"%(s[:,0].min(),s[:,0].max(),s[:,1].min(),s[:,1].max()))
s=P[np.abs(P[:,2]-1.535)<0.006]; s=s[np.abs(s[:,0])<0.13]
c=(s[:,:2].max(0)+s[:,:2].min(0))/2; ext=(s[:,:2].max(0)-s[:,:2].min(0))/2
print("neck col centre",c,"semi",ext)
for g in [0.018,0.024,0.030]:
    a,b=ext[0]+g,ext[1]+g
    zs=[]
    for ph in np.radians(np.arange(-180,180,15)):
        x,y=c[0]+a*np.cos(ph),c[1]+b*np.sin(ph)
        h=bvh.ray_cast(Vector((x,y,1.75)),Vector((0,0,-1)))
        zs.append(round(h[0].z,3) if h[0] else None)
    print("gap",g,zs)
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
print("rid values",np.unique(rid,return_counts=True))
N=P[rid==0] if (rid==0).sum()<1500 else None
for r in np.unique(rid):
    q=P[rid==r]; print(r,len(q),"z[%.3f,%.3f]"%(q[:,2].min(),q[:,2].max()))
N=P[rid==0]
for z in [1.45,1.47,1.49,1.51,1.53]:
    s=N[np.abs(N[:,2]-z)<0.008]
    if len(s)==0: continue
    print("neck z %.2f n=%d x[%.3f,%.3f] y[%.3f,%.3f]"%(z,len(s),s[:,0].min(),s[:,0].max(),s[:,1].min(),s[:,1].max()))
# torso verts at top
T1=P[(rid==1)&(P[:,2]>1.47)]
print("torso top verts x[%.3f,%.3f] y[%.3f,%.3f] zmax %.3f"%(T1[:,0].min(),T1[:,0].max(),T1[:,1].min(),T1[:,1].max(),T1[:,2].max()))
Nn=vertex_normals(P,bp.faces)
for z in [1.47,1.49,1.51,1.53,1.54]:
    m=(np.abs(P[:,2]-z)<0.006)&(np.abs(Nn[:,2])<0.4)&(np.hypot(P[:,0],P[:,1]-0.04)<0.1)
    s=P[m]
    if len(s): print("col z %.2f n=%d x[%.3f,%.3f] y[%.3f,%.3f]"%(z,len(s),s[:,0].min(),s[:,0].max(),s[:,1].min(),s[:,1].max()))
