import sys; sys.path.insert(0,"/home/claude/work/pipe")
import bpy, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from noise3 import fbm3
RES=2048; BK="/home/claude/work/bake/"; ID="court-sneakers-white"
def exr(p):
    im=bpy.data.images.load(p); return np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4)[::-1][...,:3]
POS=exr(BK+"shoe_pos.exr"); WN=exr(BK+"shoe_wn.exr"); AO=np.asarray(Image.open(BK+"shoe_ao.png").convert("L")).astype(np.float32)/255
U=np.load("/home/claude/work/shoe_uv.npz",allow_pickle=True); uv=U["uv"]; lab=U["lab"]
d=np.load("/home/claude/work/shoe_skin.npz",allow_pickle=True); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
sv=np.load("/home/claude/work/shoeL_v1.npz",allow_pickle=True); collar=[list(map(int,r)) for r in sv["collar"]]
nL=len(F)//2
pid={"upper":0,"collar":1,"sole":2,"tread":3,"insole":4,"tongue":5,"laces":6}
Lr=Image.new("I",(RES,RES),-1); dl=ImageDraw.Draw(Lr); lp=0
cin=set(collar[2]+collar[3]+collar[4])
CL=Image.new("L",(RES,RES),0); dc=ImageDraw.Draw(CL)
for k,f in enumerate(F[:nL]):
    pts=[(uv[lp+j,0]*RES,(1-uv[lp+j,1])*RES) for j in range(len(f))]; lp+=len(f)
    dl.polygon(pts,fill=pid[lab[k]])
    if lab[k]=="collar" and sum(v in cin for v in f)>=3: dc.polygon(pts,fill=255)
L=np.array(Lr)
_lm=ndimage.binary_dilation(L==6,iterations=2)&(L<0); L[_lm]=6
valid=L>=0; lining=np.array(CL)>0
X,Y,Z=POS[...,0],POS[...,1],POS[...,2]; P=POS.reshape(-1,3); vm=valid.ravel(); Pv=P[vm]
def full(a,fill=0.0): o=np.full(P.shape[0],fill,np.float32); o[vm]=a; return o.reshape(RES,RES)
def sstep(a,b,t): u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)
AX=(0.106,0.030)
def toe_spring(y): return 0.013*sstep(-0.13,-0.195,y)
def sole_top(y): return np.interp(y,[-0.2,-0.08,0.05,0.12],[0.027,0.029,0.036,0.036])+toe_spring(y)
xm=lambda y: AX[0]+0.010*sstep(0.0,-0.12,y); TW=0.030
upper=(L==0)|((L==1)&~lining); tongue=L==5; laces=L==6; sole=L==2; tread=L==3; insole=L==4
H=np.zeros((RES,RES),np.float32); thread=np.zeros((RES,RES),np.float32); dark=np.zeros((RES,RES),np.float32)
def stitch_line(dist,arc,sel,pitch=0.0030,width=0.00035,h=0.00025):
    global H,thread
    on=np.clip((np.minimum(np.mod(arc,pitch),pitch-np.mod(arc,pitch))-0.00045)/0.0003,0,1)
    st=np.exp(-(dist/width)**2)*on*sel; thread=np.maximum(thread,st); H+=h*st-0.00012*np.exp(-(dist/(width*2.5))**2)*sel
def edge(dist,sel,h=0.0006,w=0.0008):
    global H
    H+=sel*h*np.clip(-dist/w+0.5,0,1)          # overlay sits on top on the negative side
# ---- panels (left shoe coordinates)
ad=np.abs(X-xm(Y))
# toe cap: boundary curve across the vamp
tc=Y-(-0.122+10.0*(X-0.118)**2)            # <0 on the cap
edge(tc,upper,0.0006); stitch_line(np.abs(tc+0.0035),X,upper&(np.abs(tc+0.0035)<0.002)); stitch_line(np.abs(tc+0.0070),X,upper&(np.abs(tc+0.007)<0.002))
# mudguard: band around the bottom of the upper
mg=Z-(sole_top(Y)+0.020)
edge(mg,upper,0.0006); stitch_line(np.abs(mg+0.0035),Y,upper&(np.abs(mg+0.0035)<0.002))
# eyestay: overlays either side of the laces
es=ad-(TW+0.017)
eys=(Y>-0.105)&(Y<0.0)&(Z>0.05)
edge(es,upper&eys,0.0005); stitch_line(np.abs(es+0.003),Y,upper&eys&(np.abs(es+0.003)<0.002))
# eyelets: rings in the eyestay
for y in np.linspace(-0.088,-0.022,6):
    for s in (-1,1):
        ex=xm(y)+s*(TW+0.006); r=np.hypot(X-ex,Y-y)*(Z>0.05)+(Z<=0.05)*1
        H+=upper*(0.0005*np.exp(-((r-0.0034)/0.0008)**2)-0.0012*(r<0.0022)); dark=np.maximum(dark,upper*(r<0.0024)*0.7)
