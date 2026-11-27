import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
import bpy, bmesh
from collections import Counter, defaultdict
from scipy.spatial import cKDTree
ID="jeans-denim-standard"
d=np.load("/home/claude/work/jeans_skin.npz",allow_pickle=True); VA=d["VA"]; VT=d["VT"]; W=d["W"]; bones=list(d["bones"])
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
v3=np.load("/home/claude/work/jeans_v3.npz",allow_pickle=True); ns=int(v3["nshell"])
band=[list(map(int,r)) for r in v3["waist"]]; bandset=set(v for r in band for v in r)
loopfaces=set(k for st,n in v3["loops"] for k in range(st,st+n))
arm,body=open_source(); a_pose(arm,0.63)
rim=VA[band[0]]; kd=cKDTree(rim)
def ycen(z): return np.interp(z,[0.05,0.48,0.84,1.0],[0.04,0.025,0.015,0.01])
lab=[]
for k,f in enumerate(F):
    c=VA[list(f)].mean(0)
    if k in loopfaces: lab.append("loops"); continue
    if all(v in bandset for v in f) or kd.query(c)[0]<0.038 and c[2]>0.9: lab.append("band"); continue
    lab.append(("front" if c[1]<ycen(c[2]) else "back")+("L" if c[0]>0 else "R"))
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
        if lab[k] in ("loops","band"): continue
        c=Counter(lab[j] for j in fadj[k] if lab[j] not in ("loops",))
        if c and c.most_common(1)[0][1]>=2 and c.most_common(1)[0][0]!=lab[k]: new[k]=c.most_common(1)[0][0]
    lab=new
for it in range(3):
    seen=np.zeros(len(F),bool); ch=0
    for k in range(len(F)):
        if seen[k]: continue
        comp=[k]; seen[k]=True; st=[k]
        while st:
            x=st.pop()
            for j in fadj[x]:
                if not seen[j] and lab[j]==lab[k]: seen[j]=True; comp.append(j); st.append(j)
        if len(comp)<60 and lab[k]!="loops":
            c=Counter(lab[j] for x in comp for j in fadj[x] if lab[j]!=lab[k] and lab[j]!="loops")
            if c:
                for x in comp: lab[x]=c.most_common(1)[0][0]
                ch+=1
    if not ch: break
lab=list(lab); print(Counter(lab))
me=bpy.data.meshes.new(ID); me.from_pydata([tuple(map(float,v)) for v in VT],[],F); me.update()
ob=bpy.data.objects.new(ID,me); bpy.context.scene.collection.objects.link(ob)
for p in me.polygons: p.use_smooth=True
seam_e=set(e for e,fs in eface.items() if len(fs)==2 and lab[fs[0]]!=lab[fs[1]])
# waistband cut at centre front (fly)
R0=band[0]; k0=int(np.argmin(VA[R0][:,1]-3*np.abs(VA[R0][:,0])))
for r in range(len(band)-1): seam_e.add(tuple(sorted((band[r][k0],band[r+1][k0]))))
import heapq
bandv=set(v for k,f in enumerate(F) if lab[k]=="band" for v in f)
vadj=defaultdict(list)
for e in eface: vadj[e[0]].append(e[1]); vadj[e[1]].append(e[0])
shellside=set(v for e in seam_e for v in e if v in bandv and any(lab[k]!="band" for k in eface[e]))
src=band[0][k0]; dist={src:0}; prev={}; pq=[(0,src)]; tgt=None
while pq:
    dd,x=heapq.heappop(pq)
    if x in shellside and VA[x,1]<0 and abs(VA[x,0])<0.03: tgt=x; break
    if dd>dist.get(x,1e9): continue
    for y in vadj[x]:
        if y not in bandv or y in bandset and y!=src: continue
        c=dd+np.linalg.norm(VA[x]-VA[y])*(1+60*abs(VA[y,0]))
        if c<dist.get(y,1e9): dist[y]=c; prev[y]=x; heapq.heappush(pq,(c,y))
path=[tgt]
while path[-1]!=src: path.append(prev[path[-1]])
for a_,b_ in zip(path,path[1:]): seam_e.add(tuple(sorted((a_,b_))))
print("band cut path",len(path))
bm=bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table(); n=0
for e in bm.edges:
    if tuple(sorted((e.verts[0].index,e.verts[1].index))) in seam_e: e.seam=True; n+=1
bm.to_mesh(me); bm.free(); print("seam edges",n)
me.uv_layers.new(name="UVMap")
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.unwrap(method="ANGLE_BASED",margin=0.002); bpy.ops.uv.average_islands_scale()
bpy.ops.uv.pack_islands(rotate=True,rotate_method="AXIS_ALIGNED",margin=0.004,shape_method="CONCAVE")
bpy.ops.object.mode_set(mode="OBJECT")
uv=np.zeros((len(me.loops),2)); me.uv_layers[0].data.foreach_get("uv",uv.ravel())
A3=A2=0; sc=[]
for p in me.polygons:
    li=list(p.loop_indices); vs=list(p.vertices); P3=VT[vs]; P2=uv[li]
    for k in range(1,len(vs)-1):
        a3=np.linalg.norm(np.cross(P3[k]-P3[0],P3[k+1]-P3[0]))/2; e1=P2[k]-P2[0]; e2=P2[k+1]-P2[0]; a2=abs(e1[0]*e2[1]-e1[1]*e2[0])/2
        A3+=a3; A2+=a2
        if a3>1e-9: sc.append(np.sqrt(a2/a3))
sc=np.array(sc)/np.median(sc)
print("surface %.3f m2, uv coverage %.1f%%, density %.1f px/cm @2048; stretch p5 %.2f p95 %.2f"%(A3,A2*100,2048*np.sqrt(A2/A3)/100,np.percentile(sc,5),np.percentile(sc,95)))
for j,nm in enumerate(bones):
    g=ob.vertex_groups.new(name=nm)
    for i in np.where(W[:,j]>0)[0]: g.add([int(i)],float(W[i,j]),"REPLACE")
ob.parent=arm; m=ob.modifiers.new("Armature","ARMATURE"); m.object=arm
types={}
for e in seam_e:
    fs=eface.get(e,[]); ls=sorted(set(lab[k] for k in fs))
    if len(ls)==2:
        t="band" if "band" in ls else ("loops" if "loops" in ls else ("center" if ls[0][:-1]==ls[1][:-1] else "side"))
    else: t="cut"
    types.setdefault(t,[]).append(e)
print({k:len(v) for k,v in types.items()})
np.savez("/home/claude/work/jeans_uv.npz",uv=uv,lab=np.array(lab),**{"seam_"+k:np.array(v) for k,v in types.items()})
for o in list(bpy.data.objects):
    if o.type=="MESH" and o not in (body,ob): bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath="/home/claude/work/jeans_uv.blend")
from PIL import Image, ImageDraw
im=Image.new("RGB",(1024,1024),(20,20,24)); dr=ImageDraw.Draw(im)
cols={"frontL":(230,200,90),"frontR":(200,170,60),"backL":(90,170,230),"backR":(60,130,200),"band":(240,90,80),"loops":(250,250,250)}
for p in me.polygons: dr.polygon([(uv[l,0]*1023,(1-uv[l,1])*1023) for l in p.loop_indices],fill=cols[lab[p.index]],outline=(20,20,24))
im.save("/home/claude/work/r/jeans_uv.png")
