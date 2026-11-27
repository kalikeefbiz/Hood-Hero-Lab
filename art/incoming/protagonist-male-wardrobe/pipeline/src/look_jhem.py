import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy
arm,body=open_source(); a_pose(arm,0.63)
d=np.load("/home/claude/work/jeans_v3.npz",allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
ob=new_obj_from_arrays("J",V,F); ob.color=(0.25,0.35,0.6,1)
for p in ob.data.polygons: p.use_smooth=False
for o in bpy.data.objects:
    if o.type=="MESH" and o is not ob: o.hide_render=True
sc=setup_scene(600); sc.display.shading.show_backface_culling=True
for i,(yaw,el) in enumerate(((20,10),(-40,10),(90,5),(200,10))): shoot(f"/home/claude/work/r/jh_{i}.png",(0.0,-0.0,0.12),0.9,yaw,el,40)
