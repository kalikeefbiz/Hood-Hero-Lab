"""Court sneaker (left), mirrored to right. A-pose (idle legs). Parts: upper, collar, sole, tongue, laces."""
import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
from lscut import *
from scipy.spatial import ConvexHull, Delaunay
from scipy.ndimage import gaussian_filter1d
from matplotlib.path import Path as MPath
bp=BodyPrep(); P=bp.Pw
rid=np.load("/home/claude/work/apose.npz")["rid"][bp.first]
AX=np.array([0.106,0.030]); SOLE_TOP_H=0.036; SOLE_TOP_T=0.027
def sstep(a,b,t): u=np.clip((t-a)/(b-a),0,1); return u*u*(3-2*u)
def toe_spring(y): return 0.013*sstep(-0.13,-0.195,y)
def sole_top(y): return np.interp(y,[-0.2,-0.08,0.05,0.12],[SOLE_TOP_T,SOLE_TOP_T+0.002,SOLE_TOP_H,SOLE_TOP_H])+toe_spring(y)
# ---------- A. foot+ankle piece of the body (left)
V=P.copy(); F=[tuple(f) for f in bp.faces]; attrs=dict(rid=rid.astype(float))
def cut(g):
    global V,F,attrs
    V2,F2,ip,_=levelset_cut(V,F,g); attrs={k:interp_attr(a,ip) for k,a in attrs.items()}
    V,F,used=compact(V2,F2); attrs={k:a[used] for k,a in attrs.items()}
cut(V[:,2]-0.135); cut(0.02-V[:,0])
from collections import defaultdict
def largest(V,F):
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
    return [f for f in F if f[0] in best]
F=largest(V,F); V,F,used=compact(V,F)
foot=V.copy(); bvhF=make_bvh(foot,F)
_h=ConvexHull(foot); _cc=foot[_h.vertices].mean(0); _tris=[]
for t in _h.simplices:
    p=foot[t]; nn=np.cross(p[1]-p[0],p[2]-p[0])
    _tris.append(tuple(t) if nn@(p.mean(0)-_cc)>0 else tuple(t[::-1]))
bvhHull=make_bvh(foot,_tris)
def subdivide(V,F):
    V=list(map(np.array,V)); em={}; F2=[]
    def mid(a,b):
        k=(a,b) if a<b else (b,a)
        if k not in em: V.append((V[a]+V[b])/2); em[k]=len(V)-1
        return em[k]
    for a,b,c in F:
        ab,bc,ca=mid(a,b),mid(b,c),mid(c,a); F2+= [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]
    return np.array(V),F2
for _ in range(1): V,F=subdivide(V,F)
# project subdivided points back to the foot surface
V=np.array([np.array(bvhF.find_nearest(Vector(p))[0]) for p in V])
print("foot piece verts",len(V),"faces",len(F))
# ---------- B. last: offset + membrane (bridges toes, smooths anatomy)
N=vertex_normals(V,F); V=V+N*0.006
nb=neighbors_from_faces(F,len(V)); loops,_=boundary_loops(F); top=set(v for l in loops for v in l)
for it in range(110):
    Y=V.copy()
    for i in range(len(V)):
        if i in top: continue
        Y[i]=V[i]+0.5*(V[nb[i]].mean(0)-V[i])
    V=Y
    for i in range(len(V)):
        loc,n,_,dd=bvhHull.find_nearest(Vector(V[i])); n=np.array(n); loc=np.array(loc)
        sd=dd if (V[i]-loc)@n>=0 else -dd
        fl=0.0045+0.008*sstep(-0.09,-0.17,V[i,1])+0.004*sstep(0.03,0.06,V[i,2])          # roomier toe box and instep
        if sd<fl: V[i]=V[i]+n*(fl-sd)
# toe box: rounder top
for i in range(len(V)):
    if V[i,1]<-0.09 and V[i,2]>0.02: V[i,2]+=0.016*sstep(-0.06,-0.13,V[i,1])*sstep(0.025,0.055,V[i,2])*(1-0.5*sstep(-0.17,-0.20,V[i,1]))
# ---------- C. cuts: below the sole top, above the collar
zc=lambda ph: np.interp(np.degrees(ph),[-180,-120,-90,-60,0,60,90,120,180],[0.090,0.086,0.084,0.088,0.100,0.088,0.084,0.086,0.090])
def phi(Q): return np.arctan2(Q[:,1]-AX[1],Q[:,0]-AX[0]-0.0)   # 0 deg = +x(lateral)?? recomputed below
def ang(Q):  # 0 = toward the heel (+y), +-180 = toward the toe
    return np.arctan2(Q[:,0]-AX[0],Q[:,1]-AX[1])
