import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
import bpy, bmesh
METHOD=sys.argv[1] if len(sys.argv)>1 else 'ANGLE_BASED'
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); VA=d["VA"]; VT=d["VT"]; W=d["W"]; bones=list(d["bones"]); isarm=d["isarm"]
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True); collar=[list(map(int,r)) for r in v3["collar"]]
arm,body=open_source(); a_pose(arm,0.63)
# ---- face labels
cset=set(v for r in collar for v in r); r0=set(collar[0])
def ycut(z): return np.interp(z,[0.8,1.2,1.36,1.6],[0.0,0.0,0.03,0.045])
lab=[]
for f in F:
    if all(v in cset for v in f) and any(v not in r0 for v in f): lab.append("collar"); continue
    if np.mean([isarm[v] for v in f])>0.5: lab.append("sleeveL" if VA[list(f)][:,0].mean()>0 else "sleeveR"); continue
    c=VA[list(f)].mean(0); lab.append("front" if c[1]<ycut(c[2]) else "back")
from collections import Counter, defaultdict
import heapq
# face adjacency
eface=defaultdict(list)
for k,f in enumerate(F):
    for i in range(len(f)): eface[tuple(sorted((f[i],f[(i+1)%len(f)])))].append(k)
fadj=[[] for _ in F]
for e,fs in eface.items():
    if len(fs)==2: fadj[fs[0]].append(fs[1]); fadj[fs[1]].append(fs[0])
lab=np.array(lab,dtype=object)
for it in range(4):
    new=lab.copy()
    for k in range(len(F)):
        if lab[k]=="collar": continue
        c=Counter(lab[j] for j in fadj[k] if lab[j]!="collar")
        if c and c.most_common(1)[0][1]>=2 and c.most_common(1)[0][0]!=lab[k]: new[k]=c.most_common(1)[0][0]
    lab=new
# drop small components per label
for it in range(3):
    seen=np.zeros(len(F),bool); changed=0
    for k in range(len(F)):
        if seen[k]: continue
        comp=[k]; seen[k]=True; st=[k]
        while st:
            x=st.pop()
            for j in fadj[x]:
                if not seen[j] and lab[j]==lab[k]: seen[j]=True; comp.append(j); st.append(j)
        if len(comp)<60 and lab[k]!="collar":
            c=Counter(lab[j] for x in comp for j in fadj[x] if lab[j]!=lab[k])
            if c:
                for x in comp: lab[x]=c.most_common(1)[0][0]
                changed+=1
    if not changed: break
lab=list(lab)
print(Counter(lab))

# ---- per-vertex sleeve angle (A pose) for underarm cut
theta=np.zeros(len(VA))
for s_ in "LR":
    pb=arm.pose.bones[f"upper_arm.{s_}"]; h=np.array(pb.head); t=np.array(arm.pose.bones[f"upper_arm.{s_}.001"].tail); dv=(t-h)/np.linalg.norm(t-h)
    down=np.array([0,0,-1.0])-dv*(-dv[2]); inward=np.array([-np.sign(h[0]),0,0]); ref=inward-dv*(inward@dv); ref/=np.linalg.norm(ref)
    side=np.cross(dv,ref)
    m=(VA[:,0]>0) if s_=="L" else (VA[:,0]<0)
    q=VA[m]-h; theta[m]=np.arctan2(q@side,q@ref)   # 0 = toward the torso (underarm)
# ---- build object in rest pose
me=bpy.data.meshes.new("tee-white"); me.from_pydata([tuple(map(float,v)) for v in VT],[],F); me.update()
ob=bpy.data.objects.new("tee-white",me); bpy.context.scene.collection.objects.link(ob)
for p in me.polygons: p.use_smooth=True
bm=bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table(); bm.faces.ensure_lookup_table()
nseam=0
seam_e=set()
for e,fs in eface.items():
    if len(fs)==2 and lab[fs[0]]!=lab[fs[1]]: seam_e.add(e)
# collar back-centre cut: radial edges at the ring index closest to back centre
R0=collar[0]; k0=int(np.argmax(VA[R0][:,1]-5*np.abs(VA[R0][:,0])))
for r in range(len(collar)-1): seam_e.add(tuple(sorted((collar[r][k0],collar[r+1][k0]))))
# sleeve underarm: shortest edge path along theta~0 from the armscye seam to the open facing boundary
vadj=defaultdict(list)
for e in eface: vadj[e[0]].append(e[1]); vadj[e[1]].append(e[0])
bnd=set(v for e,fs in eface.items() if len(fs)==1 for v in e)
for side in ("sleeveL","sleeveR"):
    sv=set(v for k,f in enumerate(F) if lab[k]==side for v in f)
    arms=set(v for e in seam_e for v in e if v in sv)               # on the armscye seam
    starts=[v for v in arms if abs(theta[v])<0.6]; ends=set(v for v in sv if v in bnd)
    src=min(starts,key=lambda v:abs(theta[v]))
    dist={src:0}; prev={}; pq=[(0,src)]
    while pq:
        dd,x=heapq.heappop(pq)
        if x in ends: tgt=x; break
        if dd>dist.get(x,1e9): continue
        for y in vadj[x]:
            if y not in sv: continue
            c=dd+np.linalg.norm(VA[x]-VA[y])*(1+8*abs(theta[y]))
            if c<dist.get(y,1e9): dist[y]=c; prev[y]=x; heapq.heappush(pq,(c,y))
    path=[tgt]
    while path[-1]!=src: path.append(prev[path[-1]])
    for a_,b_ in zip(path,path[1:]): seam_e.add(tuple(sorted((a_,b_))))
    print(side,"underarm path",len(path),"theta max %.2f"%np.abs(theta[path]).max())
