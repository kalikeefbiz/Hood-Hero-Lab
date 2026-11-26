import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw; bvhB=make_bvh(P,bp.faces)
d=np.load("/home/claude/work/tee_v2.npz"); V=d["V"].copy(); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
LP={k:list(map(int,d[k])) for k in ("neck","hem","sleeveL","sleeveR")}
rims=set(v for l in LP.values() for v in l)
# ---- tangential relaxation for even triangles (shape preserved by reprojection)
bvhS=make_bvh(V,F); nb=neighbors_from_faces(F,len(V))
for it in range(12):
    N=vertex_normals(V,F); Y=V.copy()
    for i in range(len(V)):
        if i in rims: continue
        dlt=V[nb[i]].mean(0)-V[i]; dlt-=N[i]*(dlt@N[i]); Y[i]=V[i]+0.6*dlt
    for i in range(len(V)):
        if i in rims: continue
        loc,n,_,_=bvhS.find_nearest(Vector(Y[i])); Y[i]=np.array(loc)
    V=Y
from mathutils import Vector
def winding_same(a,b):
    return any(f[k]==a and f[(k+1)%len(f)]==b for f in F for k in range(len(f)))
Vl=list(map(np.array,V)); Fl=list(F); nshell=len(F); nshell_v=len(V)
def add_band(loop, rings_pos, closed=True):
    rings=[loop]
    for R in rings_pos:
        ids=[]
        for p in R: Vl.append(p); ids.append(len(Vl)-1)
        rings.append(ids)
    rev=winding_same(loop[0],loop[1])
    for k in range(len(rings)-1):
        A,B=rings[k],rings[k+1]
        for i in range(len(A)):
            j=(i+1)%len(A); q=(A[i],A[j],B[j],B[i]); Fl.append(q[::-1] if rev else q)
    return rings
def body_n(p):
    sd,loc,n=signed_dist(bvhB,p); return n
# ---- rib collar
L=LP["neck"]; R0=V[L]
Nn=np.array([body_n(p) for p in R0]); z=np.array([0,0,1.0])
c0=R0.mean(0); radial=R0-c0; radial[:,2]=0; radial/=np.linalg.norm(radial,axis=1)[:,None]
for it in range(40):
    Nn=0.5*Nn+0.25*(np.roll(Nn,1,0)+np.roll(Nn,-1,0)); Nn/=np.linalg.norm(Nn,axis=1)[:,None]
Nn=0.5*Nn+0.5*radial; Nn/=np.linalg.norm(Nn,axis=1)[:,None]
U=z-Nn*(Nn@z)[:,None]; U/=np.linalg.norm(U,axis=1)[:,None]
H=0.019; T=0.0032
back=np.clip((R0[:,1]-0.03)/0.08,0,1)[:,None]   # 0 front .. 1 back
Hh=H-0.004*back; so=0.002*back
rings=[R0+U*0.007+Nn*(0.0025+so), R0+U*(Hh-0.003)+Nn*(0.0022+so), R0+U*Hh+Nn*(0.0005+so), R0+U*(Hh-0.002)-Nn*(T-0.0012-so), R0+U*0.003-Nn*(T-0.001-so)]
collar=add_band(L,rings)
# ---- sleeve hems (folded edge, facing turned inside)
AX={s:bp.arm_axis(s) for s in "LR"}
hems={}
for s_,key in (("L","sleeveL"),("R","sleeveR")):
    h,dv,Ln=AX[s_]; L=LP[key]; R0=V[L]
    c=h+dv*((R0-h)@dv).mean(); rad=R0-c; rad-=np.outer(rad@dv,dv); rad/=np.linalg.norm(rad,axis=1)[:,None]
    rings=[R0+dv*0.0018-rad*0.0008, R0+dv*0.0022-rad*0.0028, R0-rad*0.0034, R0-dv*0.020-rad*0.0030]
    hems[key]=add_band(L,rings)
# ---- bottom hem
L=LP["hem"]; R0=V[L]; c=R0.mean(0); rad=R0-c; rad[:,2]=0; rad/=np.linalg.norm(rad,axis=1)[:,None]
dn=np.array([0,0,-1.0])
rings=[R0+dn*0.0018-rad*0.0008, R0+dn*0.0022-rad*0.0028, R0-rad*0.0034, R0-dn*0.022-rad*0.0030]
hems["hem"]=add_band(L,rings)
V=np.array(Vl); F=Fl
# inner facings must sit just inside the actual outer shell, not at a fixed radius
shellF=F[:nshell]; bvhSh=make_bvh(V[:nshell_v],shellF)
def tuck(ids,depth):
    for i in ids:
        loc,n,fi,dd=bvhSh.find_nearest(Vector(V[i]))
        V[i]=np.array(loc)-np.array(n)*depth
cq=[]
for r in (0,1):
    A,B=collar[r],collar[r+1]
    for i in range(len(A)): j=(i+1)%len(A); cq.append((A[i],A[j],B[j],B[i]))
bvhC=make_bvh(V,cq)
def tuckC(ids,depth):
    for i in ids:
        loc,n,fi,dd=bvhC.find_nearest(Vector(V[i])); n=np.array(n)
        if n@(V[i]-np.array(loc))>0 and dd>1e-6: pass
        # band normal must point away from the neck axis
        out=np.array(loc)-np.array([0.0,0.036,loc[2]]); out[2]=0
        if n@out<0: n=-n
        V[i]=np.array(loc)-n*depth
tuckC(collar[4],0.0026); tuckC(collar[5],0.0026)
for key in ("sleeveL","sleeveR","hem"):
    tuck(hems[key][3],0.0034); tuck(hems[key][4],0.0030)
# ---- final collision pass (outer surface only; inner facings may sit closer)
inner=set(collar[4]+collar[5]+hems["sleeveL"][3]+hems["sleeveL"][4]+hems["sleeveR"][3]+hems["sleeveR"][4]+hems["hem"][3]+hems["hem"][4])
bad=0
for i in range(len(V)):
    sd,loc,n=signed_dist(bvhB,V[i]); mn=0.0012 if i in inner else 0.003
    if sd<mn: V[i]=V[i]+n*(mn-sd); bad+=1
sd=np.array([signed_dist(bvhB,x)[0] for x in V])
print("pushed",bad,"signed dist min %.4f"%sd.min(),"verts",len(V),"faces",len(F))
loops,nm=boundary_loops(F); print("boundary loops",[len(l) for l in loops],"nonmanifold",nm)
np.savez("/home/claude/work/tee_v3.npz",V=V,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),
         collar=np.array(collar,dtype=object),inner=np.array(sorted(inner)),hemL=np.array(hems['sleeveL'],dtype=object),hemR=np.array(hems['sleeveR'],dtype=object),hemB=np.array(hems['hem'],dtype=object),allow_pickle=True)