attrs={}
cut(sole_top(V[:,1])-0.003-V[:,2])
gcol=V[:,2]-zc(ang(V))
gcol=np.where(np.hypot(V[:,0]-AX[0],V[:,1]-AX[1])<0.075,gcol,-1)   # only the ankle opening
cut(gcol)
F=largest(V,F); V,F,used=compact(V,F)
loops,nm=boundary_loops(F)
for l in sorted(loops,key=len)[:-2]:
    cyc=order_loop(l,F); c=len(V); V=np.vstack([V,V[cyc].mean(0)])
    a_,b_=cyc[0],cyc[1]; same=any(f[k]==a_ and f[(k+1)%3]==b_ for f in F for k in range(3))
    for k in range(len(cyc)):
        p_,q_=cyc[k],cyc[(k+1)%len(cyc)]; F.append((q_,p_,c) if same else (p_,q_,c))
loops,nm=boundary_loops(F)
print("upper verts",len(V),"loops",[len(l) for l in loops],"nm",nm)
LP={}
for l in loops:
    c=V[l].mean(0); LP["collar" if c[2]>0.05 else "base"]=order_loop(l,F)
# smooth collar rim
cl=LP["collar"]
for _ in range(15): V[cl]=0.5*V[cl]+0.25*(np.roll(V[cl],1,0)+np.roll(V[cl],-1,0))
Vl=list(map(np.array,V)); Fl=list(F); parts=["upper"]*len(F)
def winding_same(a,b): return any(f[k]==a and f[(k+1)%len(f)]==b for f in F for k in range(len(f)))
def add_band(loop,rings_pos,part):
    rings=[loop]
    for R in rings_pos:
        ids=[]
        for p in R: Vl.append(np.array(p)); ids.append(len(Vl)-1)
        rings.append(ids)
    rev=winding_same(loop[0],loop[1])
    for k in range(len(rings)-1):
        A,B=rings[k],rings[k+1]
        for i in range(len(A)):
            j=(i+1)%len(A); q=(A[i],A[j],B[j],B[i]); Fl.append(q[::-1] if rev else q); parts.append(part)
    return rings
# ---------- D. padded collar roll
R0=V[cl]; c=np.array([AX[0],AX[1],0]); rad=R0-c; rad[:,2]=0; rad/=np.linalg.norm(rad,axis=1)[:,None]; up=np.array([0,0,1.0])
collar=add_band(cl,[R0+up*0.003-rad*0.002,R0+up*0.004-rad*0.007,R0+up*0.001-rad*0.011,R0-up*0.018-rad*0.010],"collar")
# ---------- E. sole (outline computed first so the upper can meet it)
pts=foot[foot[:,2]<0.014][:,:2]; hull=pts[ConvexHull(pts).vertices]
# resample hull outline and offset outward
seg=np.linalg.norm(np.diff(np.vstack([hull,hull[:1]]),axis=0),axis=1); Lc=np.r_[0,np.cumsum(seg)]
t=np.linspace(0,Lc[-1],140,endpoint=False); H2=np.vstack([hull,hull[:1]])
O=np.stack([np.interp(t,Lc,H2[:,0]),np.interp(t,Lc,H2[:,1])],1)
for _ in range(40): O=0.5*O+0.25*(np.roll(O,1,0)+np.roll(O,-1,0))
# round the toe: blend the front third toward an ellipse
cy=O[:,1]; c0=O.mean(0); a_=(O[:,0].max()-O[:,0].min())/2; b_=(cy.max()-cy.min())/2
ang_=np.arctan2((O[:,1]-c0[1])/b_,(O[:,0]-c0[0])/a_); E=np.stack([c0[0]+a_*np.cos(ang_),c0[1]+b_*np.sin(ang_)],1)
wt=sstep(-0.09,-0.17,O[:,1])*0.6; O=O*(1-wt[:,None])+E*wt[:,None]
cen=O.mean(0); nrm=np.stack([np.roll(O,-1,0)[:,1]-np.roll(O,1,0)[:,1],-(np.roll(O,-1,0)[:,0]-np.roll(O,1,0)[:,0])],1); nrm/=np.linalg.norm(nrm,axis=1)[:,None]
if np.mean(np.sum(nrm*(O-cen),1))<0: nrm=-nrm
O=O+nrm*0.011
# the upper's lower part must meet the sole's inner wall (no gap seen from above)
inner_wall=O-nrm*0.004; wall_path=MPath(inner_wall)
from scipy.spatial import cKDTree as _KD
kdw=_KD(inner_wall)
for i in range(len(Vl)):
    if i>=len(V) or parts and False: break
