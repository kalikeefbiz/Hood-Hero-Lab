import sys; sys.path.insert(0,"/home/claude/work/pipe")
from bodyprep import *
from shell_tools import *
bp=BodyPrep(); P=bp.Pw
wA=bp.grp(lambda n:n.startswith(("upper_arm","forearm","hand")))
wL=bp.grp(lambda n:n.startswith(("thigh","shin","foot","toe")))
HEM0=0.96; T_END=0.58
keep=(P[:,2]>=HEM0)&(wL<0.5)
for s in "LR":
    h,dv,L=bp.arm_axis(s); side=(P[:,0]>0) if s=="L" else (P[:,0]<0); t=((P-h)@dv)/L
    keep[side&(wA>0.5)&(t>T_END)]=False; keep[side&(t>T_END)&(np.abs(P[:,0])>0.2)]=False
yc,a,b=0.040,0.094,0.098
zc=1.462+0.03*np.clip((P[:,1]-yc)/0.098,-1,1)
keep&=~(((P[:,0]/a)**2+((P[:,1]-yc)/b)**2<1)&(P[:,2]>zc))
keep=largest_component(bp.faces,keep)
sel=[f for f in bp.faces if all(keep[v] for v in f)]
loops,nm=boundary_loops(sel)
print("loops",[(len(l),round(float(P[l][:,2].mean()),2)) for l in loops],"nm",nm)
vid=np.where(keep)[0]; remap={int(v):i for i,v in enumerate(vid)}
V=P[vid].copy(); F=[tuple(remap[v] for v in f) for f in sel]
loops_l=[[remap[v] for v in l] for l in loops]
# classify loops
def cls(l):
    c=V[l].mean(0)
    if c[2]<1.1: return "hem"
    if abs(c[0])<0.05 and c[2]>1.4: return "neck"
    return "sleeveL" if c[0]>0 else "sleeveR"
L={cls(l):l for l in loops_l}; print({k:len(v) for k,v in L.items()})
# hem skirt: extrude ring downward
hem=order_loop(L["hem"],F)
DZ=0.028; NR=6
ring_idx=[hem]; nv=len(V); Vl=list(map(tuple,V)); Fl=list(F)
cen=V[hem].mean(0)
for k in range(1,NR+1):
    ids=[]
    for v in hem:
        p=V[v].copy(); p[2]-=DZ*k
        out=p-np.array([cen[0],cen[1],p[2]]); out[2]=0; out/= (np.linalg.norm(out)+1e-9)
        p+=out*(0.004*k)   # slight flare
        Vl.append(tuple(p)); ids.append(len(Vl)-1)
    ring_idx.append(ids)
for k in range(NR):
    A,Bk=ring_idx[k],ring_idx[k+1]
    for i in range(len(A)):
        j=(i+1)%len(A)
        Fl.append((A[i],A[j],Bk[j],Bk[i]))
V=np.array(Vl); F=Fl
hem_end=ring_idx[-1]
print("shell verts",len(V),"faces",len(F))
# orientation: make normals point outward (check vs body)
bvh=make_bvh(P,bp.faces)
sd=[signed_dist(bvh,p)[0] for p in V[:200]]
print("sample signed dist (should be ~0, small):",np.round(sd[:5],4))
np.savez("/home/claude/work/tee_shell0.npz",V=V,F=np.array([list(f)+[-1]*(4-len(f)) for f in F]),hem=np.array(hem),hem_end=np.array(hem_end),neck=np.array(L["neck"]),sleeveL=np.array(L["sleeveL"]),sleeveR=np.array(L["sleeveR"]),vid=vid)
