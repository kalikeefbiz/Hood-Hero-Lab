import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy
arm,body=open_source(); a_pose(arm,0.63)
d=np.load(sys.argv[1],allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
ob=new_obj_from_arrays("S",V,F); ob.color=(0.25,0.35,0.6,1)
for p in ob.data.polygons: p.use_smooth=True
for o in bpy.data.objects:
    if o.type=="MESH" and o is not ob: o.hide_render=True
sc=setup_scene(600); sc.display.shading.show_backface_culling=False
shoot(sys.argv[2]+"_a.png",(0,-0.05,0.93),0.7,15,10,50)
shoot(sys.argv[2]+"_b.png",(0,0.05,0.93),0.7,160,10,50)
shoot(sys.argv[2]+"_c.png",(0.1,0,0.15),0.6,30,10,50)