for i in range(len(V)):
    z=Vl[i][2]; w=1-sstep(sole_top(Vl[i][1]),sole_top(Vl[i][1])+0.020,z)
    if w<=0: continue
    xy=Vl[i][:2]; dd,k=kdw.query(xy)
    tgt=inner_wall[k]
    if wall_path.contains_point(xy): Vl[i][:2]=xy+(tgt-xy)*w
    else: Vl[i][:2]=xy+(tgt-xy)*min(1.0,w*1.5)
base=LP["base"]
ys=O[:,1]
def ring(off,dz_fun):
    Q=O+nrm*off; return np.c_[Q,dz_fun(Q[:,1])]
s_b=lambda y: toe_spring(y)
ringsS=[ring(-0.002,lambda y:s_b(y)), ring(0.0,lambda y:s_b(y)+0.004), ring(0.0005,lambda y:s_b(y)+0.012), ring(-0.0012,lambda y:s_b(y)+0.0150),
        ring(0.0005,lambda y:s_b(y)+0.0185), ring(0.0005,lambda y:sole_top(y)-0.002), ring(-0.001,lambda y:sole_top(y)), ring(-0.006,lambda y:sole_top(y)+0.0005)]
soleV=[]; soleR=[]
for R in ringsS:
    ids=[]
    for p in R: Vl.append(p); ids.append(len(Vl)-1)
    soleR.append(ids)
n=len(O)
# outward-facing winding check using ring 0->1
for k in range(len(soleR)-1):
    A,B=soleR[k],soleR[k+1]
    for i in range(n):
        j=(i+1)%n; q=[A[i],A[j],B[j],B[i]]
        p_=np.array([Vl[v] for v in q]); nn=np.cross(p_[1]-p_[0],p_[3]-p_[0]); out=(p_.mean(0)[:2]-cen)
        if np.dot(nn[:2],out)<0 and k<6: q=q[::-1]
        Fl.append(tuple(q)); parts.append("sole")
# bottom cap with interior points for tread resolution
inner=O-nrm*0.002; grid=np.mgrid[O[:,0].min():O[:,0].max():0.007,O[:,1].min():O[:,1].max():0.007].reshape(2,-1).T
grid=grid[MPath(inner).contains_points(grid)]
gi=[]
for g in grid: Vl.append(np.array([g[0],g[1],toe_spring(g[1])])); gi.append(len(Vl)-1)
allp=np.vstack([inner,grid]); ids=soleR[0]+gi
tri=Delaunay(allp)
for s_ in tri.simplices:
    c2=allp[s_].mean(0)
    if not MPath(inner).contains_point(c2): continue
    q=[ids[k] for k in s_]; p_=np.array([Vl[v] for v in q]); nn=np.cross(p_[1]-p_[0],p_[2]-p_[0])
    if nn[2]>0: q=q[::-1]
    Fl.append(tuple(q)); parts.append("tread")
# top cap (insole, hidden but closes the cupsole)
top_in=soleR[-1]; cidx=len(Vl); Vl.append(np.array([cen[0],cen[1],np.mean([Vl[v][2] for v in top_in])]))
for i in range(n):
    q=(top_in[i],top_in[(i+1)%n],cidx); p_=np.array([Vl[v] for v in q]); nn=np.cross(p_[1]-p_[0],p_[2]-p_[0])
    Fl.append(q if nn[2]>0 else q[::-1]); parts.append("insole")
V=np.array(Vl); F=Fl
# ---------- F. tongue: grid draped on the instep, rising above the collar front
bvhU=make_bvh(V[:len(foot)] if False else V,[f for f,p in zip(F,parts) if p=="upper"])
def drape(x,y,zstart=0.2):
    h=bvhU.ray_cast(Vector((x,y,zstart)),Vector((0,0,-1)))
    if h[0] is not None: return np.array(h[0]),np.array(h[1])
    loc,nn,_,_=bvhU.find_nearest(Vector((x,y,0.08))); return np.array(loc),np.array(nn)
xm=lambda y: AX[0]+0.010*sstep(0.0,-0.12,y)                  # tongue centre line drifts slightly lateral toward the toe
ysT=np.linspace(-0.095,0.0,18); usT=np.linspace(-1,1,9); TW=0.030
TG=np.zeros((len(ysT),len(usT),3)); TN=np.zeros_like(TG)
for a,y in enumerate(ysT):
    for b,u in enumerate(usT):
        p,nn=drape(xm(y)+u*TW*(1-0.25*abs(u)),y)
        if p is None: p,nn=TG[a-1,b]+np.array([0,0.005,0.004]),TN[a-1,b]
        TG[a,b]=p+nn*0.0050; TN[a,b]=nn
