"""Skin-weight patches applied at export (no geometry change):
 neck  : tee verts near the neck take the body's own weights, so the collar moves with the neck (no neck poke-through)
 under : inner-garment verts hidden under an outer garment take the outer garment's weights near them, so the layers
         move together and the inner one can't push through (jeans under the tee hem in Run)."""
import numpy as np, bpy
from scipy.spatial import cKDTree
def groups_matrix(ob,names):
    M=np.zeros((len(ob.data.vertices),len(names))); idx={n:i for i,n in enumerate(names)}
    gi={g.index:g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        for g in v.groups:
            n=gi[g.group]
            if n in idx: M[v.index,idx[n]]=g.weight
    return M
def write_groups(ob,names,M):
    for j,n in enumerate(names):
        g=ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        nz=np.where(M[:,j]>1e-4)[0]; z=np.where(M[:,j]<=1e-4)[0]
        if len(z): g.remove([int(i) for i in z])
        for i in nz: g.add([int(i)],float(M[i,j]),"REPLACE")
def sstep(a,b,x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
def topk(M,k=4):
    o=np.argsort(-M,1)[:,k:]; M=M.copy(); np.put_along_axis(M,o,0,1); return M/np.maximum(M.sum(1,keepdims=True),1e-9)
def patch_neck(ob,body,z0=1.47,z1=1.505,dmax=0.05):
    names=sorted({g.name for g in body.vertex_groups}&{g.name for g in ob.vertex_groups}|{g.name for g in ob.vertex_groups})
    names=[n for n in names if n in body.vertex_groups]
    W=groups_matrix(ob,names); Wb=groups_matrix(body,names)
    V=np.array([v.co for v in ob.data.vertices]); B=np.array([v.co for v in body.data.vertices])
    keep=Wb.sum(1)>0.5; tree=cKDTree(B[keep]); d,i=tree.query(V,k=4); w=1/np.maximum(d,1e-4); w/=w.sum(1,keepdims=True)
    Wn=(Wb[keep][i]*w[...,None]).sum(1)
    f=sstep(z0,z1,V[:,2])*(d[:,0]<dmax)
    W2=topk((1-f[:,None])*W+f[:,None]*Wn); write_groups(ob,names,W2); print("neck patch verts",int((f>0.01).sum()))
def patch_under(ob,outer_npz,hem_key="hemB",below=0.012,above=0.045,dmax=0.06):
    o=np.load(outer_npz,allow_pickle=True); VO=o["VT"]; WO=o["W"]; ob_names=list(o["bones"])
    v3=np.load(outer_npz.replace("_skin.npz","_v3.npz"),allow_pickle=True); hem=np.array([int(v) for v in v3[hem_key][0]])
    names=[n for n in ob_names if n in ob.vertex_groups or True]
    W=groups_matrix(ob,names); V=np.array([v.co for v in ob.data.vertices])
    H=VO[hem]; c=H[:,:2].mean(0); ah=np.arctan2(H[:,1]-c[1],H[:,0]-c[0]); o_=np.argsort(ah)
    a=np.arctan2(V[:,1]-c[1],V[:,0]-c[0]); hz=np.interp(a,np.r_[ah[o_]-2*np.pi,ah[o_],ah[o_]+2*np.pi],np.r_[H[o_,2],H[o_,2],H[o_,2]])
    d,i=cKDTree(VO).query(V,k=4); w=1/np.maximum(d,1e-4); w/=w.sum(1,keepdims=True); Wn=(WO[i]*w[...,None]).sum(1)
    f=sstep(hz-below,hz+above,V[:,2])*(d[:,0]<dmax)*(V[:,2]<VO[:,2].max()-0.25)
    W2=topk((1-f[:,None])*W+f[:,None]*Wn); write_groups(ob,names,W2); print("under patch verts",int((f>0.01).sum()))
