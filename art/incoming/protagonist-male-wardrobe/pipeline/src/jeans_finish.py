import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw
rid=np.load('/home/claude/work/apose.npz')['rid'][bp.first]
bvhB=make_bvh(P,[f for f in bp.faces if not np.all(rid[list(f)]==7)])
d=np.load("/home/claude/work/jeans_v2.npz"); V=d["V"].copy(); F=[tuple(int(x) for x in f) for f in d["F"]]
LP={k:list(map(int,d[k])) for k in ("waist","hemL","hemR")}
rims=set(v for l in LP.values() for v in l)
# tangential relax for even triangles
bvhS=make_bvh(V,F); nb=neighbors_from_faces(F,len(V))
for it in range(10):
    N=vertex_normals(V,F); Y=V.copy()
    for i in range(len(V)):
        if i in rims: continue
        dl=V[nb[i]].mean(0)-V[i]; dl-=N[i]*(dl@N[i]); Y[i]=V[i]+0.6*dl
    for i in range(len(V)):
        if i in rims: continue
        Y[i]=np.array(bvhS.find_nearest(Vector(Y[i]))[0])
    V=Y
# smooth the waist rim along the loop
wl=LP["waist"]
for _ in range(10): V[wl]=0.5*V[wl]+0.25*(np.roll(V[wl],1,0)+np.roll(V[wl],-1,0))
Vl=list(map(np.array,V)); Fl=list(F); nshell=len(F); nshell_v=len(V)
def winding_same(a,b): return any(f[k]==a and f[(k+1)%len(f)]==b for f in F for k in range(len(f)))
def add_band(loop,rings_pos):
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
bands={}
# waistband top fold: lip then a 4 cm facing inside
R0=V[wl]; c=R0.mean(0); rad=R0-c; rad[:,2]=0; rad/=np.linalg.norm(rad,axis=1)[:,None]; up=np.array([0,0,1.0])
bands["waist"]=add_band(wl,[R0+up*0.0020-rad*0.0010, R0+up*0.0022-rad*0.0035, R0-rad*0.0040, R0-up*0.040-rad*0.0036])
for key in ("hemL","hemR"):
    L=LP[key]; R0=V[L]; c=R0.mean(0); rad=R0-c; rad[:,2]=0; rad/=np.linalg.norm(rad,axis=1)[:,None]; dn=-up
    bands[key]=add_band(L,[R0+dn*0.0020-rad*0.0010, R0+dn*0.0024-rad*0.0035, R0-rad*0.0042, R0-dn*0.030-rad*0.0038])
V=np.array(Vl); F=Fl
shellF=F[:nshell]; bvhSh=make_bvh(V[:nshell_v],shellF)
def tuck(ids,depth):
    for i in ids:
        loc,n,fi,dd=bvhSh.find_nearest(Vector(V[i])); V[i]=np.array(loc)-np.array(n)*depth
for key in bands: tuck(bands[key][3],0.0040); tuck(bands[key][4],0.0036)
inner=set(v for key in bands for r in (3,4) for v in bands[key][r])
# belt loops: 7 strips on the waistband, standing ~3 mm off it
Vl=list(map(np.array,V)); Fl=list(F)
wc=V[wl].mean(0); angs=np.radians([-90-38,-90+38,-8,188,90-22,90+22,90])   # front pair, sides, back pair, centre back (front is -y)
loops_faces=[]
for a in angs:
    dirv=np.array([np.cos(a),np.sin(a),0])
    # rim point closest to that direction
    k=int(np.argmax((V[wl]-wc)@dirv)); top=V[wl[k]]
    tang=np.cross(up,dirv); tang/=np.linalg.norm(tang)
    rows=[]
    for (dz,off) in ((-0.004,0.0010),(-0.010,0.0021),(-0.038,0.0021),(-0.047,0.0010)):
        base=top+up*dz; loc,n,fi,dd=bvhSh.find_nearest(Vector(base)); loc=np.array(loc); n=np.array(n)
        row=[]
        for w in (-0.0052,0.0052):
            for t_ in (0.0,0.0014):            # outer surface and a thin inner layer for thickness
                Vl.append(loc+tang*w+n*(off+t_)); row.append(len(Vl)-1)
        rows.append(row)   # [left-inner, left-outer, right-inner, right-outer]
    fs=[]
    for r in range(3):
        A,B=rows[r],rows[r+1]
        fs.append((A[1],A[3],B[3],B[1]))   # outer face
        fs.append((A[0],A[1],B[1],B[0]))   # left wall
        fs.append((A[3],A[2],B[2],B[3]))   # right wall
    fs.append((rows[0][0],rows[0][2],rows[0][3],rows[0][1])); fs.append((rows[3][1],rows[3][3],rows[3][2],rows[3][0]))
    # orient outer face away from the body
    q=np.array([Vl[i] for i in fs[0]]); nrm=np.cross(q[1]-q[0],q[2]-q[0])
    if nrm@(q.mean(0)-wc)*np.array([1,1,0]).sum()<0 and nrm[:2]@(q.mean(0)-wc)[:2]<0: fs=[f[::-1] for f in fs]
    loops_faces.append((len(Fl),len(fs))); Fl.extend(fs)
V=np.array(Vl); F=Fl
bad=0
for i in range(len(V)):
    sd,loc,n=signed_dist(bvhB,V[i]); mn=0.0012 if i in inner else 0.003
    if sd<mn: V[i]=V[i]+n*(mn-sd); bad+=1
print("pushed",bad,"verts",len(V),"faces",len(F))
np.savez("/home/claude/work/jeans_v3.npz",V=V,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),inner=np.array(sorted(inner)),
         waist=np.array(bands["waist"],dtype=object),hemL=np.array(bands["hemL"],dtype=object),hemR=np.array(bands["hemR"],dtype=object),
         loops=np.array(loops_faces),nshell=nshell,allow_pickle=True)
