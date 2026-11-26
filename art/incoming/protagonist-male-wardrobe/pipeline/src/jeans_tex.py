"""Jeans maps: indigo denim (CC0 Poly Haven denim_fabric_03 twill, cylindrical per leg), fades, whiskers, honeycombs,
gold stitching, copper rivets, button, leather patch. Outputs baseColor (sRGB), normal (tangent, +Y), ORM."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy, numpy as np, os
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree
from scipy import ndimage
from noise3 import fbm3
from facetypes import face_types
from jeans_shapes import *
from matplotlib.path import Path as MPath
RES=2048; BK="/home/claude/work/bake/"; ID="jeans-denim-standard"
def load_exr(p):
    im=bpy.data.images.load(p); return np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4)[::-1][...,:3]
POS=load_exr(BK+"jeans_pos.exr")
NB=np.asarray(Image.open(BK+"jeans_normal.png").convert("RGB")).astype(np.float32)/255*2-1
AO=np.asarray(Image.open(BK+"jeans_ao.png").convert("L")).astype(np.float32)/255
U=np.load("/home/claude/work/jeans_uv.npz",allow_pickle=True); uv=U["uv"]; lab=U["lab"]
d=np.load("/home/claude/work/jeans_skin.npz",allow_pickle=True); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
v3=np.load("/home/claude/work/jeans_v3.npz",allow_pickle=True); S=np.load("/home/claude/work/jeans_seams.npz")
types=face_types(F,v3,keys=("waist","hemL","hemR"),collar_keys=())
labid={"frontL":0,"frontR":1,"backL":2,"backR":3,"band":4,"loops":5}
T=Image.new("I",(RES,RES),-1); L=Image.new("I",(RES,RES),-1); dt=ImageDraw.Draw(T); dl=ImageDraw.Draw(L); lp=0
for k,f in enumerate(F):
    pts=[(uv[lp+j,0]*RES,(1-uv[lp+j,1])*RES) for j in range(len(f))]; lp+=len(f)
    dt.polygon(pts,fill=int(types[k])); dl.polygon(pts,fill=labid[lab[k]])
T=np.array(T); L=np.array(L); valid=T>=0
P=POS.reshape(-1,3); vm=valid.ravel(); Pv=P[vm]
X=POS[...,0]; Y=POS[...,1]; Z=POS[...,2]
front=(L==0)|(L==1); back=(L==2)|(L==3); band=L==4; loops=L==5; shell=(T<=1)&valid
def sstep(a,b,t): u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)
def full(vals,fill=0.0): o=np.full(P.shape[0],fill,np.float32); o[vm]=vals; return o.reshape(RES,RES)
# ---------------- denim tile coordinates (metres): cylindrical around each leg axis below 0.92 m, around the pelvis above
LEGX={1:0.106,-1:-0.106}
def legy(z): return np.interp(z,[0.05,0.48,0.9],[0.04,0.021,0.01])
sideS=np.sign(X); sideS[sideS==0]=1
ang_leg=np.arctan2(Y-legy(Z),(X-LEGX[1]*(sideS>0)-LEGX[-1]*(sideS<0))*-sideS)    # 0 = medial, +-pi = lateral (outseam)
s_leg=ang_leg*0.075
ang_p=np.arctan2(X,-(Y-0.01)); s_p=ang_p*0.17                                     # 0 = centre front, +-pi = centre back
wP=sstep(0.90,0.94,Z)
TILE=0.2714
def tile_sample(img,s,t):
    h,w=img.shape[:2]; u=(s/TILE)%1*w; v=(t/TILE)%1*h
    u0=np.floor(u).astype(int)%w; v0=np.floor(v).astype(int)%h; u1=(u0+1)%w; v1=(v0+1)%h; fu=(u-np.floor(u))[...,None]; fv=(v-np.floor(v))[...,None]
    a=img[v0,u0]*(1-fu)+img[v0,u1]*fu; b=img[v1,u0]*(1-fu)+img[v1,u1]*fu; return a*(1-fv)+b*fv
def prefilter(path,lin=True):
    im=Image.open(path).convert("RGB"); im=im.resize((420,420),Image.LANCZOS); a=np.asarray(im).astype(np.float32)/255
    return a
D_diff=prefilter("/home/claude/work/cc0/d03_Diffuse.png"); D_nrm=prefilter("/home/claude/work/cc0/d03_nor_gl.png")*2-1; D_rgh=prefilter("/home/claude/work/cc0/d03_Rough.png")[...,:1]
def both(img):
    a=tile_sample(img,s_leg,Z); b=tile_sample(img,s_p,Z); return a*(1-wP[...,None])+b*wP[...,None]
tdiff=both(D_diff); tnrm=both(D_nrm); trgh=both(D_rgh)[...,0]
tl=tdiff.mean(-1); tl=tl/np.median(tl[valid])
# ---------------- fades (0 = deep indigo, 1 = worn light blue)
fz=lambda a: full(a)
n_low=fz(fbm3(Pv,0.08,3,71)); n_streak=fz(fbm3(np.stack([Pv[:,0],Pv[:,1],Pv[:,2]*0.12],1),0.004,2,72))
fade=np.zeros((RES,RES),np.float32)
# front thighs and knees, seat, along seams and hems
cf=np.cos(ang_leg)  # medial=1, lateral=-1
front_face=np.clip(-(Y-legy(Z))/0.07,0,1)
fade+=front*0.55*np.exp(-((Z-0.68)/0.12)**2)*front_face
fade+=front*0.30*np.exp(-((Z-0.50)/0.05)**2)*front_face
fade+=back*0.30*np.exp(-((Z-0.83)/0.06)**2)*np.exp(-((np.abs(X)-0.09)/0.05)**2)
def seg_dist2(px,pz,poly):
    Q=np.stack([px,pz],-1).reshape(-1,2); dmin=np.full(len(Q),1e3)
    for a_,b_ in zip(poly[:-1],poly[1:]):
        e=b_-a_; t=np.clip(((Q-a_)@e)/max(e@e,1e-12),0,1); dmin=np.minimum(dmin,np.linalg.norm(Q-(a_+t[:,None]*e),axis=1))
    return dmin.reshape(px.shape)
# whiskers (irregular light streaks along the creases)
rngw=np.random.default_rng(11)
for sgn in (1,-1):
    for k in range(6):
        ang=rngw.uniform(5,38); ln=rngw.uniform(0.06,0.12); a0=np.array([sgn*rngw.uniform(0.03,0.05),rngw.uniform(0.855,0.885)])
        dv=np.array([sgn*np.cos(np.radians(ang)),np.sin(np.radians(ang))])
        dd=seg_dist2(X,Z,np.array([a0+dv*0.01,a0+dv*ln])); tpos=((X-a0[0])*dv[0]+(Z-a0[1])*dv[1])/ln
        fade+=front*(sgn*X>0)*rngw.uniform(0.18,0.38)*np.exp(-(dd/rngw.uniform(0.003,0.006))**2)*np.clip(np.sin(np.pi*np.clip(tpos,0,1)),0,1)**1.5
# honeycombs
for sgn,pl in HONEY:
    dd=seg_dist2(X,Z,pl); e=np.hypot(X-pl.mean(0)[0],Z-pl.mean(0)[1])/(np.linalg.norm(pl[-1]-pl[0])/2)
    fade+=back*(sgn*X>0)*0.5*np.exp(-(dd/0.004)**2)*np.clip(1-e**2,0,1)
# seam roping / edge wear
seam_pts=np.vstack([S["seam_side"],S["seam_center"],S["seam_band"]]); tr=cKDTree(seam_pts)
dseam=full(tr.query(Pv)[0],1); fade+=0.35*np.exp(-(dseam/0.003)**2)*(0.6+0.4*np.sin(Z*900))
hemd=np.full((RES,RES),1e3)
for key in ("hemL","hemR"): hemd=np.minimum(hemd,full(cKDTree(S[key]).query(Pv)[0],1))
fade+=0.45*np.exp(-(hemd/0.004)**2)
fade+=0.10*n_low+0.10*n_streak
fade=np.clip(fade,0,1)
# ---------------- stitches (gold) and construction
thread=np.zeros((RES,RES),np.float32); Hd=np.zeros((RES,RES),np.float32)
def stitch(dist,arc,off,sel,pitch=0.0034,gap=0.0009,width=0.00040,height=0.00025):
    global thread,Hd
    across=np.exp(-((dist-off)/width)**2); ph=np.mod(arc,pitch)/pitch; on=np.clip((np.minimum(ph,1-ph)*pitch-gap/2)/0.0004,0,1)
    st=across*on*sel; thread=np.maximum(thread,st); Hd+=height*st-0.00015*np.exp(-((dist-off)/(width*2.5))**2)*sel
def polyline_dist_arc(px,pz,poly):
    Q=np.stack([px,pz],-1).reshape(-1,2); dmin=np.full(len(Q),1e3); arc=np.zeros(len(Q)); acc=0
    for a_,b_ in zip(poly[:-1],poly[1:]):
        e=b_-a_; L_=np.linalg.norm(e); t=np.clip(((Q-a_)@e)/max(L_*L_,1e-12),0,1); dd=np.linalg.norm(Q-(a_+t[:,None]*e),axis=1)
        m=dd<dmin; dmin[m]=dd[m]; arc[m]=acc+t[m]*L_; acc+=L_
    return dmin.reshape(px.shape),arc.reshape(px.shape)
def signed_side(px,pz,poly):
    Q=np.stack([px,pz],-1).reshape(-1,2); dmin=np.full(len(Q),1e3); sg=np.zeros(len(Q))
    for a_,b_ in zip(poly[:-1],poly[1:]):
        e=b_-a_; t=np.clip(((Q-a_)@e)/max(e@e,1e-12),0,1); dd=np.linalg.norm(Q-(a_+t[:,None]*e),axis=1); m=dd<dmin
        dmin[m]=dd[m]; sg[m]=np.sign(e[0]*(Q[m,1]-a_[1])-e[1]*(Q[m,0]-a_[0]))
    return sg.reshape(px.shape)
REF={"pocket1":(0.10,0.85),"pocket-1":(-0.10,0.85),"fly":(0.0,0.90),"yoke1":(0.08,0.86),"yoke-1":(-0.08,0.86)}
for nm,pl in list(FRONT.items())+list(BACK.items()):
    pl=np.array(pl); isfront=nm in FRONT; panel=front if isfront else back
    dd,ar=polyline_dist_arc(X,Z,pl)
    if nm.startswith("bpocket") or nm=="coin":
        side=MPath(pl).contains_points(np.stack([X.ravel(),Z.ravel()],1)).reshape(X.shape)
    else:
        rx,rz=REF[nm]; sref=signed_side(np.array([[rx]]),np.array([[rz]]),pl)[0,0]; side=signed_side(X,Z,pl)==sref
    offs=(0.0,0.006) if nm=="fly" else ((0.0025,) if nm=="coin" else (0.0028,0.0088))
    for off in offs: stitch(dd,ar,off,panel&shell&side&(dd<0.02))
# inseam (medial) felled seam double stitch; centre seams double; band top/bottom; hems single chain stitch
trs=cKDTree(S["seam_side"]); ds,ii=trs.query(Pv); dside=full(ds,1); arcs=full(S["arc_side"][ii],0)
medial=np.cos(ang_leg)>0
for off in (0.0035,0.0095): stitch(dside,arcs,off,shell&medial&(Z<0.86))
trc=cKDTree(S["seam_center"]); dc,ic=trc.query(Pv); dcen=full(dc,1); arcc=full(S["arc_center"][ic],0)
for off in (0.0035,0.0095): stitch(dcen,arcc,off,shell)
nl=S["neckline"]; trw=cKDTree(nl); dw,iw=trw.query(Pv); dwaist=full(dw,1); arcw=full(np.r_[0,np.cumsum(np.linalg.norm(np.diff(nl,axis=0),axis=1))][iw],0)
for off in (0.004,0.032): stitch(dwaist,arcw,off,shell|band)
for key in ("hemL","hemR"):
    tk=cKDTree(S[key]); dh,ih=tk.query(Pv); stitch(full(dh,1),full(S[key+"_arc"][ih],0),0.012,shell,pitch=0.0028)
# jersey-free: twill handled by the tile; add the tile normal
# ---------------- metal + leather
metal=np.zeros((RES,RES),np.float32); Hm=np.zeros((RES,RES),np.float32)
for (rx,rz) in RIVETS_F:
    r=np.hypot(X-rx,Z-rz); m=front&(r<0.004); metal=np.maximum(metal,m*1.0); Hm+=front*np.clip(1-(r/0.0038)**2,0,1)*0.0012
r=np.hypot(X-BUTTON_F[0],Z-BUTTON_F[1]); mb=(band|front)&(Y<0)&(r<0.0085); metal=np.maximum(metal,mb*1.0)
Hm+=mb*(0.0016*np.clip(1-(r/0.0085)**2,0,1)+0.0004*np.exp(-((r-0.0065)/0.0007)**2))
cx,cz,pw,ph_=PATCH_B; leather=back*(Y>0)*(np.abs(X-cx)<pw/2)*(np.abs(Z-cz)<ph_/2)
leather=leather|((band)&(Y>0)&(np.abs(X-cx)<pw/2)&(np.abs(Z-cz)<ph_/2))
edge=np.minimum(pw/2-np.abs(X-cx),ph_/2-np.abs(Z-cz)); Hm+=leather*(0.0008*np.clip(edge/0.002,0,1)-0.0003*np.exp(-((edge-0.004)/0.0006)**2))
# ---------------- compose normal
px=1/1470.0
H=Hd+Hm+0.00005*n_streak
gy,gx=np.gradient(H); nd=np.stack([-gx/px,gy/px,np.ones_like(H)],-1); nd/=np.linalg.norm(nd,axis=-1,keepdims=True)
NBf=NB.copy(); NBf[(T>=1)|band|loops]=[0,0,1]
fadeN=np.clip((hemd-0.015)/0.02,0,1)[...,None]; NBf=NBf*fadeN+np.array([0,0,1.0])*(1-fadeN); NBf/=np.linalg.norm(NBf,axis=-1,keepdims=True)
twill=tnrm.copy(); twill[...,:2]*=0.6*(1-metal[...,None])*(1-leather[...,None]*1.0)
n=np.concatenate([NBf[...,:2]+nd[...,:2]+twill[...,:2],NBf[...,2:3]],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
# ---------------- base colour (linear)
dark=np.array([0.016,0.036,0.125]); light=np.array([0.10,0.19,0.40])
fadec=fade**1.2
col=(dark*(1-fadec[...,None])+light*fadec[...,None])*np.clip(0.80+0.30*(tl[...,None]-1)*2.2,0.55,1.35)
gold=np.array([0.62,0.36,0.09]); thr=0.85*thread
col=col*(1-thr[...,None])+gold*thr[...,None]
copper=np.array([0.70,0.42,0.24]); brass=np.array([0.62,0.52,0.32])
mcol=np.where(mb[...,None],brass,copper); col=col*(1-metal[...,None])+mcol*metal[...,None]
lc=np.array([0.20,0.10,0.045])*(1+0.15*n_low[...,None]); col=np.where(leather[...,None],lc,col)
col[T==3]*=0.8
rough=np.clip(0.80+0.12*(trgh-0.5),0.6,0.95); rough=rough*(1-thread)+0.65*thread
rough=np.where(metal>0.5,0.32,rough); rough=np.where(leather,0.55,rough)
metallic=metal.copy()
AOf=AO.copy(); AOf[T==3]=0.5; AOf[(T==1)|(T==2)]=np.clip(AOf[(T==1)|(T==2)],0.8,1)
AOs=ndimage.gaussian_filter(np.where(valid,AOf,0),3)/np.maximum(ndimage.gaussian_filter(valid.astype(np.float32),3),1e-3)
AOf=np.where(valid,0.3+0.7*AOs,1)
dist_,(iy,ix)=ndimage.distance_transform_edt(~valid,return_indices=True)
near=dist_<=10
meanc=col[valid].mean(0)
def pad(a):
    o=a[iy,ix].copy()
    if o.ndim==3 and o.shape[-1]==3 and a is col: o[~near]=meanc
    return o
col,n,AOf,rough,metallic=map(pad,(col,n,AOf,rough,metallic))
def srgb(x): x=np.clip(x,0,1); return np.where(x<=0.0031308,12.92*x,1.055*x**(1/2.4)-0.055)
out="/home/claude/work/tex/"
Image.fromarray((srgb(col)*255+0.5).astype(np.uint8)).save(out+f"{ID}_baseColor.png")
Image.fromarray(((n*0.5+0.5)*255+0.5).astype(np.uint8)).save(out+f"{ID}_normal.png")
Image.fromarray((np.stack([AOf,rough,metallic],-1)*255+0.5).astype(np.uint8)).save(out+f"{ID}_orm.png")
np.save(out+"jeans_types.npy",T); print("jeans textures written; thread texels",int((thread>0.3).sum()),"metal",int(metal.sum()))
