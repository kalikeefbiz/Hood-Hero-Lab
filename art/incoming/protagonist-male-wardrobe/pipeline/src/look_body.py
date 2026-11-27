import sys; sys.path.insert(0,"/home/claude/work/pipe")
from common import *; from render_util import *
arm, body = open_source()
set_pose(arm,"Idle",1)
setup_scene(800)
for o in bpy.data.objects:
    if o.type=="MESH" and o.name.startswith(("WGT","Head_face_0")) and o.name!="Head_face_03": o.hide_render=True
    if o.type=="ARMATURE": o.hide_render=True
for name,yaw in [("front",0),("side",90),("q34",40)]:
    shoot(f"/home/claude/work/look_body_{name}.png",(0,0.0,0.95),4.2,yaw,3,50)
