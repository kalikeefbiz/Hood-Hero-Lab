"""Jeans shell: exact level-set cuts (waist, leg hems), leg tubes around the leg-bone axis (straight fit),
pelvis hull for seat/waist, crotch bridged by membrane relaxation. Output: jeans_v2.npz (A pose)."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from lscut import *
from scipy.spatial import ConvexHull
from scipy.ndimage import gaussian_filter1d
bp=BodyPrep(); P=bp.Pw
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
CFG=dict(WAIST_F=0.968, WAIST_B=1.000, HEM_Z=0.072, HEM_F=0.098, HEM_B=0.052, CROTCH=0.842, R_HEM=0.068)
def axis_pts(s):
    pb=bp.arm.pose.bones
    return np.array([pb[f"thigh.{s}"].head, pb[f"shin.{s}"].head, pb[f"foot.{s}"].head])
AXP={s:axis_pts(s) for s in "LR"}
AXP={s:np.vstack([a[0]+np.array([0,0,0.06]),a[1:]]) for s,a in AXP.items()}   # extend above the hip joint
def leg_coords(p,s):
    A=AXP[s]; best=None
    seglen=np.linalg.norm(np.diff(A,axis=0),axis=1); cum=np.r_[0,np.cumsum(seglen)]
    for k in range(len(A)-1):
        d=A[k+1]-A[k]; L=seglen[k]; u=np.clip((p-A[k])@d/L**2,0,1); q=A[k]+u*d; dist=np.linalg.norm(p-q)
        if best is None or dist<best[0]: best=(dist,(cum[k]+u*L)/cum[-1],q,d/L)
    return best   # radial dist, t (0 hip..1 ankle), axis point, axis dir
# ---------- cuts
V=P.copy(); F=[tuple(f) for f in bp.faces]; attrs=dict(rid=rid.astype(float))
def cut(g):
    global V,F,attrs
    V2,F2,ip,_=levelset_cut(V,F,g); attrs={k:interp_attr(a,ip) for k,a in attrs.items()}
    V,F,used=compact(V2,F2); attrs={k:a[used] for k,a in attrs.items()}
zw=lambda y: np.interp(y,[-0.10,0.12],[CFG["WAIST_F"],CFG["WAIST_B"]])
cut(V[:,2]-zw(V[:,1]))
zh=lambda y: np.interp(y,[-0.03,0.09],[CFG["HEM_F"],CFG["HEM_B"]])
cut(zh(V[:,1])-V[:,2])
from collections import defaultdict
adj=defaultdict(set)
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
# drop duplicate faces
_seen=set(); _F=[]
for f in F:
    k=tuple(sorted(f))
    if k not in _seen: _seen.add(k); _F.append(f)
print('duplicate faces removed',len(F)-len(_F)); F=_F
# remove boundary ear triangles
for _ in range(5):
    ec=defaultdict(int)
    for f in F:
        for k in range(3): ec[tuple(sorted((f[k],f[(k+1)%3])))]+=1
    ears=[i for i,f in enumerate(F) if sum(ec[tuple(sorted((f[k],f[(k+1)%3])))]==1 for k in range(3))>=2]
    if not ears: break
    es=set(ears); F=[f for i,f in enumerate(F) if i not in es]; V,F,used=compact(V,F); attrs={k:a[used] for k,a in attrs.items()}
loops,nm=boundary_loops(F)
for l in [l for l in loops if len(l)<20]:
    cyc=order_loop(l,F); c=len(V); V=np.vstack([V,V[cyc].mean(0)]); attrs={k:np.r_[a,a[cyc].mean(0)] for k,a in attrs.items()}
    a_,b_=cyc[0],cyc[1]; same=any(f[k]==a_ and f[(k+1)%3]==b_ for f in F for k in range(3))
    for k in range(len(cyc)):
        p_,q_=cyc[k],cyc[(k+1)%len(cyc)]; F.append((q_,p_,c) if same else (p_,q_,c))
loops,nm=boundary_loops(F)
print("cut mesh verts",len(V),"faces",len(F),"loops",[len(l) for l in loops],"nm",nm)
LP={}
for l in loops:
    c=V[l].mean(0); LP["waist" if c[2]>0.5 else ("hemL" if c[0]>0 else "hemR")]=order_loop(l,F)
assert set(LP)=={"waist","hemL","hemR"}, LP.keys()
# ---------- leg tube tables (t, phi) from body cross-sections perpendicular to the leg axis
NT=60; NPH=96; ts=np.linspace(0,1,NT); phis=np.linspace(-np.pi,np.pi,NPH,endpoint=False)
legtab={}
for s in "LR":
    side=(P[:,0]>0) if s=="L" else (P[:,0]<0)
    pts=P[side&np.isin(rid,[5,6])&(P[:,2]<CFG["CROTCH"]+0.05)&(P[:,2]>0.11)]
    LC=[leg_coords(p,s) for p in pts]
    tt=np.array([c[1] for c in LC]); Q=np.array([c[2] for c in LC]); D=np.array([c[3] for c in LC])
    front=np.array([0,-1.0,0])
    R=np.zeros((NT,NPH))
    for k,t0 in enumerate(ts):
        m=(np.abs(tt-t0)<0.008)&(np.array([c[0] for c in LC])<0.14)
        if m.sum()<6: R[k]=np.nan; continue
        d=D[m].mean(0); e1=front-d*(front@d); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
        rel=pts[m]-Q[m]; xy=np.stack([rel@e1,rel@e2],1)
        hull=ConvexHull(xy); poly=xy[hull.vertices]
        for j,ph in enumerate(phis):
            dd=np.array([np.cos(ph),np.sin(ph)]); b=0
            for a in range(len(poly)):
                p0=poly[a]; e=poly[(a+1)%len(poly)]-p0; M=np.array([dd,-e]).T
                if abs(np.linalg.det(M))<1e-12: continue
                t_,s_=np.linalg.solve(M,p0)
                if t_>0 and 0<=s_<=1: b=max(b,t_)
            R[k,j]=b
    print(s,'body R mean by t',np.round(np.nanmean(R,1)[::6],3)); good=~np.isnan(R[:,0]); R=np.array([np.interp(ts,ts[good],R[good,j]) for j in range(NPH)]).T
    ease=np.interp(ts,[0,0.25,0.52,1.0],[0.010,0.016,0.022,0.028])[:,None]
    Rr=R+ease
    Rround=0.6*Rr+0.4*Rr.mean(1,keepdims=True)           # cloth tube is rounder than the leg
    Rj=np.maximum(Rround,R+0.008)
    knee=np.searchsorted(ts,0.5)
    Rj[knee:]=np.maximum(Rj[knee:],CFG["R_HEM"])            # straight leg: no taper below the knee
    Rj=gaussian_filter1d(gaussian_filter1d(Rj,2,axis=0,mode="nearest"),2,axis=1,mode="wrap")
    Rj=np.maximum(Rj,R+0.006)
    legtab[s]=Rj
    print(s,"leg radius thigh %.3f knee %.3f hem %.3f"%(Rj[3].mean(),Rj[knee].mean(),Rj[-1].mean()))
def leg_target(p,s):
    dist,t,q,d=leg_coords(p,s); front=np.array([0,-1.0,0]); e1=front-d*(front@d); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
    rel=p-q; ph=np.arctan2(rel@e2,rel@e1); r=np.array([np.interp(ph,np.r_[phis,np.pi],np.r_[legtab[s][k],legtab[s][k][0]]) for k in range(NT)])
    rr=np.interp(t,ts,r); dirv=(np.cos(ph)*e1+np.sin(ph)*e2)
    return q+dirv*rr
# ---------- pelvis hull (seat/waist)
Zs=np.arange(CFG["CROTCH"]-0.03,1.02,0.01); PH=np.linspace(-np.pi,np.pi,180,endpoint=False)
bodyT=P[np.isin(rid,[1,5])&(np.abs(P[:,0])<0.26)]
Rp=np.zeros((len(Zs),180)); Cp=np.zeros((len(Zs),2)); polys=[]
for k,z in enumerate(Zs):
    sl=bodyT[np.abs(bodyT[:,2]-z)<0.006][:,:2]; poly=sl[ConvexHull(sl).vertices]; polys.append(poly); Cp[k]=poly.mean(0)
Cp=gaussian_filter1d(Cp,2,axis=0,mode="nearest")
for k in range(len(Zs)):
    poly=polys[k]; c=Cp[k]
    for j,ph in enumerate(PH):
        dd=np.array([np.cos(ph),np.sin(ph)]); b=0
        for a in range(len(poly)):
            p0=poly[a]-c; e=poly[(a+1)%len(poly)]-poly[a]; M=np.array([dd,-e]).T
            if abs(np.linalg.det(M))<1e-12: continue
            t_,s_=np.linalg.solve(M,p0)
            if t_>0 and 0<=s_<=1: b=max(b,t_)
        Rp[k,j]=b
Rp=np.maximum(gaussian_filter1d(gaussian_filter1d(Rp,1.5,axis=0,mode="nearest"),2,axis=1,mode="wrap"),Rp-0.004)
def pelvis_target(p):
    z=np.clip(p[2],Zs[0],Zs[-1]); kk=np.interp(z,Zs,np.arange(len(Zs))); k0=int(kk); k1=min(k0+1,len(Zs)-1); f=kk-k0
    c=(1-f)*Cp[k0]+f*Cp[k1]; d=p[:2]-c; ph=np.arctan2(d[1],d[0])
    r=(1-f)*np.interp(ph,np.r_[PH,np.pi],np.r_[Rp[k0],Rp[k0][0]])+f*np.interp(ph,np.r_[PH,np.pi],np.r_[Rp[k1],Rp[k1][0]])
    ease=np.interp(p[2],[CFG["CROTCH"],0.92,0.99],[0.012,0.010,0.005])
    return np.array([c[0]+(r+ease)*np.cos(ph),c[1]+(r+ease)*np.sin(ph),p[2]])
def leg_sdf(p,s):
    dist,t,q,d=leg_coords(p,s); front=np.array([0,-1.0,0]); e1=front-d*(front@d); e1/=np.linalg.norm(e1); e2=np.cross(d,e1)
    rel=p-q; ph=np.arctan2(rel@e2,rel@e1)
    k=np.interp(t,ts,np.arange(NT)); k0=int(k); k1=min(k0+1,NT-1); f=k-k0
    r=(1-f)*np.interp(ph,np.r_[phis,np.pi],np.r_[legtab[s][k0],legtab[s][k0][0]])+f*np.interp(ph,np.r_[phis,np.pi],np.r_[legtab[s][k1],legtab[s][k1][0]])
    return dist-r
def pelvis_sdf(p):
    tp=pelvis_target(p); c_r=np.hypot(*(tp[:2]-np.array([0,0]))); 
    z=np.clip(p[2],Zs[0],Zs[-1]); kk=np.interp(z,Zs,np.arange(len(Zs))); k0=int(kk); k1=min(k0+1,len(Zs)-1); f=kk-k0
    c=(1-f)*Cp[k0]+f*Cp[k1]; r_t=np.linalg.norm(tp[:2]-c); r_p=np.linalg.norm(p[:2]-c)
    return max(r_p-r_t,(CFG["CROTCH"]-0.005)-p[2])
def smin(a,b,k):
    h=max(k-abs(a-b),0)/k; return min(a,b)-h*h*k*0.25
def garment_sdf(p):
    return smin(smin(leg_sdf(p,"L"),leg_sdf(p,"R"),0.02),pelvis_sdf(p),0.045)
def project(p):
    e=2e-4
    for _ in range(10):
        f=garment_sdf(p)
        if abs(f)<2e-4: break
        g=np.array([(garment_sdf(p+np.eye(3)[i]*e)-garment_sdf(p-np.eye(3)[i]*e))/(2*e) for i in range(3)])
        p=p-f*g/max(g@g,1e-6)
    return p
T=np.array([project(p.copy()) for p in V])
print("projected onto implicit garment surface; max move %.3f"%np.linalg.norm(T-V,axis=1).max())
V=T
# ---------- hem rims: circles perpendicular to the lower leg at HEM_Z; waist rim stays on its cut
for key,s in (("hemL","L"),("hemR","R")):
    L=LP[key]; c=V[L].mean(0); rad=V[L]-c; rad[:,2]=0; rad/=np.linalg.norm(rad,axis=1)[:,None]
    xy=np.c_[c[0]+rad[:,0]*CFG["R_HEM"],c[1]+rad[:,1]*CFG["R_HEM"]]; V[L]=np.c_[xy,zh(xy[:,1])]
rimset=set(v for l in LP.values() for v in l)
# clearance over the sneaker: radial table (z, angle) of the shoe's extent around each ankle; the jeans stay outside it
_sd=np.load("/home/claude/work/shoeL_v1.npz",allow_pickle=True); _SV=_sd["V"]; _SP=_sd["parts"]; _SF=[tuple(int(x) for x in f if x>=0) for f in _sd["F"]]
_sv=sorted(set(v for f,pp in zip(_SF,_SP) if pp in ("upper","collar","tongue","laces","sole") for v in f)); SHOE={1:_SV[_sv]}; SHOE[-1]=SHOE[1]*np.array([-1,1,1])
ZB=np.arange(0.0,0.20,0.005); AB=np.radians(np.arange(-180,180,6))
SHT={}
for sg,pts in SHOE.items():
    c=np.array([sg*0.106,0.030]); rel=pts[:,:2]-c; r=np.linalg.norm(rel,axis=1); keep=r<0.09; pts=pts[keep]; rel=rel[keep]; r=r[keep]; a=np.arctan2(rel[:,1],rel[:,0])
    tab=np.zeros((len(ZB),len(AB)))
    zi=np.clip((pts[:,2]/0.005).astype(int),0,len(ZB)-1); ai=((a+np.pi)/np.radians(6)).astype(int)%len(AB)
    for k in range(len(pts)): tab[zi[k],ai[k]]=max(tab[zi[k],ai[k]],r[k])
    tab=np.maximum.accumulate(tab[::-1],axis=0)[::-1]        # jeans above a height must also clear everything above... keep per-slab max downward
    from scipy.ndimage import maximum_filter, gaussian_filter1d as _g1
    tab=maximum_filter(tab,size=(3,3),mode=("nearest","wrap")); SHT[sg]=(c,tab)
def shoe_clear(p,margin=0.005):
    if p[2]>0.19: return p
    sg=1 if p[0]>0 else -1; c,tab=SHT[sg]; rel=p[:2]-c; r=np.linalg.norm(rel); a=np.arctan2(rel[1],rel[0])
    zi=min(int(max(p[2],0)/0.005),len(ZB)-1); ai=int((a+np.pi)/np.radians(6))%len(AB); need=tab[zi,ai]+margin
    w=1.0 if p[2]<0.15 else (0.19-p[2])/0.04
    if r<need: q=p.copy(); q[:2]=c+rel/r*(r+(need-r)*w); return q
    return p
V=np.array([shoe_clear(p) for p in V])
nb=neighbors_from_faces(F,len(V)); bvh=make_bvh(P,[f for f in bp.faces if not np.all(rid[list(f)]==7)])
crotch=np.array([CFG["CROTCH"]-0.08<p[2]<CFG["CROTCH"]+0.08 for p in V])
for it in range(40):
    Nv=vertex_normals(V,F); Y=V.copy()
    for i in range(len(V)):
        if i in rimset: continue
        dl=V[nb[i]].mean(0)-V[i]
        if not crotch[i]: dl-=0.85*Nv[i]*(dl@Nv[i])
        Y[i]=V[i]+0.5*dl
    V=Y
    for i in range(len(V)):
        if i in rimset: continue
        sd,loc,n=signed_dist(bvh,V[i]); fl=0.005
        if sd<fl: V[i]=V[i]+n*(fl-sd)
        V[i]=shoe_clear(V[i])
V=np.array([shoe_clear(p) for p in V])
for key in ("hemL","hemR"):
    L=LP[key]
    for _ in range(20):
        Q=V[L].copy(); S_=0.5*Q+0.25*(np.roll(Q,1,0)+np.roll(Q,-1,0)); V[L]=np.array([shoe_clear(p) for p in S_])
sd=np.array([signed_dist(bvh,x)[0] for x in V]); print("signed dist min %.4f median %.4f"%(sd.min(),np.median(sd))); bad=np.argsort(sd)[:5]; print("deepest",np.round(V[bad],3).tolist(),[i in rimset for i in bad])
np.savez("/home/claude/work/jeans_v2.npz",V=V,F=np.array([list(f) for f in F]),**{k:np.array(v) for k,v in LP.items()})
print("verts",len(V),"faces",len(F))
