import sys; sys.path.insert(0,'/home/claude/scripts')
from common import *
import numpy as np
src,out=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
body=bpy.data.objects['Quanny']; me=body.data
img=[n.image for n in body.active_material.node_tree.nodes if n.type=='TEX_IMAGE' and n.outputs[0].links[0].to_socket.name=='Base Color'][0]
W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)
uv=me.uv_layers.active.data
vuv=np.zeros((len(me.vertices),2))
for l in me.loops: vuv[l.vertex_index]=uv[l.index].uv
cols=px[(np.clip(vuv[:,1],0,0.999)*H).astype(int),(np.clip(vuv[:,0],0,0.999)*W).astype(int),:3]
co=np.array([v.co for v in me.vertices])
vg={g.name:g for g in body.vertex_groups}
def setonly(i,weights):
    for g in body.vertex_groups:
        try: g.remove([i])
        except: pass
    for n,w in weights.items(): vg[n].add([i],w,'REPLACE')
blue=(cols[:,2]>cols[:,0]*1.6)&(cols[:,2]>0.15)
# bandana hanging: front-left of hips, blue or white print region in box
bx=(co[:,0]>0.02)&(co[:,0]<0.23)&(co[:,1]<-0.06)&(co[:,2]>0.64)&(co[:,2]<1.04)
band=np.where(bx&blue)[0]
# grow selection to white-print verts inside the same box that neighbor blue verts
adj=[set() for _ in me.vertices]
for e in me.edges: a,b=e.vertices; adj[a].add(b); adj[b].add(a)
sel=set(band.tolist())
for _ in range(3):
    new=set()
    for i in sel:
        for j in adj[i]:
            if j not in sel and bx[j] and (cols[j].min()>0.55): new.add(j)
    sel|=new
print('bandana verts',len(sel))
for i in sel:
    z=co[i,2]; t=np.clip((1.0-z)/0.12,0,1)  # top knot stays with hips
    setonly(i,{'Hips':1-t,'Bandana':t} if t<1 else {'Bandana':1.0})
# hair/head-wrap: dreads hanging near neck -> head
hair=0
for i,(x,y,z) in enumerate(co):
    if (z>1.645 and (abs(x)>0.062 or y>0.05) and abs(x)<0.16) or (z>1.70):
        setonly(i,{'Head':1.0}); hair+=1
print('hair verts',hair)
# unweighted verts -> nearest weighted neighbour
for it in range(20):
    miss=[v.index for v in me.vertices if not v.groups]
    if not miss: break
    for i in miss:
        for j in adj[i]:
            if me.vertices[j].groups:
                setonly(i,{body.vertex_groups[g.group].name:g.weight for g in me.vertices[j].groups}); break
print('still unweighted',sum(1 for v in me.vertices if not v.groups))
bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_clean(group_select_mode='ALL',limit=0.01)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=out)
