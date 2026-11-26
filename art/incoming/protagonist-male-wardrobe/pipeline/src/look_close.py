import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy
npz=sys.argv[1]; out=sys.argv[2]; hide_body=len(sys.argv)>3
arm,body=open_source(); a_pose(arm,0.63)
d=np.load(npz); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
ob=new_obj_from_arrays("SHELL",V,F)
for p in ob.data.polygons: p.use_smooth=True
sc=setup_scene(700); sc.display.shading.show_backface_culling=False
body.color=(0.45,0.32,0.25,1); ob.color=(0.92,0.92,0.9,1)
for o in bpy.data.objects:
    if o.type=="MESH" and o not in (body,ob): o.hide_render=True
if hide_body: body.hide_render=True
shoot(f"{out}_neckF.png",(0,0.0,1.46),1.0,0,25,70)
shoot(f"{out}_neckB.png",(0,0.05,1.46),1.0,180,25,70)
shoot(f"{out}_sleeve.png",(0.27,0.0,1.30),1.0,60,0,70)
