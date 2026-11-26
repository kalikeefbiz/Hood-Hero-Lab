import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy
ID=sys.argv[1] if len(sys.argv)>1 else "tee-white"
TEX="/home/claude/work/tex/"; OUT=f"/home/claude/work/export/{ID}_src.glb"
import os; os.makedirs("/home/claude/work/export",exist_ok=True)
import os
BLEND=os.environ.get("BLEND","/home/claude/work/tee_uv.blend"); V3=os.environ.get("V3","/home/claude/work/tee_v3.npz")
KEYS=tuple(os.environ.get("KEYS","collar,hemL,hemR,hemB").split(",")); CKEYS=tuple(k for k in os.environ.get("CKEYS","collar").split(",") if k)
bpy.ops.wm.open_mainfile(filepath=BLEND)
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; ob=bpy.data.objects[ID]
for pb in arm.pose.bones: pb.matrix_basis.identity()
if arm.animation_data: arm.animation_data.action=None
mat=bpy.data.materials.new("M_"+ID); mat.use_nodes=True; nt=mat.node_tree
bsdf=[n for n in nt.nodes if n.type=="BSDF_PRINCIPLED"][0]
def img(path,cs):
    i=bpy.data.images.load(path); i.colorspace_settings.name=cs; t=nt.nodes.new("ShaderNodeTexImage"); t.image=i; return t
bc=img(TEX+f"{ID}_baseColor.png","sRGB"); nm=img(TEX+f"{ID}_normal.png","Non-Color"); orm=img(TEX+f"{ID}_orm.png","Non-Color")
nt.links.new(bc.outputs["Color"],bsdf.inputs["Base Color"])
nmap=nt.nodes.new("ShaderNodeNormalMap"); nmap.uv_map="UVMap"; nt.links.new(nm.outputs["Color"],nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"],bsdf.inputs["Normal"])
sep=nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(orm.outputs["Color"],sep.inputs["Color"])
nt.links.new(sep.outputs["Green"],bsdf.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"],bsdf.inputs["Metallic"])
g=bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output","ShaderNodeTree")
if not g.interface.items_tree: g.interface.new_socket("Occlusion",in_out="INPUT",socket_type="NodeSocketFloat")
gn=nt.nodes.new("ShaderNodeGroup"); gn.node_tree=g; nt.links.new(sep.outputs["Red"],gn.inputs["Occlusion"])
bsdf.inputs["Sheen Weight"].default_value=float(os.environ.get("SHEEN","0.3")); bsdf.inputs["Sheen Roughness"].default_value=0.6
bsdf.inputs["Specular IOR Level"].default_value=0.5
ob.data.materials.clear(); ob.data.materials.append(mat)
# custom split normals: outer surface (shell + outer band) and fold layers (lip + inner facing) are smoothed separately,
# so reversed inner faces never bend the visible surface's normals
import numpy as np
from facetypes import face_types
from shell_tools import vertex_normals
v3=np.load(V3,allow_pickle=True)
me=ob.data; F=[tuple(p.vertices) for p in me.polygons]; ft=face_types(F,v3,keys=KEYS,collar_keys=CKEYS)
V=np.array([v.co for v in me.vertices])
Nout=vertex_normals(V,[f for f,t in zip(F,ft) if t<=1]); Nin=vertex_normals(V,[f for f,t in zip(F,ft) if t>=2])
# normal-field smoothing on the visible surface: light everywhere (soft drape creases), strong near the collar
# (shell/band junction kinks read as dark teeth and a bright corner spot under the band)
from scipy.sparse import coo_matrix, diags
of=[f for f,t in zip(F,ft) if t<=1]; I=[];J=[]
for f in of:
    for a in range(len(f)):
        I+= [f[a],f[(a+1)%len(f)]]; J+=[f[(a+1)%len(f)],f[a]]
nV=len(V); A=coo_matrix((np.ones(len(I)),(I,J)),shape=(nV,nV)).tocsr(); A.data[:]=1
deg=np.asarray(A.sum(1)).ravel(); Wn=diags(1/np.maximum(deg,1))@A
w=np.full(nV,0.35)
if "collar" in v3 and "collar" in CKEYS:
    cr=np.array([int(v) for v in v3["collar"][0]]); from scipy.spatial import cKDTree
    d=cKDTree(V[cr]).query(V)[0]; w=np.where(d<0.045,0.85,w)
    iters=int(os.environ.get("NSM_ITERS","10"))
else: iters=int(os.environ.get("NSM_ITERS","3"))
act=deg>0
for _ in range(iters):
    Ns=Wn@Nout; Nn=Nout.copy(); Nn[act]=(1-w[act,None])*Nout[act]+w[act,None]*Ns[act]
    Nout=Nn/np.maximum(np.linalg.norm(Nn,axis=1,keepdims=True),1e-9)
ln=[]
for p,t in zip(me.polygons,ft):
    for l in p.loop_indices: ln.append(tuple((Nout if t<=1 else Nin)[me.loops[l].vertex_index]))
me.normals_split_custom_set(ln)
for o in bpy.data.objects: o.select_set(o in (ob,arm))
bpy.context.view_layer.objects.active=ob
bpy.ops.export_scene.gltf(filepath=OUT,export_format="GLB",use_selection=True,export_skins=True,export_animations=False,
    export_tangents=True,export_def_bones=False,export_yup=True,export_apply=False,export_image_format="AUTO",export_morph=False)
print("exported",OUT,os.path.getsize(OUT))
