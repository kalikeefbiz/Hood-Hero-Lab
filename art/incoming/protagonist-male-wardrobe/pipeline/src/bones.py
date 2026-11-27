import sys; sys.path.insert(0,"/home/claude/work/pipe")
from common import *
import numpy as np
arm, body = open_source()
set_pose(arm,"Idle",1)
print([b.name for b in arm.data.bones])
def ang(b):
    d=(b.tail_local-b.head_local).normalized()
    down=Vector((0,0,-1))
    return math.degrees(math.acos(max(-1,min(1,d.dot(down)))))
for n in ["shoulder.L","upper_arm.L","forearm.L","hand.L","thigh.L","shin.L","foot.L"]:
    b=arm.data.bones[n]; pb=arm.pose.bones[n]
    # rest direction (bone local) and posed direction
    rest=(b.tail_local-b.head_local).normalized()
    posed=((pb.tail-pb.head)).normalized()
    print(n, "rest angle from down %.1f"%math.degrees(math.acos(max(-1,min(1,rest.dot(Vector((0,0,-1))))))), "idle angle from down %.1f"%math.degrees(math.acos(max(-1,min(1,posed.dot(Vector((0,0,-1))))))), "rest dir", [round(x,2) for x in rest], "posed dir", [round(x,2) for x in posed])
