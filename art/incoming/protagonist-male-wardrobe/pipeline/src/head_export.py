import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy, numpy as np
from PIL import Image, ImageDraw
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/head01.blend")
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; h=bpy.data.objects["Head_face_01_new"]
me=h.data; Z_SEAM=1.538; BLEND=0.036
tex=np.asarray(Image.open("/home/claude/work/meshy/raw_texture_0.png").convert("RGB")).astype(np.float32)/255
RES=tex.shape[0]
uv=np.zeros((len(me.loops),2)); me.uv_layers[0].data.foreach_get("uv",uv.ravel())
# per-texel height via rasterising z into UV space
V=np.array([v.co for v in me.vertices])
maps={k:Image.new("F",(RES,RES),9.0) for k in "xyz"}; dr={k:ImageDraw.Draw(m) for k,m in maps.items()}
for p in me.polygons:
    li=list(p.loop_indices); c=V[list(p.vertices)].mean(0); poly=[(uv[l,0]*RES,(1-uv[l,1])*RES) for l in li]
    for i,k in enumerate("xyz"): dr[k].polygon(poly,fill=float(c[i]))
X,Y,Z=(np.array(maps[k]) for k in "xyz"); valid=Z<5
def lin(x): return np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
def srgb(x): x=np.clip(x,0,1); return np.where(x<=0.0031308,12.92*x,1.055*x**(1/2.4)-0.055)
L=lin(tex)
body=bpy.data.objects["Body"]; bme=body.data
cimg=np.asarray(Image.open("/home/claude/work/face/complexion-01.png").convert("RGB")).astype(np.float32)/255; CH,CW=cimg.shape[:2]
buv=np.zeros((len(bme.loops),2)); bme.uv_layers[0].data.foreach_get("uv",buv.ravel()); BV=np.array([v.co for v in bme.vertices])
cx,cy=BV[BV[:,2]>Z_SEAM-0.01][:,:2].mean(0)
angs=[];cols=[]
for p in bme.polygons:
    c=BV[list(p.vertices)].mean(0)
    if c[2]>Z_SEAM-0.03:
        u,v=buv[list(p.loop_indices)].mean(0); angs.append(np.arctan2(c[1]-cy,c[0]-cx)); cols.append(lin(cimg[int(np.clip(v,0,.9999)*CH),int(np.clip(u,0,.9999)*CW)]))
angs=np.array(angs); cols=np.array(cols); o=np.argsort(angs); angs,cols=angs[o],cols[o]
from scipy.ndimage import gaussian_filter1d
cols=gaussian_filter1d(cols,6,axis=0,mode="wrap")
A=np.arctan2(Y-cy,X-cx)
tgt=np.stack([np.interp(A,np.r_[angs-2*np.pi,angs,angs+2*np.pi],np.r_[cols[:,k],cols[:,k],cols[:,k]]) for k in range(3)],-1)
# local head colour near the seam (same angle), smoothed in texture space
from scipy import ndimage
zone=valid&(Z<Z_SEAM+0.05)
def blur_masked(a,m,s):
    num=ndimage.gaussian_filter(np.where(m[...,None],a,0),(s,s,0)); den=ndimage.gaussian_filter(m.astype(np.float32),s)[...,None]; return num/np.maximum(den,1e-4)
loc=blur_masked(L,zone,25)
skin=valid&(Z>1.58)&(Z<1.70)
g_ratio=(cols.mean(0)/L[skin].mean(0))
print("global ratio",g_ratio.round(2))
GL=0.5   # partial global tone shift toward the body complexion
Lg=L*g_ratio**GL
BLEND=0.060
w=np.clip((Z_SEAM+BLEND-Z)/BLEND,0,1); w=ndimage.gaussian_filter(w*w*(3-2*w),4)[...,None]
locg=loc*g_ratio**GL
L2=Lg*(1-w)+Lg*(tgt/np.maximum(locg,1e-4))*w
# last ~2 cm above the seam: the body's own tone exactly (no head-texture detail ratio), so no tonal step at the join
w2=np.clip((Z_SEAM+0.022-Z)/0.022,0,1); w2=ndimage.gaussian_filter(w2*w2*(3-2*w2),3)[...,None]
L2=L2*(1-w2)+tgt*w2
out=(srgb(L2)*255+0.5).astype(np.uint8); Image.fromarray(out).save("/home/claude/work/tex/face01_tex_blended.png")
mat=bpy.data.materials.new("M_Head_face_01"); mat.use_nodes=True; nt=mat.node_tree; bsdf=[n for n in nt.nodes if n.type=="BSDF_PRINCIPLED"][0]
im=bpy.data.images.load("/home/claude/work/tex/face01_tex_blended.png"); im.name="face01_tex_blended"
t=nt.nodes.new("ShaderNodeTexImage"); t.image=im; nt.links.new(t.outputs["Color"],bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value=0.6; bsdf.inputs["Metallic"].default_value=0.0
me.materials.clear(); me.materials.append(mat)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
bm_=body.data; bvb=BVHTree.FromPolygons([tuple(v.co) for v in bm_.vertices],[tuple(p.vertices) for p in bm_.polygons])
me.update(); HN=np.array([v.normal for v in me.vertices]); ln=[]
for l in me.loops:
    v=me.vertices[l.vertex_index]; z=v.co.z; w=np.clip(1-(z-Z_SEAM)/0.035,0,1); w=w*w*(3-2*w)
    n=HN[l.vertex_index]
    if w>0:
        loc,nb_,fi,dd=bvb.find_nearest(Vector((v.co.x,v.co.y,min(z,Z_SEAM-0.002))))
        # smooth body normal: average of the nearest face's vertex normals
        bn=np.mean([bm_.vertices[i].normal for i in bm_.polygons[fi].vertices],axis=0); bn/=np.linalg.norm(bn)
        n=(1-w)*n+w*bn; n/=np.linalg.norm(n)
    ln.append(tuple(n))
me.normals_split_custom_set(ln)
h.name="Head_face_01"; me.name="Head_face_01"
for o in bpy.data.objects: o.select_set(o in (h,arm))
bpy.context.view_layer.objects.active=h
bpy.ops.export_scene.gltf(filepath="/home/claude/work/export/face-01_src.glb",export_format="GLB",use_selection=True,export_skins=True,export_animations=False,export_def_bones=False,export_yup=True,export_apply=False)
print("exported")
