import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy
npz=sys.argv[1]; out=sys.argv[2]
arm,body=open_source(); a_pose(arm,0.63)
d=np.load(npz); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
ob=new_obj_from_arrays("SHELL",V,F)
for p in ob.data.polygons: p.use_smooth=True
sc=setup_scene(800)
body.color=(0.45,0.32,0.25,1); ob.color=(0.25,0.35,0.6,1)
for o in bpy.data.objects:
    if o.type=="MESH" and o not in (body,ob): o.hide_render=True
tgt=(0,0,0.55)
for yaw,tag in [(0,"front"),(90,"side"),(180,"back"),(35,"q34")]:
    shoot(f"{out}_{tag}.png",tgt,3.4,yaw,5,60)
