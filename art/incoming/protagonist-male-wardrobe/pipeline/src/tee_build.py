"""Tee shell v2: geometric cuts, tube sleeves, hanging torso (hull drape), clean rims."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from scipy.spatial import ConvexHull, cKDTree
bp=BodyPrep(); P=bp.Pw
wA=bp.grp(lambda n:n.startswith(("upper_arm","forearm","hand")))
wL=bp.grp(lambda n:n.startswith(("thigh","shin","foot","toe")))
CFG=dict(T_END=0.60, R_SLEEVE=0.068, HEM_Z=0.905, HEM_SIDE_LIFT=0.036, SEL_Z=0.985, NECK_A=0.094, NECK_B=0.072, NECK_BF=0.072, NECK_YC=0.036, EASE_TOP=0.007, MEMBRANE_FLOOR=0.008, MEMBRANE_ITERS=40, EASE_TORSO=0.024)
# ---- arm frames
AX={s:bp.arm_axis(s) for s in "LR"}
def arm_coords(p,s):
    h,dv,L=AX[s]; q=p-h; t=q@dv; rad=q-np.outer(t,dv) if q.ndim>1 else q-t*dv
    return t/L, rad
side=np.where(P[:,0]>0,"L","R")
t_arm=np.zeros(len(P)); rho=np.zeros(len(P))
for s in "LR":
    m=side==s; t,rad=arm_coords(P[m],s); t_arm[m]=t; rho[m]=np.linalg.norm(rad,axis=1)
armv=(rho<0.075)&(t_arm>0.15)&(wA>0.3)
# ---- selection by exact level-set cuts
from lscut import *
V=P.copy(); F=[tuple(f) for f in bp.faces]
attrs=dict(t=t_arm.copy(), rho=rho.copy(), sideL=(P[:,0]>0).astype(float), armv=armv.astype(float), wL=wL.copy(), wA=wA.copy())
def cut(g):
    global V,F,attrs
    V2,F2,ip,_=levelset_cut(V,F,g)
    attrs={k:interp_attr(a,ip) for k,a in attrs.items()}
    V,F,used=compact(V2,F2); attrs={k:a[used] for k,a in attrs.items()}
# hem plane (also drops legs)
cut(CFG["SEL_Z"]-V[:,2])
# sleeves: plane perpendicular to each upper-arm axis, limited to the arm
for s_ in "LR":
    h,dv,L=AX[s_]; t=((V-h)@dv)/L; q=(V-h)-np.outer((V-h)@dv,dv); rr=np.linalg.norm(q,axis=1)
    onside=(V[:,0]>0) if s_=="L" else (V[:,0]<0)
    g=np.minimum(t-CFG["T_END"], (0.085-rr)*3.0); g=np.where(onside,g,-1.0)
    cut(g)
# neck: elliptic cylinder above the collarbones
NA,NB_,YC=CFG["NECK_A"],CFG["NECK_B"],CFG["NECK_YC"]
NBv=np.where(V[:,1]<YC,CFG['NECK_BF'],NB_)
r_e=np.sqrt((V[:,0]/NA)**2+((V[:,1]-YC)/NBv)**2)
cut(np.minimum(1.0-r_e,(V[:,2]-1.40)*10))
# keep the main piece
from collections import defaultdict as _dd
adj=_dd(set)
for f in F:
    for v in f: adj[v].update(f)
seen=set(); best=set()
for v in adj:
    if v in seen: continue
    st=[v]; c=set()
    while st:
        x=st.pop()
        if x in seen: continue
        seen.add(x); c.add(x); st.extend(adj[x]-seen)
    if len(c)>len(best): best=c
F=[f for f in F if f[0] in best]; V,F,used=compact(V,F); attrs={k:a[used] for k,a in attrs.items()}
# remove boundary 'ear' triangles (two boundary edges): they fold over when the rim is smoothed
from collections import defaultdict as _dd2
for _ in range(5):
    ec=_dd2(int)
    for f in F:
        for k in range(3): ec[tuple(sorted((f[k],f[(k+1)%3])))]+=1
    ears=[i for i,f in enumerate(F) if sum(ec[tuple(sorted((f[k],f[(k+1)%3])))]==1 for k in range(3))>=2]
    if not ears: break
    es=set(ears); F=[f for i,f in enumerate(F) if i not in es]
    V,F,used=compact(V,F); attrs={k:a[used] for k,a in attrs.items()}
    print("removed ear triangles",len(ears))
loops,nm=boundary_loops(F)
print("cut mesh verts",len(V),"faces",len(F),"loops",[len(l) for l in loops],"nm",nm)
vid=np.arange(len(V))
# fill small holes (selection pinholes) with a fan
small=[l for l in loops if len(l)<20]; loops=[l for l in loops if len(l)>=20]
for l in small:
    cyc=order_loop(l,F); c=len(V); V=np.vstack([V,V[cyc].mean(0)])
    # orient fan consistently with neighbouring face winding
    a,b=cyc[0],cyc[1]; same=any(f[k]==a and f[(k+1)%len(f)]==b for f in F for k in range(len(f)))
    for k in range(len(cyc)):
        p,q=cyc[k],cyc[(k+1)%len(cyc)]
        F.append((q,p,c) if same else (p,q,c))
print("filled holes",[len(l) for l in small])
def cls(l):
    c=V[l].mean(0)
    if c[2]<1.1: return "hem"
    if abs(c[0])<0.06 and c[2]>1.38: return "neck"
    return "sleeveL" if c[0]>0 else "sleeveR"
LP={}
for l in loops: LP.setdefault(cls(l),[]).append(l)
print({k:[len(x) for x in v] for k,v in LP.items()})
assert all(len(v)==1 for v in LP.values()) and len(LP)==4, "unexpected boundary topology"
LP={k:order_loop(v[0],F) for k,v in LP.items()}
nx=len(V)-len(vid)
tA=np.r_[attrs['t'],np.zeros(nx)]; rA=np.r_[attrs['rho'],np.zeros(nx)]; sideV=np.r_[np.where(attrs['sideL']>0.5,'L','R'),np.array(['C']*nx)]; armV=np.r_[attrs['armv']>0.5,np.zeros(nx,bool)]
# ---- target positions
bvh=make_bvh(P,bp.faces)
NB=vertex_normals(P,bp.faces)
T=V.copy()
for i in range(len(V)):
    sd,loc,n=signed_dist(bvh,V[i]); T[i]=V[i]+n*CFG["EASE_TOP"]
# sleeves: tube around the arm axis
for i in range(len(V)):
    if not armV[i]: continue
    s=sideV[i]; h,dv,L=AX[s]; q=V[i]-h; t=q@dv; rad=q-t*dv; rn=np.linalg.norm(rad)
    w=np.clip((tA[i]-0.18)/(CFG["T_END"]-0.18),0,1); w=w*w*(3-2*w)
    r_t=max(rn+CFG["EASE_TOP"], (1-w)*(rn+CFG["EASE_TOP"])+w*CFG["R_SLEEVE"])
    T[i]=h+t*dv+rad/rn*r_t
# torso: hanging hull per slice
Zs=np.arange(0.80,1.36,0.01); NPH=180; phis=np.linspace(-np.pi,np.pi,NPH,endpoint=False)
bodyT=P[(wA<0.25)&(np.abs(P[:,0])<0.30)]
Rtab=np.zeros((len(Zs),NPH)); Ctab=np.zeros((len(Zs),2)); polys=[]
for k,z in enumerate(Zs):
    sl=bodyT[np.abs(bodyT[:,2]-z)<0.008][:,:2]
    hull=ConvexHull(sl); poly=sl[hull.vertices]; polys.append(poly); Ctab[k]=poly.mean(0)
from scipy.ndimage import gaussian_filter1d
Ctab=gaussian_filter1d(Ctab,3,axis=0)
for k in range(len(Zs)):
    poly=polys[k]; c=Ctab[k]
    for j,ph in enumerate(phis):
        d=np.array([np.cos(ph),np.sin(ph)]); best=0
        for a in range(len(poly)):
            p0=poly[a]-c; p1=poly[(a+1)%len(poly)]-c; e=p1-p0
            M=np.array([d,-e]).T
            if abs(np.linalg.det(M))<1e-12: continue
            tt,ss=np.linalg.solve(M,p0)
            if tt>0 and 0<=ss<=1: best=max(best,tt)
        Rtab[k,j]=best
# smooth centres, enforce hanging (fabric falls from the chest, may taper only slightly)

from scipy.ndimage import gaussian_filter1d
# taut-cloth envelope: per angle, the upper concave hull of r(z) (fabric bridges bumps with straight spans)
def upper_hull(z,r):
    pts=list(zip(z,r)); H=[]
    for p in pts:
        while len(H)>=2 and ((H[-1][0]-H[-2][0])*(p[1]-H[-2][1])-(H[-1][1]-H[-2][1])*(p[0]-H[-2][0]))>=0: H.pop()
        H.append(p)
    hz,hr=zip(*H); return np.interp(z,hz,hr)
Rraw=Rtab.copy()
Rs=gaussian_filter1d(gaussian_filter1d(Rraw,5,axis=0,mode="nearest"),2,axis=1,mode="wrap")
for _ in range(3):
    Rs=np.maximum(Rs,Rraw-0.010); Rs=gaussian_filter1d(gaussian_filter1d(Rs,3,axis=0,mode="nearest"),1.5,axis=1,mode="wrap")
Rtab=np.maximum(Rs,Rraw-0.010)
top=Zs>=0.95
dirs=np.stack([np.cos(phis),np.sin(phis)],1)            # (NPH,2)
cdot=Ctab[top]@dirs.T                                     # (nz,NPH) centre offset along each direction
Q=Rraw[top]+cdot
Renv=np.stack([upper_hull(Zs[top],Q[:,j]) for j in range(NPH)],1)-cdot
Renv=np.maximum(gaussian_filter1d(Renv,2,axis=1,mode="wrap"),Renv-0.0015)
blend=np.clip((Zs[top]-0.95)/0.04,0,1)[:,None]*(np.abs(np.sin(phis))**2)[None,:]
Rtab[top]=blend*Renv+(1-blend)*Rtab[top]
Rtab=gaussian_filter1d(Rtab,1.0,axis=0,mode="nearest")
print("envelope: mean lift over raw %.4f max %.4f"%((Rtab-Rraw).mean(),(Rtab-Rraw).max()))
from scipy.interpolate import RectBivariateSpline
_pad=12
_ph_ext=np.r_[phis[-_pad:]-2*np.pi,phis,phis[:_pad]+2*np.pi]
_R_ext=np.hstack([Rtab[:,-_pad:],Rtab,Rtab[:,:_pad]])
_spl=RectBivariateSpline(Zs,_ph_ext,_R_ext,kx=3,ky=3,s=0)
_cx=RectBivariateSpline(Zs,[0,1,2,3],np.repeat(Ctab[:,:1],4,1),kx=3,ky=1); _cy=RectBivariateSpline(Zs,[0,1,2,3],np.repeat(Ctab[:,1:],4,1),kx=3,ky=1)
def hull_target(p,ease):
    z=float(np.clip(p[2],Zs[0],Zs[-1])); c=np.array([_cx(z,1.0)[0,0],_cy(z,1.0)[0,0]])
    d=p[:2]-c; ph=np.arctan2(d[1],d[0]); r=_spl(z,ph)[0,0]
    lowside=np.clip((1.06-z)/0.10,0,1); lowside=lowside*lowside*(3-2*lowside)
    e=ease*(0.35+0.65*abs(np.sin(ph)))+0.004+0.008*lowside*(1-abs(np.sin(ph)))
    return np.array([c[0]+(r+e)*np.cos(ph), c[1]+(r+e)*np.sin(ph), p[2]])
def hull_target_old(p,ease):
    z=np.clip(p[2],Zs[0],Zs[-1]); k=np.interp(z,Zs,np.arange(len(Zs)))
    k0=int(np.floor(k)); k1=min(k0+1,len(Zs)-1); f=k-k0
    c=(1-f)*Ctab[k0]+f*Ctab[k1]; d=p[:2]-c; ph=np.arctan2(d[1],d[0])
    j=(ph+np.pi)/(2*np.pi)*NPH; j0=int(np.floor(j))%NPH; j1=(j0+1)%NPH; g=j-np.floor(j)
    r=(1-f)*((1-g)*Rtab[k0,j0]+g*Rtab[k0,j1])+f*((1-g)*Rtab[k1,j0]+g*Rtab[k1,j1])
    e=ease*(0.55+0.45*abs(np.sin(ph)))+0.004
    return np.array([c[0]+(r+e)*np.cos(ph), c[1]+(r+e)*np.sin(ph), p[2]])
for i in range(len(V)):
    if armV[i]: continue
    w=np.clip((1.335-V[i,2])/0.085,0,1); w=w*w*(3-2*w)
    if w<=0: continue
    ht=hull_target(V[i],CFG["EASE_TORSO"])
    T[i]=(1-w)*T[i]+w*ht

def _dbg(tag,VV):
    m=(VV[:,2]>0.97)&(VV[:,2]<1.12)
    dev=np.array([np.linalg.norm(VV[i]-hull_target(VV[i],CFG["EASE_TORSO"])) for i in np.where(m)[0]])
    sdv=np.array([signed_dist(bvh,VV[i])[0] for i in np.where(m)[0]])
    print("DBG",tag,"waist n",m.sum(),"hull dev max %.4f n>5mm %d  body sd min %.4f"%(dev.max(),(dev>0.005).sum(),sdv.min()))
_dbg('after targets',T)
zt=0.985; bs=P[(np.abs(P[:,2]-zt)<0.004)&(wA<0.25)&(np.abs(P[:,0])<0.3)]
worst=[]
for p in bs:
    ht=hull_target(p,0.0); c_=ht[:2]
    worst.append((np.hypot(*(p[:2]-Ctab[int(round((zt-0.80)/0.01))]))-np.hypot(*(ht[:2]-Ctab[int(round((zt-0.80)/0.01))])),*np.round(p,3)))
worst.sort(reverse=True); print("DBG body beyond hull (m):",[tuple(np.round(w,3)) for w in worst[:5]])
k=int(round((zt-0.80)/0.01)); print("DBG Zs[k]",Zs[k],"centre",Ctab[k],"R range",Rtab[k].min(),Rtab[k].max())
# ---- hem: snap loop to SEL_Z, extrude rings down to HEM_Z
hem=LP["hem"]; Vl=list(map(tuple,T)); Fl=list(F)
nr=5; zs=np.linspace(CFG["SEL_Z"],CFG["HEM_Z"],nr+1)
rings=[hem]
z0=np.array([Vl[v][2] for v in hem])
for v in hem: Vl[v]=tuple(hull_target(np.array(Vl[v]),CFG["EASE_TORSO"]))
for k in range(1,nr+1):
    f=k/nr; ids=[]
    for a,v in enumerate(hem):
        p=np.array(Vl[v]); kk=np.interp(p[2],Zs,np.arange(len(Zs))); cc=Ctab[int(round(kk))]
        phh=np.arctan2(p[1]-cc[1],p[0]-cc[0]); hz=CFG["HEM_Z"]+CFG["HEM_SIDE_LIFT"]*abs(np.cos(phh))**2
        p[2]=(1-f)*z0[a]+f*hz; Vl.append(tuple(hull_target(p,CFG["EASE_TORSO"]+0.002*k))); ids.append(len(Vl)-1)
    rings.append(ids)
a_,b_=hem[0],hem[1]
same=any(f[k]==a_ and f[(k+1)%len(f)]==b_ for f in F for k in range(len(f)))
for k in range(nr):
    A,B=rings[k],rings[k+1]
    for i in range(len(A)):
        j=(i+1)%len(A); q=(A[i],A[j],B[j],B[i]); Fl.append(q[::-1] if same else q)
print("skirt winding reversed" if same else "skirt winding as-is")
V=np.array(Vl); F=Fl
LP["hem"]=rings[-1]
_dbg('after skirt',V)
# ---- snap rims to clean curves
for s_,key in (("L","sleeveL"),("R","sleeveR")):
    h,dv,L=AX[s_]; c=h+dv*L*CFG["T_END"]
    for v in LP[key]:
        q=V[v]-c; rad=q-(q@dv)*dv; V[v]=c+rad/np.linalg.norm(rad)*CFG["R_SLEEVE"]
nr_=LP["neck"]; Q=V[nr_]
phq=np.arctan2((Q[:,1]-CFG["NECK_YC"]),Q[:,0])
A=np.column_stack([np.ones(len(Q))]+[f(k*phq) for k in (1,2,3) for f in (np.cos,np.sin)])
coef,*_=np.linalg.lstsq(A,Q,rcond=None)
# resample rim at even arc length along the fitted curve, keeping loop order and direction
tt=np.linspace(0,2*np.pi,2000,endpoint=False)
def curve(ph): 
    B=np.column_stack([np.ones(len(ph))]+[f(k*ph) for k in (1,2,3) for f in (np.cos,np.sin)]); return B@coef
C=curve(tt); seg=np.linalg.norm(np.roll(C,-1,0)-C,axis=1); cum=np.r_[0,np.cumsum(seg)][:-1]; tot=seg.sum()
ph0=np.unwrap(phq); sgn=1 if ph0[-1]>ph0[0] else -1
s0=np.interp(np.mod(phq[0],2*np.pi),tt,cum)
targets=np.mod(s0+sgn*np.arange(len(nr_))*tot/len(nr_),tot)
cum2=np.r_[cum,tot]; C2=np.vstack([C,C[:1]])
V[nr_]=np.array([np.interp(t_,cum2,C2[:,k]) for k in range(3) for t_ in targets]).reshape(3,-1).T
# never let the neckline sit below the body under it (trapezius ridges at the back corners)
from scipy.spatial import cKDTree as _KD
_kd=_KD(P[:,:2]); req=np.zeros(len(nr_))
for a_,v in enumerate(nr_):
    ids=_kd.query_ball_point(V[v,:2],0.012); req[a_]=(P[ids,2].max() if ids else V[v,2])+0.003
req=gaussian_filter1d(req,5,mode='wrap')
zr=np.maximum(V[nr_,2],req)
for _ in range(40):
    zr=np.maximum(0.5*zr+0.25*(np.roll(zr,1)+np.roll(zr,-1)),req)
print("neckline raised: max %.4f m, verts %d"%((zr-V[nr_,2]).max(),int(((zr-V[nr_,2])>0.002).sum())))
V[nr_,2]=zr
for v in nr_:
    sd,loc,n=signed_dist(bvh,V[v])
    if sd<0.004: V[v]=V[v]+n*(0.004-sd)
rimset=set(int(v) for k in LP for v in LP[k])
nb=neighbors_from_faces(F,len(V))
dist={v:0 for v in rimset}; front=list(rimset)
for d_ in range(1,5):
    nf=[]
    for v in front:
        for u in nb[v]:
            if int(u) not in dist: dist[int(u)]=d_; nf.append(int(u))
    front=nf
band=[v for v,d_ in dist.items() if d_>0]
for it in range(40):
    Nv=vertex_normals(V,F); Y=V.copy()
    for i in band:
        dl=V[nb[i]].mean(0)-V[i]; dl-=Nv[i]*(dl@Nv[i]); Y[i]=V[i]+dl
    V=Y
print("rim band verts",len(band)); _dbg("after band",V)
# ---- smooth (keep rim shape) a few passes, then gentle collision
nb=neighbors_from_faces(F,len(V))
# membrane relax: upper body and sleeves bridge muscle grooves (full Laplacian + collision floor)
armVv=np.r_[armV,np.zeros(len(V)-len(armV),bool)] if len(armV)<len(V) else armV
tAv=np.r_[tA,np.zeros(len(V)-len(tA))] if len(tA)<len(V) else tA
upper=np.array([((V[i,2]>1.16 and not armVv[i]) or (armVv[i] and tAv[i]<0.38)) and i not in rimset for i in range(len(V))])
floor_=np.where(upper,CFG["MEMBRANE_FLOOR"],0.005)
for it in range(CFG["MEMBRANE_ITERS"]):
    Y=V.copy(); Nv=vertex_normals(V,F)
    for i in range(len(V)):
        if i in rimset: continue
        dl=V[nb[i]].mean(0)-V[i]
        if not upper[i]: dl-=0.8*Nv[i]*(dl@Nv[i])
        Y[i]=V[i]+0.5*dl
    V=Y
    for i in range(len(V)):
        if i in rimset: continue
        sd,loc,n=signed_dist(bvh,V[i])
        if sd<floor_[i]: V[i]=V[i]+n*(floor_[i]-sd)
def face_normals(V,F):
    out=[]
    for f in F:
        p=V[list(f)]; n=np.cross(p[1]-p[0],p[2]-p[0])
        if len(f)==4: n=n+np.cross(p[2]-p[0],p[3]-p[0])
        out.append(n/(np.linalg.norm(n)+1e-15))
    return np.array(out)
for rnd in range(6):
    FN=face_normals(V,F); VN=vertex_normals(V,F)
    badv=set()
    for k,f in enumerate(F):
        if np.mean([FN[k]@VN[v] for v in f])<0.3: badv.update(f)
    if not badv: break
    grow=set(badv)
    for v in badv: grow.update(int(u) for u in nb[v])
    grow-=set(LP["neck"])|set(LP["sleeveL"])|set(LP["sleeveR"])|set(LP["hem"])
    for it in range(15):
        for i in grow: V[i]=V[nb[i]].mean(0)
    print("untangle round",rnd,"bad verts",len(badv))
_dbg("final",V)
sd=np.array([signed_dist(bvh,x)[0] for x in V]); print("signed dist min %.4f max %.4f"%(sd.min(),sd.max()))
np.savez("/home/claude/work/tee_v2.npz",sideV=sideV,armV2=armV,V=V,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),
         **{k:np.array(v) for k,v in LP.items()},vid=vid,armV=np.r_[armV,np.zeros(len(V)-len(armV),bool)])
print("verts",len(V),"faces",len(F))
