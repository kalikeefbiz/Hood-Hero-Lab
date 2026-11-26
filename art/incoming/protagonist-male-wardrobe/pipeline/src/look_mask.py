import sys; sys.path.insert(0,"/home/claude/work/pipe")
from common import *
from render_util import *
import bpy, bmesh
hidden=np.load(sys.argv[1]); out=sys.argv[2]
arm,body=open_source()
for o in bpy.data.objects:
    if o.type=="MESH" and o!=body: o.hide_render=True
me=body.data
for p in me.polygons: p.material_index=0
bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.where(hidden)[0]],context="FACES_ONLY"); bm.to_mesh(me); bm.free()
sc=setup_scene(700); sc.display.shading.show_backface_culling=False; body.color=(0.75,0.5,0.4,1)
arm.animation_data.action=None
for pb in arm.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
for yaw,t in ((0,"F"),(180,"B"),(90,"S"),(0,"U")):
    if t=="U": shoot(f"{out}_{t}.png",(0.3,0,1.35),1.2,0,-60,60)
    else: shoot(f"{out}_{t}.png",(0,0,1.2),2.6,yaw,5,60)
