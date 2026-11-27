import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
from facetypes import face_types
import bpy
d=np.load("/home/claude/work/tee_skin.npz",allow_pickle=True); v3=np.load("/home/claude/work/tee_v3.npz",allow_pickle=True)
F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]; ft=face_types(F,v3)
arm,body=open_source(); a_pose(arm,0.63)
for o in bpy.data.objects:
    if o.type=="MESH": o.hide_render=True
cols=[(0.9,0.9,0.9,1),(0.3,0.6,1,1),(1,0.8,0.2,1),(1,0.2,0.2,1)]
for t in range(4):
    ob=new_obj_from_arrays(f"T{t}",d["VA"],[f for f,k in zip(F,ft) if k==t]); ob.color=cols[t]
sc=setup_scene(700); sc.display.shading.show_backface_culling=False; sc.display.shading.show_xray=False
shoot("/home/claude/work/r/types_back.png",(-0.04,0.097,1.54),0.18,150,35,60)
shoot("/home/claude/work/r/types_front.png",(-0.04,0.097,1.54),0.18,180,70,60)