# raise the top end above the collar front and tilt forward
cf_z=zc(np.array([np.pi]))[0]+0.0
for a,y in enumerate(ysT):
    lift=0.004*sstep(-0.03,-0.0,y); TG[a,:,2]+=lift
tong={}
def grid_faces(G,part,flip=False):
    parts=parts_
    base_=len(Vl2); ids=np.zeros(G.shape[:2],int)
    for a in range(G.shape[0]):
        for b in range(G.shape[1]): Vl2.append(G[a,b]); ids[a,b]=len(Vl2)-1
    for a in range(G.shape[0]-1):
        for b in range(G.shape[1]-1):
            q=(ids[a,b],ids[a,b+1],ids[a+1,b+1],ids[a+1,b]); F2.append(q[::-1] if flip else q); parts.append(part)
    return ids
Vl2=list(V); F2=list(F); parts_=parts
tid=grid_faces(TG,"tongue")
# orient tongue faces upward
q=F2[-1]; p_=np.array([Vl2[v] for v in q]); nn=np.cross(p_[1]-p_[0],p_[3]-p_[0])
if nn[2]<0:
    k0=len(F2)-(len(ysT)-1)*(len(usT)-1)
    for k in range(k0,len(F2)): F2[k]=F2[k][::-1]
# tongue thickness: underside layer + side walls
TB=TG-TN*0.003; bid=grid_faces(TB,"tongue",flip=True)
q=F2[-1]; p_=np.array([Vl2[v] for v in q]); nn=np.cross(p_[1]-p_[0],p_[3]-p_[0])
if nn[2]>0:
    k0=len(F2)-(len(ysT)-1)*(len(usT)-1)
    for k in range(k0,len(F2)): F2[k]=F2[k][::-1]
for a in range(len(ysT)-1):
    for b in (0,len(usT)-1):
        q=(tid[a,b],tid[a+1,b],bid[a+1,b],bid[a,b]); F2.append(q if b==0 else q[::-1]); parts.append("tongue")
for b in range(len(usT)-1):
    a=len(ysT)-1; q=(tid[a,b],tid[a,b+1],bid[a,b+1],bid[a,b]); F2.append(q[::-1]); parts.append("tongue")
# ---------- G. laces: criss-cross flat strips between eyelets, plus a simple bow
EY=[]
for k,y in enumerate(np.linspace(-0.088,-0.022,6)):
    row=[]
    for s_ in (-1,1):
        x=xm(y)+s_*(TW+0.006); p,nn=drape(x,y)
        row.append((p+nn*0.0030,nn))
    EY.append(row)
for k in range(2,len(EY)):   # a ray that misses the upper at the throat lands on the insole: extrapolate that eyelet from the row below
    for j in (0,1):
        if EY[k][j][0][2]<EY[k-1][j][0][2]-0.015:
            EY[k][j]=(2*EY[k-1][j][0]-EY[k-2][j][0],EY[k-1][j][1]); print("eyelet fixed",k,j,EY[k][j][0].round(3))
# laces conform to the tongue/upper (BVH of everything built so far) and are rounded 6-sided tubes,
# so straight chords never sink into the curved tongue and leave floating fragments
_bv=BVHTree.FromPolygons([Vector(v) for v in Vl2],[tuple(f) for f in F2])
def strip(p0,p1,n0,n1,tag='',lift=0.0030,w=0.0062,th=0.0024,segs=8,part="laces",conform=True):
    d=p1-p0; L_=np.linalg.norm(d); d/=L_
    rows=[]; NS=6
    for k in range(segs+1):
        t=k/segs; nn=(1-t)*n0+t*n1; nn/=np.linalg.norm(nn); p=p0+(p1-p0)*t
        if conform and 0<k<segs:
            loc,sn,_,_=_bv.find_nearest(Vector(p))
            if loc is not None:
                sn=np.array(sn); sn=sn if sn@nn>0 else -sn; nn=sn; p=np.array(loc)
        p=p+nn*(lift*np.sin(np.pi*t)+th*0.5+0.0006)
        side=np.cross(nn,d); side/=np.linalg.norm(side)
        ring=[p+side*np.cos(2*np.pi*j/NS)*w/2+nn*np.sin(2*np.pi*j/NS)*th/2 for j in range(NS)]
        rows.append((ring,nn,p))
    ids=[]
    for r,_,_ in rows:
        ii=[]
        for pnt in r: Vl2.append(pnt); ii.append(len(Vl2)-1)
        ids.append(ii)
    for k in range(segs):
        A,B=ids[k],ids[k+1]; c=rows[k][2]
        for e in range(NS):
            q=[A[e],A[(e+1)%NS],B[(e+1)%NS],B[e]]; pq=np.array([Vl2[v] for v in q]); fn=np.cross(pq[1]-pq[0],pq[3]-pq[0])
            if fn@(pq.mean(0)-c)<0: q=q[::-1]
            F2.append(tuple(q)); parts_.append(part)
    for k,cap in ((0,True),(segs,False)):   # end caps
        c=rows[k][2]; Vl2.append(c); ci=len(Vl2)-1; A=ids[k]
        for e in range(NS):
            q=[A[e],A[(e+1)%NS],ci]; pq=np.array([Vl2[v] for v in q]); fn=np.cross(pq[1]-pq[0],pq[2]-pq[0])
            if fn@(d if not cap else -d)<0: q=q[::-1]
            F2.append(tuple(q)); parts_.append(part)