# heel counter
hc=Y-(0.050+0.35*(Z-0.04))                 # >0 on the counter
edge(-hc,upper&(Z<0.085),0.0006); stitch_line(np.abs(hc-0.0035),Z,upper&(np.abs(hc-0.0035)<0.002)&(Z<0.085))
# perforations on the toe cap (top surface only)
upward=WN[...,2]>0.45
P_=0.0072; gx=np.mod((X-0.1)/P_,1); gy=np.mod((Y+0.5*P_*np.floor((X-0.1)/P_))/P_,1)
rr=np.hypot(gx-0.5,gy-0.5)*P_; perf=upper&(tc<-0.016)&upward&(Y>-0.19)&(rr<0.00062)
H-=perf*0.0005; dark=np.maximum(dark,perf*0.38)
# leather grain
Pl=Pv; g1=full(fbm3(Pl,0.0011,2,91)); g2=full(fbm3(Pl,0.004,2,92))
H+=(upper|tongue)*(0.00005*g1+0.00004*g2)
# tongue edge stitch
dt=np.abs(np.abs(X-xm(Y))-(TW-0.004))
stitch_line(dt,Y,tongue&(dt<0.002))
# laces: weave texture
H+=laces*0.00008*full(fbm3(Pv,0.0009,1,93))
# sole: sidewall stitch (cupsole) and texture
sz=np.abs(Z-(sole_top(Y)-0.0065)); stitch_line(sz,np.arctan2(Y-0.0,X-0.11)*0.06,sole&(sz<0.002),pitch=0.0045,width=0.0005,h=0.0002)
H+=sole*0.00004*full(fbm3(Pv,0.002,2,94))
# tread: pivot circles at the ball, herringbone elsewhere
piv=np.hypot(X-0.120,Y+0.115); circ=np.cos(2*np.pi*piv/0.0045)*(piv<0.035)
herr=np.cos(2*np.pi*((Y+np.abs(np.mod(X,0.012)-0.006))/0.0055))*(piv>=0.035)
H+=tread*0.0006*(circ+herr)
# ---- height to tangent normal (texel size from the position map)
dPx=np.linalg.norm(np.diff(POS,axis=1,append=POS[:,-1:]),axis=-1); dPy=np.linalg.norm(np.diff(POS,axis=0,append=POS[-1:]),axis=-1)
mpp=np.clip(ndimage.median_filter(np.where(valid,(dPx+dPy)/2,np.nan),5),1e-5,1e-3); mpp=np.nan_to_num(mpp,nan=2e-4)
_d,(_iy,_ix)=ndimage.distance_transform_edt(~valid,return_indices=True); H=H[_iy,_ix]
gy_,gx_=np.gradient(H); n=np.stack([-gx_/mpp,gy_/mpp,np.ones_like(H)],-1); n/=np.linalg.norm(n,axis=-1,keepdims=True)
# ---- colours (linear)
white=np.array([0.80,0.80,0.78]); col=np.zeros((RES,RES,3),np.float32)
col[upper]=white; col[tongue]=white*0.98; col[L==1]=white
col[lining]=np.array([0.42,0.43,0.45]); col[laces]=np.array([0.86,0.86,0.84])
col[sole]=np.array([0.78,0.76,0.70]); col[tread]=np.array([0.60,0.58,0.54]); col[insole]=np.array([0.10,0.10,0.11])
col*=(1+0.03*full(fbm3(Pv,0.03,2,95)))[...,None]
col=col*(1-0.35*dark[...,None]); col=col*(1-thread[...,None])+np.array([0.72,0.72,0.70])*thread[...,None]
rough=np.full((RES,RES),0.5,np.float32); rough[upper|tongue]=0.60+0.05*g2[upper|tongue]; rough[lining]=0.9; rough[laces]=0.85; rough[sole]=0.68; rough[tread]=0.8; rough[insole]=0.9
rough=rough*(1-thread)+0.75*thread
AOs=ndimage.gaussian_filter(np.where(valid,AO,0),2)/np.maximum(ndimage.gaussian_filter(valid.astype(np.float32),2),1e-3)
AOf=np.where(valid,0.35+0.65*AOs,1)*(1-0.4*dark)
AOf[laces]=np.clip(0.75+0.25*AOf[laces],0.85,1.0); AOf[tongue]=np.maximum(AOf[tongue],0.8)
dist_,(iy,ix)=ndimage.distance_transform_edt(~valid,return_indices=True)
pad=lambda a:a[iy,ix]
col,n,AOf,rough=map(pad,(col,n,AOf,rough))
def srgb(x): x=np.clip(x,0,1); return np.where(x<=0.0031308,12.92*x,1.055*x**(1/2.4)-0.055)
o="/home/claude/work/tex/"
Image.fromarray((srgb(col)*255+0.5).astype(np.uint8)).save(o+f"{ID}_baseColor.png")
Image.fromarray(((n*0.5+0.5)*255+0.5).astype(np.uint8)).save(o+f"{ID}_normal.png")
Image.fromarray((np.stack([AOf,rough,np.zeros_like(AOf)],-1)*255+0.5).astype(np.uint8)).save(o+f"{ID}_orm.png")
print("shoe textures written")
