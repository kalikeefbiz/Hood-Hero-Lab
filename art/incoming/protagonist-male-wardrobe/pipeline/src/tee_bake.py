"""High-detail tee (folds + seam ridges) -> Cycles bakes onto the game mesh: tangent normal, AO, position."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
SKIP_AUX="--fast" in sys.argv
from posing import *
import bpy, bmesh
from scipy.spatial import cKDTree
RES=int(sys.argv[1]) if len(sys.argv)>1 else 2048
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/tee_uv.blend")
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; tee=bpy.data.objects["tee-white"]
body=[o for o in bpy.data.objects if o.type=="MESH" and o is not tee][0]
a_pose(arm,0.63)
dg=bpy.context.evaluated_depsgraph_get()
def freeze(ob,name):
    me=bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); o=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(o); return o
low=freeze(tee,"LOW"); occ=freeze(body,"BODY_OCC")
tee.hide_render=True; body.hide_render=True; tee.hide_set(True); body.hide_set(True)
VA=np.array([v.co for v in low.data.vertices])
U=np.load("/home/claude/work/tee_uv.npz",allow_pickle=True); lab=U["lab"]
v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
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
for k in ("body","armscye","neck","underarm"):
    pts=[];arc=[]
    for ch in chains([tuple(e) for e in U["seam_"+k]]):
        if len(ch)<3: continue
        p,t=poly_pts(ch); pts.append(p); arc.append(t)
    SEAMS[k]=(np.vstack(pts),np.concatenate(arc))
    print("seam",k,"points",len(SEAMS[k][0]))
# hem edge lines (outer fold lip) and the stitch base
HEMS={}
for key in ("hemL","hemR","hemB"):
    rings=v3[key]; lip=list(map(int,rings[1]))+[int(rings[1][0])]
    p,t=poly_pts(lip,smooth=4); HEMS[key]=(p,t)
nk=list(map(int,v3["collar"][0]))+[int(v3["collar"][0][0])]
NECKLINE=poly_pts(nk,smooth=4)
np.savez("/home/claude/work/tee_seams.npz",**{f"seam_{k}":v[0] for k,v in SEAMS.items()},**{f"arc_{k}":v[1] for k,v in SEAMS.items()},
         **{f"{k}":v[0] for k,v in HEMS.items()},**{f"{k}_arc":v[1] for k,v in HEMS.items()},neckline=NECKLINE[0])
# ---------- high-res copy
high=low.copy(); high.data=low.data.copy(); high.name="HIGH"; bpy.context.scene.collection.objects.link(high)
from facetypes import face_types
_d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); _F=[tuple(int(x) for x in f if x>=0) for f in _d["F"]]
ft=face_types(_F,v3)
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
torso=np.isin(hl,["front","back"]); sleeve=np.isin(hl,["sleeveL","sleeveR"]); col=hl=="collar"
def sstep(a,b,t): u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)
from noise3 import fbm3, value_noise3
# 1) torso drape: irregular, vertically stretched folds that grow toward the hem
ang=np.arctan2(y,x); cyl=np.stack([np.cos(ang)*0.17,np.sin(ang)*0.17,z],1)
dn=fbm3(cyl,0.05,3,11,aniso=(1,1,4.0))
ridge=np.tanh(1.8*dn)                                   # soft rounded folds (no sharp creases)
H+=torso*0.0030*ridge*sstep(1.20,0.95,z)*(0.6+0.4*fbm3(Ph,0.12,2,3))
# 2) armpit creases: a fan of 4-5 creases running down/forward and down/back from each armpit
for sgn in (1,-1):
    aw=U["seam_armscye"]; idx=np.unique(aw.ravel()); side=idx[np.sign(VA[idx,0])==sgn]
    Pa=VA[side[np.argmin(VA[side,2])]]
    v=Ph-Pa; d=np.linalg.norm(v,axis=1)
    phi=np.arctan2(v[:,1],-v[:,2])                     # 0 = straight down, +-pi/2 = back/front
    fan=np.exp(-((phi)/1.25)**2)                        # mostly below the armpit, fading toward front/back
    crease=np.abs(np.sin(2.6*phi+0.8*np.sin(d*30)))**0.6
    H+=-0.0026*crease*fan*np.exp(-((d-0.04)/0.055)**2)*(d<0.16)*(~col)
# 3) sleeve: irregular circumferential gathers, strongest on the underside
for sgn,nm in ((1,"sleeveL"),(-1,"sleeveR")):
    pb=arm.pose.bones["upper_arm."+("L" if sgn>0 else "R")]; h=np.array(pb.head); t=np.array(arm.pose.bones[pb.name+".001"].tail); dv=(t-h)/np.linalg.norm(t-h)
    q=Ph-h; tt=q@dv; rr=q-np.outer(tt,dv); inward=np.array([-sgn,0,0.0]); inward-=dv*(inward@dv); inward/=np.linalg.norm(inward)
    cos_under=(rr@inward)/(np.linalg.norm(rr,axis=1)+1e-9)
    w=(hl==nm)*(0.25+0.75*np.clip(cos_under,0,1))
    g=fbm3(np.stack([tt*1.0,rr@inward*0.3,rr@np.cross(dv,inward)*0.3],1),0.03,2,21)
    H+=w*0.0022*(1-2*np.abs(g))
# 4) fine cotton undulation everywhere
H+=0.00030*fbm3(Ph,0.025,3,5)*(~col)
# 5) seam ridges with puckering
for k,(amp,w0) in {"body":(0.0010,0.0022),"armscye":(0.0011,0.0024),"neck":(0.0012,0.0022),"underarm":(0.0009,0.0020)}.items():
    d,_=cKDTree(SEAMS[k][0]).query(Ph)
    H+=amp*np.exp(-(d/w0)**2)-0.45*amp*np.exp(-((d-2.3*w0)/(0.9*w0))**2)
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
nimg.filepath_raw="/home/claude/work/bake/tee_normal.png"; nimg.file_format="PNG"; nimg.save()
# AO with the body as occluder (A pose: arms down-ish)
sc.cycles.samples=96
if sc.world is None: sc.world=bpy.data.worlds.new("W")
sc.world.light_settings.distance=0.25
aimg=target_image("tee_ao"); bake("AO",aimg)
aimg.filepath_raw="/home/claude/work/bake/tee_ao.png"; aimg.file_format="PNG"; aimg.save()
# position (A pose) via emission
sc.cycles.samples=1
for n in list(nt.nodes):
    if n.type=="BSDF_PRINCIPLED": nt.nodes.remove(n)
geo=nt.nodes.new("ShaderNodeNewGeometry"); em=nt.nodes.new("ShaderNodeEmission"); out=[n for n in nt.nodes if n.type=="OUTPUT_MATERIAL"][0]
nt.links.new(geo.outputs["Position"],em.inputs["Color"]); nt.links.new(em.outputs["Emission"],out.inputs["Surface"])
pimg=target_image("tee_pos",True); bake("EMIT",pimg,s2a=False)
pimg.filepath_raw="/home/claude/work/bake/tee_pos.exr"; pimg.file_format="OPEN_EXR"; pimg.save()
nt.links.new(geo.outputs["Normal"],em.inputs["Color"])
wimg=target_image("tee_wn",True); bake("EMIT",wimg,s2a=False)
wimg.filepath_raw="/home/claude/work/bake/tee_wnormal.exr"; wimg.file_format="OPEN_EXR"; wimg.save()
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/tee_bake.blend")
print("bakes done")