for k in range(len(EY)-1):
    (pl0,nl0),(pr0,nr0)=EY[k]; (pl1,nl1),(pr1,nr1)=EY[k+1]
    strip(pl0,pr1,nl0,nr1,lift=0.0004); strip(pr0,pl1,nr0,nl1,lift=0.0030)
(plt,nlt),(prt,nrt)=EY[-1]
nk=(nlt+nrt)/2; nk/=np.linalg.norm(nk); knot=(plt+prt)/2+nk*0.004

strip(plt,knot,nlt,nk,lift=0.001,segs=3,conform=False); strip(prt,knot,nrt,nk,lift=0.001,segs=3,conform=False)
for s_ in (-1,1):   # a small flat bow lying on the tongue, and the lace ends
    a1=knot+np.array([s_*0.022,-0.012,0.0])+nk*0.002; strip(knot,a1,nk,nk,lift=0.004,segs=6,conform=False); strip(a1,knot,nk,nk,lift=0.002,segs=6,conform=False)
    e1=knot+np.array([s_*0.010,-0.030,0.0]); loc,nn_,_,_=_bv.find_nearest(Vector(e1));   # lace ends lie on the tongue (bvhU could snap them to the side wall)
    e1=np.array(loc)+np.array(nn_)*0.007; strip(knot,e1,nk,np.array(nn_),lift=0.002,segs=6,conform=False)
V=np.array(Vl2); F=F2; parts=np.array(parts_)
sd=np.array([signed_dist(bvhF,x)[0] for x in V]); print("foot clearance: min %.4f  verts inside foot %d (sole/insole expected)"%(sd.min(),(sd<0).sum()))
from collections import Counter; print(Counter(parts.tolist()))
# un-fold fins on the upper/collar (faces flipped against a neighbour read as white spikes at the sole line):
# Laplacian-relax the vertices of any folded edge until no fold remains
import collections as _co
def _unfold(V,F,parts,iters=60):
    V=np.array(V,float); ok=np.array([str(p) in ("upper","collar") for p in parts])
    nb=_co.defaultdict(set); ef=_co.defaultdict(list)
    for i,f in enumerate(F):
        for a in range(len(f)):
            u,w=f[a],f[(a+1)%len(f)]; nb[u].add(w); nb[w].add(u); ef[(min(u,w),max(u,w))].append(i)
    for it in range(iters):
        P_=V[[f[0] for f in F]]; N=np.array([np.cross(V[f[1]]-V[f[0]],V[f[-1]]-V[f[0]]) for f in F]); N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-12)
        bad=set()
        for e,fs in ef.items():
            if len(fs)==2 and ok[fs[0]] and ok[fs[1]] and N[fs[0]]@N[fs[1]]<-0.3 and V[F[fs[0]][0],2]<0.055:
                for fi in fs: bad.update(F[fi])
        if not bad: print("unfold clean after",it); break
        grow=set(bad)
        for v in bad: grow|=nb[v]
        for v in grow: V[v]=0.5*V[v]+0.5*np.mean([V[u] for u in nb[v]],axis=0)
    else: print("unfold: still",len(bad),"verts")
    return V
# V=_unfold(V,F,parts)   # disabled: created new slivers; the side fleck was a weighting issue
np.savez("/home/claude/work/shoeL_v1.npz",V=V,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),parts=parts,collar=np.array(collar,dtype=object),
         sole=np.array(soleR,dtype=object),eyelets=np.array([[r[0][0],r[1][0]] for r in EY]),allow_pickle=True)
print("verts",len(V),"faces",len(F))
