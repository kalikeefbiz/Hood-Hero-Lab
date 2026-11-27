import sys; sys.path.insert(0,"/home/claude/work/pipe")
from common import *
arm, body = open_source()
for a in bpy.data.actions: print(a.name, a.frame_range[:])
set_pose(arm,"Idle",1)
p=eval_verts(body); r=mesh_arrays(body.data)
print("rest z/x ranges", r[:,2].min(), r[:,2].max(), "idle1 x range", p[:,0].min(), p[:,0].max(), "z", p[:,2].min(), p[:,2].max())
# arm hang: hands position
m=(p[:,0]>0.3)
print("max |x| posed", abs(p[:,0]).max(), "hand lowest z of left arm", p[p[:,0]>0.1][:,2].min())