for e in bm.edges:
    if tuple(sorted((e.verts[0].index,e.verts[1].index))) in seam_e: e.seam=True; nseam+=1
bm.to_mesh(me); bm.free(); print("seam edges",nseam)
me.uv_layers.new(name="UVMap")
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.unwrap(method=METHOD,margin=0.002)
bpy.ops.object.mode_set(mode="OBJECT")
uvl=me.uv_layers[0].data
ring_of={}; idx_of={}
for r,ring in enumerate(collar):
    for k,v in enumerate(ring): ring_of[v]=r; idx_of[v]=k
nR=len(collar[0])
# arc length along ring 0 starting at the cut index k0, and height = cumulative ring spacing
order=[(k0+j)%nR for j in range(nR+1)]
seg=[np.linalg.norm(VT[collar[0][order[j+1]]]-VT[collar[0][order[j]]]) for j in range(nR)]
ucum=np.r_[0,np.cumsum(seg)]; upos={order[j]:ucum[j] for j in range(nR)}
hgt=np.r_[0,np.cumsum([np.mean(np.linalg.norm(VT[collar[r+1]]-VT[collar[r]],axis=1)) for r in range(len(collar)-1)])]
for p in me.polygons:
    if lab[p.index]!="collar": continue
    ks=[idx_of[me.loops[l].vertex_index] for l in p.loop_indices]
    wrap=(max(ks)-min(ks))>nR/2
    for l in p.loop_indices:
        v=me.loops[l].vertex_index; k=idx_of[v]; u=upos[k] if k!=k0 else 0.0
        if k==k0 and (wrap or any(kk>nR/2 for kk in ks if kk!=k0)) and max(ks)>k0+nR/2: u=ucum[-1]
        # faces that straddle the cut at k0 use the end of the strip for the k0 side
        if k==k0 and any(((kk-k0)%nR)>nR/2 for kk in ks): u=ucum[-1]
        uvl[l].uv=(u, hgt[ring_of[v]])
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(rotate=True,margin=0.004,shape_method="CONCAVE",rotate_method="ANY")
bpy.ops.object.mode_set(mode="OBJECT")
# ---- stats: islands and texel density
uv=np.zeros((len(me.loops),2)); me.uv_layers[0].data.foreach_get("uv",uv.ravel())
A3=0;A2=0
for p in me.polygons:
    li=list(p.loop_indices); vs=list(p.vertices)
    P3=VT[vs]; P2=uv[li]
    for k in range(1,len(vs)-1):
        A3+=np.linalg.norm(np.cross(P3[k]-P3[0],P3[k+1]-P3[0]))/2
        e1=P2[k]-P2[0]; e2=P2[k+1]-P2[0]; A2+=abs(e1[0]*e2[1]-e1[1]*e2[0])/2
print("surface %.3f m2, uv coverage %.1f%%, texel density @2048: %.1f px/cm"%(A3,A2*100,2048*np.sqrt(A2/A3)/100))
sc=[]
for p in me.polygons:
    li=list(p.loop_indices); vs=list(p.vertices); P3=VT[vs]; P2=uv[li]
    a3=np.linalg.norm(np.cross(P3[1]-P3[0],P3[2]-P3[0])); e1=P2[1]-P2[0]; e2=P2[2]-P2[0]; a2=abs(e1[0]*e2[1]-e1[1]*e2[0])
    if a3>1e-9: sc.append(np.sqrt(a2/a3))
sc=np.array(sc)/np.median(sc); print("%s scale spread p5 %.2f p95 %.2f min %.2f max %.2f"%(METHOD,np.percentile(sc,5),np.percentile(sc,95),sc.min(),sc.max()))
# ---- skin: vertex groups + armature modifier, parent
for j,n in enumerate(bones):
    g=ob.vertex_groups.new(name=n); idx=np.where(W[:,j]>0)[0]
    for i in idx: g.add([int(i)],float(W[i,j]),"REPLACE")
ob.parent=arm; mod=ob.modifiers.new("Armature","ARMATURE"); mod.object=arm
types={}
for e in seam_e:
    fs=eface.get(e,[]); ls=sorted(set(lab[k] for k in fs))
    if len(ls)==2:
        t="neck" if "collar" in ls else ("armscye" if any(l.startswith("sleeve") for l in ls) else "body")
    else:
        t="collar_cut" if ls==["collar"] else "underarm"
    types.setdefault(t,[]).append(e)
print({k:len(v) for k,v in types.items()})
np.savez("/home/claude/work/tee_uv.npz",uv=uv,lab=np.array(lab),theta=theta,**{"seam_"+k:np.array(v) for k,v in types.items()},k0=k0)
for o in list(bpy.data.objects):
    if o.type=="MESH" and o not in (body,ob): bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/tee_uv.blend")
# UV layout preview
from PIL import Image, ImageDraw
im=Image.new("RGB",(1024,1024),(20,20,24)); dr=ImageDraw.Draw(im)
cols={"front":(230,200,90),"back":(90,170,230),"sleeveL":(120,220,120),"sleeveR":(220,120,200),"collar":(240,90,80)}
for p in me.polygons:
    pts=[(uv[l,0]*1023,(1-uv[l,1])*1023) for l in p.loop_indices]; dr.polygon(pts,fill=cols[lab[p.index]],outline=(20,20,24))
im.save("/home/claude/work/r/tee_uv.png")
