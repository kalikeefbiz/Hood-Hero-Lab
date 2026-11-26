"""Mirror the left sneaker to a pair, weight it to the feet, unpose, body mask, UVs. Output shoe_uv.blend + shoe_skin.npz + shoe_mask.npy"""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
import bmesh
ID="court-sneakers-white"
bp=BodyPrep(); P=bp.Pw; bones=bp.bones
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
d=np.load("/home/claude/work/shoeL_v1.npz",allow_pickle=True); VL=d["V"]; FL=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; parts=list(d["parts"])
n=len(VL); VR=VL*np.array([-1,1,1]); FR=[tuple(v+n for v in f[::-1]) for f in FL]
V=np.vstack([VL,VR]); F=FL+FR; parts=parts+parts; side=np.r_[np.ones(n),-np.ones(n)]
# weights from the nearest same-side foot/shin surface
fr=np.array([np.bincount(rid[list(f)],minlength=8).argmax() for f in bp.faces]); fc=np.array([P[list(f)].mean(0) for f in bp.faces])
G={s:[k for k in range(len(bp.faces)) if fr[k] in (6,7) and np.sign(fc[k,0])==s] for s in (1,-1)}
BV={s:make_bvh(P,[bp.faces[k] for k in G[s]]) for s in (1,-1)}
W=np.zeros((len(V),len(bones)))
for i,p in enumerate(V):
    s=int(side[i]); loc,nn,fi,dd=BV[s].find_nearest(Vector(p)); f=bp.faces[G[s][fi]]; tri=P[list(f)]; q=np.array(loc)
    v0,v1=tri[1]-tri[0],tri[2]-tri[0]; v2=q-tri[0]; d00,d01,d11,d20,d21=v0@v0,v0@v1,v1@v1,v2@v0,v2@v1; den=d00*d11-d01*d01
    b1=(d11*d20-d01*d21)/den; b2=(d00*d21-d01*d20)/den; bc=np.clip([1-b1-b2,b1,b2],0,1); bc/=bc.sum(); W[i]=bc@bp.Ww[list(f)]
# the sole is rigid along the foot: smooth its weights a lot; shoe parts above the collar follow the ankle a little
nb=neighbors_from_faces(F,len(V))
pa=np.array(parts); vpart=np.array(["upper"]*len(V),dtype=object)
for f,p_ in zip(F,parts):
    for v in f: vpart[v]=p_
solev=np.isin(vpart,["sole","tread","insole"])
for it in range(25):
    Wn=np.array([W[nb_].mean(0) if len(nb_) else W[i] for i,nb_ in enumerate(nb)])
    a=np.where(solev,0.8,0.25)[:,None]; W=(1-a)*W+a*Wn
idx=np.argsort(-W,1)[:,:4]; W4=np.take_along_axis(W,idx,1); W4/=W4.sum(1,keepdims=True); Wd=np.zeros_like(W); np.put_along_axis(Wd,idx,W4,1)
M=lbs_matrices(Wd,bp.B,bones); VT=invert_lbs(M,V); print("roundtrip",np.abs(apply_lbs(M,VT)-V).max())
np.savez("/home/claude/work/shoe_skin.npz",VA=V,VT=VT,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),W=Wd,bones=np.array(bones),parts=np.array(parts),inner=np.array([],int),isarm=np.zeros(len(V),bool))
# body mask: feet, and the ankle below the collar (rest pose heights are unchanged by the pose)
R=bp.Rw
coll=[v for l in d["collar"][:1] for v in l]; zcol=VL[list(map(int,coll)),2].min()
hidev=(rid==7)|((rid==6)&(R[:,2]<zcol-0.012))
me=bp.body.data
hidden=np.array([all(hidev[bp.inv[v]] for v in p.vertices) for p in me.polygons]); np.save("/home/claude/work/shoe_mask.npy",hidden)
print("collar min z %.3f; hidden polygons %d"%(zcol,hidden.sum()))
# object, UVs (smart project, left shoe only; right shares the same UVs mirrored)
me2=bpy.data.meshes.new(ID); me2.from_pydata([tuple(map(float,v)) for v in VT],[],F); me2.update()
ob=bpy.data.objects.new(ID,me2); bpy.context.scene.collection.objects.link(ob)
for p in me2.polygons: p.use_smooth=(parts[p.index] not in ("tread","insole"))
me2.uv_layers.new(name="UVMap")
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bm=bmesh.from_edit_mesh(me2); bm.faces.ensure_lookup_table()
for f in bm.faces: f.select=f.index<len(FL)
bmesh.update_edit_mesh(me2)
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=0.003,area_weight=0.0,scale_to_bounds=True)
bpy.ops.uv.pack_islands(rotate=True,margin=0.003)
bpy.ops.object.mode_set(mode="OBJECT")
uv=np.zeros((len(me2.loops),2)); me2.uv_layers[0].data.foreach_get("uv",uv.ravel())
# right shoe: copy UVs of the matching left face (corners reversed)
for k,p in enumerate(me2.polygons):
    if k<len(FL): continue
    src=me2.polygons[k-len(FL)]; li=list(p.loop_indices); ls=list(src.loop_indices)[::-1]
    for a_,b_ in zip(li,ls): uv[a_]=uv[b_]
me2.uv_layers[0].data.foreach_set("uv",uv.ravel())
for j,nm in enumerate(bones):
    g=ob.vertex_groups.new(name=nm)
    for i in np.where(Wd[:,j]>0)[0]: g.add([int(i)],float(Wd[i,j]),"REPLACE")
ob.parent=bp.arm; m=ob.modifiers.new("Armature","ARMATURE"); m.object=bp.arm
for o in list(bpy.data.objects):
    if o.type=="MESH" and o not in (bp.body,ob): bpy.data.objects.remove(o)
for pb in bp.arm.pose.bones: pb.matrix_basis.identity()
bp.arm.animation_data.action=None
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/shoe_uv.blend")
np.savez("/home/claude/work/shoe_uv.npz",uv=uv,lab=np.array(parts))
from PIL import Image, ImageDraw
im=Image.new("RGB",(1024,1024),(20,20,24)); dr=ImageDraw.Draw(im)
cols={"upper":(230,230,230),"collar":(200,200,240),"sole":(220,200,150),"tread":(120,120,120),"insole":(60,60,60),"tongue":(150,200,250),"laces":(250,150,150)}
for p in me2.polygons:
    if p.index>=len(FL): continue
    dr.polygon([(uv[l,0]*1023,(1-uv[l,1])*1023) for l in p.loop_indices],fill=cols[parts[p.index]],outline=(20,20,24))
im.save("/home/claude/work/r/shoe_uv.png"); print("faces",len(F),"verts",len(V))
