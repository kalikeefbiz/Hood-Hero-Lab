"""Composite final tee maps from bakes: baseColor (sRGB), normal (tangent, OpenGL/+Y), ORM (AO, rough, metal)."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy, numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree
from scipy import ndimage
from noise3 import fbm3
RES=2048; BK="/home/claude/work/bake/"
def load_exr(p):
    im=bpy.data.images.load(p); a=np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4)[::-1]; return a[...,:3]
POS=load_exr(BK+"tee_pos.exr")
NB=np.asarray(Image.open(BK+"tee_normal.png").convert("RGB")).astype(np.float32)/255*2-1
AO=np.asarray(Image.open(BK+"tee_ao.png").convert("L")).astype(np.float32)/255
U=np.load("/home/claude/work/tee_uv.npz",allow_pickle=True); uv=U["uv"]
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True); S=np.load("/home/claude/work/tee_seams.npz")
lab=U["lab"]
# ---- face types: 0 shell, 1 outer band, 2 lip (flat), 3 inner facing
from facetypes import face_types
types=face_types(F,v3)
labid={"front":0,"back":1,"sleeveL":2,"sleeveR":3,"collar":4}
T=Image.new("I",(RES,RES),-1); L=Image.new("I",(RES,RES),-1)
dt=ImageDraw.Draw(T); dl=ImageDraw.Draw(L)
loop=0
for k,f in enumerate(F):
    pts=[(uv[loop+j,0]*RES,(1-uv[loop+j,1])*RES) for j in range(len(f))]; loop+=len(f)
    dt.polygon(pts,fill=int(types[k])); dl.polygon(pts,fill=labid[lab[k]])
T=np.array(T); L=np.array(L); valid=T>=0
print("types texels:",[(t,int((T==t).sum())) for t in range(4)])
# ---- geometry helpers (A-pose positions)
P=POS.reshape(-1,3); vm=valid.ravel()
def seam_dist(pts,arc=None):
    tr=cKDTree(pts); dd,ii=tr.query(P[vm]); out=np.full(P.shape[0],1e3); out[vm]=dd
    sa=np.zeros(P.shape[0]);
    if arc is not None: sa[vm]=arc[ii]
    return out.reshape(RES,RES), sa.reshape(RES,RES)
Hd=np.zeros((RES,RES),np.float32)        # detail height (m)
thread=np.zeros((RES,RES),np.float32)    # thread mask for colour/roughness
def stitch_row(dist,arc,off,sel,pitch=0.0030,gap=0.0007,width=0.00045,height=0.00030):
    across=np.exp(-((dist-off)/width)**2)
    ph=np.mod(arc,pitch)/pitch; on=np.clip((np.minimum(ph,1-ph)*pitch-gap/2)/0.0004,0,1)
    st=across*on*sel; groove=np.exp(-((dist-off)/(width*2.6))**2)*sel
    return height*st-0.00018*groove*(1-on*0.5), st
shell=(T==0)|(T==1)
hemd=np.full((RES,RES),1e3)
# hems: double coverstitch on the outer face, 10 and 16 mm above the fold edge
for key in ("hemL","hemR","hemB"):
    dist,arc=seam_dist(S[key],S[key+"_arc"]); hemd=np.minimum(hemd,dist)
    for off in ((0.0095,0.0155) if key!="hemB" else (0.010,0.0165)):
        h,st=stitch_row(dist,arc,off,shell&(dist<0.03)); Hd+=h; thread=np.maximum(thread,st)
# collar: knit rib along the band + one topstitch row on the body 5 mm below the neck seam
dist_n,arc_n=seam_dist(S["neckline"],np.r_[0,np.cumsum(np.linalg.norm(np.diff(S["neckline"],axis=0),axis=1))])
rib=(L==4)&(T<=2)
Hd+=rib*0.00022*np.cos(2*np.pi*arc_n/0.0024)
h,st=stitch_row(dist_n,arc_n,0.0050,(L!=4)&(T==0)&(dist_n<0.02)); Hd+=h; thread=np.maximum(thread,st)
# shoulder tape topstitch on the back panel side of the shoulder seam (upper part of the body seams only)
bs=S["seam_body"]; ba=S["arc_body"]; top=bs[:,2]>1.38
if top.any():
    dist_s,arc_s=seam_dist(bs[top],ba[top])
    h,st=stitch_row(dist_s,arc_s,0.0035,(L==1)&(T==0)&(dist_s<0.015)); Hd+=h; thread=np.maximum(thread,st)
# jersey grain: fine anisotropic noise (wales run vertically on panels)
Pv=P[vm]; g=np.zeros(P.shape[0],np.float32)
g[vm]=0.6*fbm3(Pv,0.0016,2,41,aniso=(1,1,2.5))+0.4*fbm3(Pv,0.0007,1,43)
Hd+=0.00006*g.reshape(RES,RES)*shell
# ---- detail height -> tangent normal (texel size ~0.58 mm)
px=1/1720.0
_d,(_iy,_ix)=ndimage.distance_transform_edt(~valid,return_indices=True); Hd=Hd[_iy,_ix]
gy,gx=np.gradient(Hd)
nd=np.stack([-gx/px,gy/px,np.ones_like(Hd)],-1); nd/=np.linalg.norm(nd,axis=-1,keepdims=True)
NBf=NB.copy()
flat=(T==1)|(T==2)|(T==3)
NBf[flat]=[0,0,1]
fade=np.clip((hemd-0.012)/0.025,0,1)[...,None]
NBf=NBf*fade+np.array([0,0,1.0])*(1-fade); NBf/=np.linalg.norm(NBf,axis=-1,keepdims=True)
n=np.concatenate([NBf[...,:2]+nd[...,:2],NBf[...,2:3]],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
# ---- AO cleanup on facings, gentle contrast
AOf=AO.copy(); AOf[T==3]=0.55; AOf[(T==1)|(T==2)]=np.clip(AOf[(T==1)|(T==2)],0.85,1)
AOf=0.25+0.75*AOf                                   # keep runtime AO subtle; lighting already gives shape
# smooth bake noise out of AO (normal map carries the fine detail); keep collar band bright and even
AOs=ndimage.gaussian_filter(np.where(valid,AOf,0),3)/np.maximum(ndimage.gaussian_filter(valid.astype(np.float32),3),1e-3)
AOf=np.where(valid,AOs,AOf)
AOf[(L==4)]=np.clip(AOf[(L==4)],0.9,1.0)
# ---- base colour (linear), roughness
low=np.zeros(P.shape[0],np.float32); low[vm]=fbm3(Pv,0.06,3,51); low=low.reshape(RES,RES)
fib=g.reshape(RES,RES)
base_lin=0.80*(1+0.012*low+0.020*fib)
col=np.stack([base_lin*1.0,base_lin*0.995,base_lin*0.975],-1)
col=col*(1-thread[...,None])+thread[...,None]*np.array([0.86,0.86,0.85])
col[T==3]*=0.97
rough=0.86+0.03*low-0.12*thread
import os
if os.environ.get('EXP')=='noao': AOf[:]=1.0
if os.environ.get('EXP')=='flatn': n[:]=[0,0,1]
# ---- pad islands (fill background from nearest valid texel)
_,(iy,ix)=ndimage.distance_transform_edt(~valid,return_indices=True)
def pad(a): return a[iy,ix]
col=pad(col); n=pad(n); AOf=pad(AOf); rough=pad(rough)
def srgb(x): x=np.clip(x,0,1); return np.where(x<=0.0031308,12.92*x,1.055*x**(1/2.4)-0.055)
out="/home/claude/work/tex/"; import os; os.makedirs(out,exist_ok=True)
Image.fromarray((srgb(col)*255+0.5).astype(np.uint8)).save(out+"tee-white_baseColor.png")
Image.fromarray(((n*0.5+0.5)*255+0.5).astype(np.uint8)).save(out+"tee-white_normal.png")
Image.fromarray((np.stack([AOf,np.clip(rough,0,1),np.zeros_like(AOf)],-1)*255+0.5).astype(np.uint8)).save(out+"tee-white_orm.png")
np.save(out+"tee_types.npy",T)
print("textures written; thread texels",int((thread>0.3).sum()))
