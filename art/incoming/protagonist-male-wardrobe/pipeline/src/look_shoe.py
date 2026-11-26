import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy
arm,body=open_source(); a_pose(arm,0.63)
d=np.load(sys.argv[1],allow_pickle=True); V=d["V"]; F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; parts=d["parts"]
cols={"upper":(0.92,0.92,0.92,1),"collar":(0.8,0.8,0.85,1),"sole":(0.85,0.82,0.75,1),"tread":(0.5,0.5,0.5,1),"insole":(0.3,0.3,0.3,1),"tongue":(0.88,0.9,0.95,1),"laces":(0.98,0.98,0.98,1)}
for p in cols:
    fs=[f for f,q in zip(F,parts) if q==p]
    if not fs: continue
    ob=new_obj_from_arrays(p,V,fs); ob.color=cols[p]
    for pp in ob.data.polygons: pp.use_smooth=True
body.color=(0.45,0.32,0.25,1)
for o in bpy.data.objects:
    if o.type=="MESH" and o.name not in cols and o is not body: o.hide_render=True
if len(sys.argv)>3: body.hide_render=True
sc=setup_scene(600)
for yaw,t in ((0,"F"),(60,"Q"),(90,"S"),(200,"B")): shoot(f"{sys.argv[2]}_{t}.png",(0.11,-0.03,0.06),0.75,yaw,25,50)
