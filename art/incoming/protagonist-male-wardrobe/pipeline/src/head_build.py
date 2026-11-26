"""face-01 from the multi-image Meshy head: align to the head slot (ICP to face-03), decimate keeping Meshy UVs,
cut at the neck seam and stitch onto the body's ring, weights from face-03, neck colour blended to complexion-01."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy, bmesh, numpy as np
from mathutils import Matrix, Vector
from scipy.spatial import cKDTree
SRC="/home/claude/hood-hero-lab/art/incoming/protagonist-male-rework/source/protagonist-male-rework_source.blend"
Z_SEAM=1.538
bpy.ops.wm.open_mainfile(filepath=SRC)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; body=bpy.data.objects["Body"]; ref=bpy.data.objects["Head_face_03"]
old=bpy.data.objects["Head_face_01"]
for pb in arm.pose.bones: pb.matrix_basis.identity()
if arm.animation_data: arm.animation_data.action=None
bpy.ops.import_scene.gltf(filepath="/home/claude/work/meshy/raw_model.glb")
raw=[o for o in bpy.context.selected_objects if o.type=="MESH"][0]
bpy.ops.object.select_all(action="DESELECT"); raw.select_set(True); bpy.context.view_layer.objects.active=raw
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
_bm=bmesh.new(); _bm.from_mesh(raw.data); bmesh.ops.remove_doubles(_bm,verts=_bm.verts,dist=1e-6); _bm.to_mesh(raw.data); _bm.free(); raw.data.update()
print("raw welded verts",len(raw.data.vertices))
RV=np.array([v.co for v in raw.data.vertices]); RF=np.array([v.co for v in ref.data.vertices])
def nose(V,zmin): u=V[V[:,2]>zmin]; return u[u[:,1].argmin()]
def width(V,z0,z1): u=V[(V[:,2]>z0)&(V[:,2]<z1)]; return u[:,0].max()-u[:,0].min()
crR=RV[:,2].max(); nR=nose(RV,crR-0.6); crF=RF[:,2].max(); nF=nose(RF,1.6)
s=((crF-nF[2])/(crR-nR[2]))
t=np.array([0,0,crF])-s*np.array([0,0,crR]); t[1]=nF[1]-s*nR[1]; t[0]=-s*nR[0]
A=RV*s+t
print("init scale %.4f"%s)
# similarity ICP on the cranium+face (above the jaw), matching face-03's skull
tgt=RF[RF[:,2]>nF[2]-0.035]; kd=cKDTree(tgt)
Ttot=np.eye(4); Ttot[:3,:3]*=s; Ttot[:3,3]=t
for it in range(40):
    src=A[(A[:,2]>nF[2]-0.035)&(A[:,2]<crF+0.03)]
    src=src[::max(1,len(src)//6000)]
    d,ii=kd.query(src); m=d<np.percentile(d,85); X=src[m]; Y=tgt[ii[m]]
    mx,my=X.mean(0),Y.mean(0); Xc,Yc=X-mx,Y-my; U_,S_,Vt=np.linalg.svd(Yc.T@Xc/len(X)); D=np.eye(3); D[2,2]=np.sign(np.linalg.det(U_@Vt))
    Rm=U_@D@Vt; sc=np.trace(np.diag(S_)@D)/(Xc**2).sum(1).mean(); tr=my-sc*Rm@mx
    A=(sc*(Rm@A.T)).T+tr
    M=np.eye(4); M[:3,:3]=sc*Rm; M[:3,3]=tr; Ttot=M@Ttot
print("ICP residual median %.4f m"%np.median(d))
for v,p in zip(raw.data.vertices,A): v.co=p
raw.data.update()
# decimate to game resolution (keeps UVs)
m=raw.modifiers.new("dec","DECIMATE"); m.ratio=7400/len(raw.data.polygons); m.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier="dec")
print("decimated faces",len(raw.data.polygons),"verts",len(raw.data.vertices))
# body neck ring (top boundary loop of the body at the seam)
bme=bmesh.new(); bme.from_mesh(body.data)
ring=[e for e in bme.edges if e.is_boundary and all(abs(v.co.z-Z_SEAM)<0.003 for v in e.verts)]
RP=np.array(sorted({tuple(v.co) for e in ring for v in e.verts})); print("body seam ring verts",len(RP))
cxy=RP[:,:2].mean(0)
rang=np.arctan2(RP[:,1]-cxy[1],RP[:,0]-cxy[0]); order=np.argsort(rang); RP=RP[order]; rang=rang[order]
rr=np.hypot(RP[:,0]-cxy[0],RP[:,1]-cxy[1])
def ring_r(a): return np.interp(a,np.r_[rang-2*np.pi,rang,rang+2*np.pi],np.r_[rr,rr,rr])
# neck blend: below z_top the head's neck is reshaped toward the body's neck profile, then cut at the seam
bm=bmesh.new(); bm.from_mesh(raw.data)
Z_TOP=Z_SEAM+0.045
# head neck radius profile per angle near Z_TOP
HV=np.array([v.co for v in bm.verts]); band=(HV[:,2]>Z_TOP-0.004)&(HV[:,2]<Z_TOP+0.004)&(np.hypot(HV[:,0]-cxy[0],HV[:,1]-cxy[1])<0.12)
ha=np.arctan2(HV[band,1]-cxy[1],HV[band,0]-cxy[0]); hr=np.hypot(HV[band,0]-cxy[0],HV[band,1]-cxy[1])
o_=np.argsort(ha); ha,hr=ha[o_],hr[o_]
def head_r(a): return np.interp(a,np.r_[ha-2*np.pi,ha,ha+2*np.pi],np.r_[hr,hr,hr])
for v in bm.verts:
    z=v.co.z
    if z>=Z_TOP: continue
    a=np.arctan2(v.co.y-cxy[1],v.co.x-cxy[0]); r=np.hypot(v.co.x-cxy[0],v.co.y-cxy[1])
    w=np.clip((Z_TOP-z)/(Z_TOP-Z_SEAM),0,1); w=w*w*(3-2*w)
    target=(1-w)*head_r(a)+w*ring_r(a)
    if r>0.14: continue        # shoulders of the bust: removed by the cut below anyway
    nr=target; v.co.x=cxy[0]+np.cos(a)*nr; v.co.y=cxy[1]+np.sin(a)*nr
# cut at the seam: keep above
geom=bm.verts[:]+bm.edges[:]+bm.faces[:]
res=bmesh.ops.bisect_plane(bm,geom=geom,plane_co=(0,0,Z_SEAM),plane_no=(0,0,1),clear_inner=True)
# drop anything outside the neck column (bust shoulders) and stray islands
bm.verts.ensure_lookup_table()
far=[v for v in bm.verts if v.co.z<Z_SEAM+0.06 and np.hypot(v.co.x-cxy[0],v.co.y-cxy[1])>0.13]
bmesh.ops.delete(bm,geom=far,context="VERTS")
# keep largest connected piece
bm.verts.ensure_lookup_table(); seen=set(); best=[]
for v in bm.verts:
    if v.index in seen: continue
    st=[v]; comp=[]
    while st:
        x=st.pop()
        if x.index in seen: continue
        seen.add(x.index); comp.append(x)
        for e in x.link_edges: st.append(e.other_vert(x))
    if len(comp)>len(best): best=comp
keep=set(v.index for v in best); bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context="VERTS")
# snap the bottom boundary onto the body's ring polyline (by angle) so there is no crack
bnd=[v for v in bm.verts if v.is_boundary and abs(v.co.z-Z_SEAM)<0.002]
for v in bnd:
    a=np.arctan2(v.co.y-cxy[1],v.co.x-cxy[0]); r=ring_r(a); v.co.x=cxy[0]+np.cos(a)*r; v.co.y=cxy[1]+np.sin(a)*r; v.co.z=Z_SEAM
print("seam boundary verts",len(bnd))
bm.to_mesh(raw.data); bm.free(); raw.data.update()
# weights from face-03 (nearest vertex) — same rig, same slot
ref_w={}
gn={g.index:g.name for g in ref.vertex_groups}
RW=np.zeros((len(ref.data.vertices),len(arm.data.bones))); bi={b.name:i for i,b in enumerate(arm.data.bones)}
for v in ref.data.vertices:
    for g in v.groups:
        if gn[g.group] in bi: RW[v.index,bi[gn[g.group]]]=g.weight
kdr=cKDTree(RF); HV=np.array([v.co for v in raw.data.vertices]); d,ii=kdr.query(HV,k=4)
wts=1/np.maximum(d,1e-5); W=(RW[ii]*wts[...,None]).sum(1)/wts.sum(1,keepdims=True)
raw.vertex_groups.clear()
for b,i in bi.items():
    g=raw.vertex_groups.new(name=b)
    for k in np.where(W[:,i]>1e-4)[0]: g.add([int(k)],float(W[k,i]),"REPLACE")
raw.name="Head_face_01_new"; raw.parent=arm; mm=raw.modifiers.new("Armature","ARMATURE"); mm.object=arm
for p in raw.data.polygons: p.use_smooth=True
np.savez("/home/claude/work/head01_geo.npz",V=np.array([v.co for v in raw.data.vertices]),zseam=Z_SEAM)
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/head01.blend")
print("head verts",len(raw.data.vertices),"faces",len(raw.data.polygons),"z[%.3f,%.3f]"%(HV[:,2].min(),HV[:,2].max()))
