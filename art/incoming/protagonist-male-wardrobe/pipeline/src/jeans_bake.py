"""High-detail tee (folds + seam ridges) -> Cycles bakes onto the game mesh: tangent normal, AO, position."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
SKIP_AUX="--fast" in sys.argv
from posing import *
import bpy, bmesh
from scipy.spatial import cKDTree
RES=int(sys.argv[1]) if len(sys.argv)>1 else 2048
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/jeans_uv.blend")
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; tee=bpy.data.objects["jeans-denim-standard"]
body=[o for o in bpy.data.objects if o.type=="MESH" and o is not tee][0]
a_pose(arm,0.63)
dg=bpy.context.evaluated_depsgraph_get()
def freeze(ob,name):
    me=bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); o=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(o); return o
low=freeze(tee,"LOW"); occ=freeze(body,"BODY_OCC")
tee.hide_render=True; body.hide_render=True; tee.hide_set(True); body.hide_set(True)
VA=np.array([v.co for v in low.data.vertices])
U=np.load("/home/claude/work/jeans_uv.npz",allow_pickle=True); lab=U["lab"]
v3=np.load("/home/claude/work/jeans_v3.npz",allow_pickle=True)
# ---------- seam polylines (A pose)
from collections import defaultdict
def chains(edges):
    adj=defaultdict(list)
    for a,b in edges: adj[a].append(b); adj[b].append(a)
    seen=set(); out=[]
    for e in edges:
        if tuple(e) in seen: continue
        # walk both ways
        a,b=e; path=[a,b]; seen.add(tuple(e)); seen.add((b,a))
        for end in (0,1):
            while True:
                x=path[-1] if end else path[0]; prev=path[-2] if end else path[1]
                nx=[y for y in adj[x] if y!=prev and (x,y) not in seen]
                if len(adj[x])!=2 or not nx: break
                y=nx[0]; seen.add((x,y)); seen.add((y,x))
                if end: path.append(y)
                else: path.insert(0,y)
        out.append(path)
    return out
def poly_pts(path,smooth=8,step=0.001):
    P=VA[path].copy()
    for _ in range(smooth):
        P[1:-1]=0.5*P[1:-1]+0.25*(P[:-2]+P[2:])
    seg=np.linalg.norm(np.diff(P,axis=0),axis=1); L=np.r_[0,np.cumsum(seg)]
    n=max(2,int(L[-1]/step)); t=np.linspace(0,L[-1],n)
    return np.stack([np.interp(t,L,P[:,k]) for k in range(3)],1), t
SEAMS={}
for k in ("side","center","band"):
    pts=[];arc=[]
    for ch in chains([tuple(e) for e in U["seam_"+k]]):
        if len(ch)<3: continue
        p,t=poly_pts(ch); pts.append(p); arc.append(t)
    SEAMS[k]=(np.vstack(pts),np.concatenate(arc))
    print("seam",k,"points",len(SEAMS[k][0]))
# hem edge lines (outer fold lip) and the stitch base
HEMS={}
for key in ("hemL","hemR"):
    rings=v3[key]; lip=list(map(int,rings[1]))+[int(rings[1][0])]
    p,t=poly_pts(lip,smooth=4); HEMS[key]=(p,t)
nk=list(map(int,v3["waist"][0]))+[int(v3["waist"][0][0])]
NECKLINE=poly_pts(nk,smooth=4)
np.savez("/home/claude/work/jeans_seams.npz",**{f"seam_{k}":v[0] for k,v in SEAMS.items()},**{f"arc_{k}":v[1] for k,v in SEAMS.items()},
         **{f"{k}":v[0] for k,v in HEMS.items()},**{f"{k}_arc":v[1] for k,v in HEMS.items()},neckline=NECKLINE[0])
# ---------- high-res copy
high=low.copy(); high.data=low.data.copy(); high.name="HIGH"; bpy.context.scene.collection.objects.link(high)
from facetypes import face_types
_d=np.load("/home/claude/work/jeans_skin.npz",allow_pickle=True); _F=[tuple(int(x) for x in f if x>=0) for f in _d["F"]]
ft=face_types(_F,v3,keys=('waist','hemL','hemR'),collar_keys=())
bm=bmesh.new(); bm.from_mesh(high.data); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.where(ft>=2)[0]],context="FACES"); bm.to_mesh(high.data); bm.free()
print("HIGH without fold layers: faces",len(high.data.polygons))
m=high.modifiers.new("ss","SUBSURF"); m.levels=3; m.render_levels=3; m.subdivision_type="CATMULL_CLARK"; m.uv_smooth="PRESERVE_BOUNDARIES"
bpy.context.view_layer.objects.active=high; high.select_set(True)
bpy.ops.object.modifier_apply(modifier="ss")
hv=high.data.vertices; Ph=np.zeros((len(hv),3)); hv.foreach_get("co",Ph.ravel())
high.data.update(); Nh=np.zeros((len(hv),3)); hv.foreach_get("normal",Nh.ravel())
print("high verts",len(Ph))
# label per high vertex from nearest low vertex (via faces' labels on low verts)
vlab=np.array(["front"]*len(VA),dtype=object)
for k,p in enumerate(low.data.polygons):
    for v in p.vertices: vlab[v]=lab[k]
inner=set(v3["inner"].tolist())
_,nn=cKDTree(VA).query(Ph); hl=vlab[nn]; hin=np.array([i in inner for i in nn])
z=Ph[:,2]; x=Ph[:,0]; y=Ph[:,1]
rng=np.random.default_rng(7)
H=np.zeros(len(Ph))
from noise3 import fbm3
from jeans_shapes import *
front=np.array([l.startswith("front") for l in hl]); back=np.array([l.startswith("back") for l in hl]); bandl=hl=="band"; leg=front|back
def sstep(a,b,t): u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)
def seg_dist(P2,poly):
    d=np.full(len(P2),1e3)
    for a_,b_ in zip(poly[:-1],poly[1:]):
        e=b_-a_; t=np.clip(((P2-a_)@e)/max(e@e,1e-12),0,1); d=np.minimum(d,np.linalg.norm(P2-(a_+t[:,None]*e),axis=1))
    return d
XZ=np.stack([x,z],1)
# leg drape: long soft folds
H+=leg*0.0016*(1-2*np.abs(fbm3(Ph,0.06,3,61,aniso=(1,1,3.5))))
# stacking above the hem: rings of folds that fade upward
H+=leg*0.0030*np.sin(2*np.pi*z/0.042+2.5*fbm3(Ph,0.05,2,62))*sstep(0.24,0.10,z)
# whiskers: irregular creases fanning from the crotch to each hip on the front
rngw=np.random.default_rng(11)
for sgn in (1,-1):
    for k in range(6):
        ang=rngw.uniform(5,38); ln=rngw.uniform(0.06,0.12); a0=np.array([sgn*rngw.uniform(0.03,0.05),rngw.uniform(0.855,0.885)])
        dirv=np.array([sgn*np.cos(np.radians(ang)),np.sin(np.radians(ang))]); amp=rngw.uniform(0.0008,0.0016); w=rngw.uniform(0.003,0.006)
        dd=seg_dist(XZ,np.array([a0+dirv*0.01,a0+dirv*ln])); tpos=((XZ-a0)@dirv)/ln
        H-=front*(sgn*x>0)*amp*np.exp(-(dd/w)**2)*np.clip(np.sin(np.pi*np.clip(tpos,0,1)),0,1)**1.5
# honeycombs behind the knees (irregular tapered creases)
for sgn,pl in HONEY:
    dd=seg_dist(XZ,pl); e=np.linalg.norm(XZ-pl.mean(0),axis=1)/(np.linalg.norm(pl[-1]-pl[0])/2)
    H-=back*(sgn*x>0)*0.0019*np.exp(-(dd/0.0032)**2)*np.clip(1-e**2,0,1)
# fine undulation
H+=0.00025*fbm3(Ph,0.02,3,63)
# construction relief: seams, pocket edges, yoke, fly, band bottom
def ridge(dist,amp,w): return amp*np.exp(-(dist/w)**2)-0.4*amp*np.exp(-((dist-2.3*w)/(0.9*w))**2)
for k,(amp,w0) in {"side":(0.0012,0.0026),"center":(0.0012,0.0026),"band":(0.0010,0.0022)}.items():
    dd,_=cKDTree(SEAMS[k][0]).query(Ph); H+=ridge(dd,amp,w0)
for nm,pl in FRONT.items():
    pl=np.array(pl); dd=seg_dist(XZ,pl); H+=front*ridge(dd,0.0010,0.0022)
for nm,pl in BACK.items():
    pl=np.array(pl); dd=seg_dist(XZ,pl); H+=back*ridge(dd,0.0010,0.0022)
# back patch pockets are a raised layer of denim
from matplotlib.path import Path as _Path
for s_ in (1,-1):
    inside=_Path(BACK[f"bpocket{s_}"]).contains_points(XZ)
    dd=seg_dist(XZ,BACK[f"bpocket{s_}"]); H+=back*inside*0.0011*np.clip(dd/0.004,0,1)
inside=_Path(FRONT["coin"]).contains_points(XZ); H+=front*inside*0.0007
H[hin]*=0.3
Ph2=Ph+Nh*H[:,None]
hv.foreach_set("co",Ph2.ravel()); high.data.update()
print("displacement mm: p1 %.2f p99 %.2f"%(np.percentile(H,1)*1000,np.percentile(H,99)*1000))
# ---------- bake setup
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"
sc.render.bake.margin=16; sc.render.bake.margin_type="EXTEND"
def target_image(name,float_buf=False,colorspace="Non-Color"):
    img=bpy.data.images.new(name,RES,RES,alpha=False,float_buffer=float_buf); img.colorspace_settings.name=colorspace
    return img
mat=bpy.data.materials.new("BAKE"); mat.use_nodes=True; low.data.materials.clear(); low.data.materials.append(mat)
nt=mat.node_tree; tex=nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active=tex
for o in bpy.data.objects: o.select_set(False)
def bake(kind,img,**kw):
    tex.image=img
    for o in bpy.data.objects: o.select_set(False)
    if kw.get("s2a",True): high.select_set(True)
    low.select_set(True); bpy.context.view_layer.objects.active=low
    bpy.ops.object.bake(type=kind,use_selected_to_active=kw.get("s2a",True),cage_extrusion=0.0045,max_ray_distance=0.009,normal_space="TANGENT",margin=16)
# normal
sc.cycles.samples=8
nimg=target_image("tee_normal"); bake("NORMAL",nimg)
nimg.filepath_raw="/home/claude/work/bake/jeans_normal.png"; nimg.file_format="PNG"; nimg.save()
# AO with the body as occluder (A pose: arms down-ish)
sc.cycles.samples=96
if sc.world is None: sc.world=bpy.data.worlds.new("W")
sc.world.light_settings.distance=0.25
aimg=target_image("tee_ao"); bake("AO",aimg)
aimg.filepath_raw="/home/claude/work/bake/jeans_ao.png"; aimg.file_format="PNG"; aimg.save()
# position (A pose) via emission
sc.cycles.samples=1
for n in list(nt.nodes):
    if n.type=="BSDF_PRINCIPLED": nt.nodes.remove(n)
geo=nt.nodes.new("ShaderNodeNewGeometry"); em=nt.nodes.new("ShaderNodeEmission"); out=[n for n in nt.nodes if n.type=="OUTPUT_MATERIAL"][0]
nt.links.new(geo.outputs["Position"],em.inputs["Color"]); nt.links.new(em.outputs["Emission"],out.inputs["Surface"])
pimg=target_image("tee_pos",True); bake("EMIT",pimg,s2a=False)
pimg.filepath_raw="/home/claude/work/bake/jeans_pos.exr"; pimg.file_format="OPEN_EXR"; pimg.save()
nt.links.new(geo.outputs["Normal"],em.inputs["Color"])
wimg=target_image("tee_wn",True); bake("EMIT",wimg,s2a=False)
wimg.filepath_raw="/home/claude/work/bake/jeans_wnormal.exr"; wimg.file_format="OPEN_EXR"; wimg.save()
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/jeans_bake.blend")
print("bakes done")
