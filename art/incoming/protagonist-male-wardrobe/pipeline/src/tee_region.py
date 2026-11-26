import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
arm, body = open_source()
a_pose(arm, 0.63)
P = eval_verts(body); R = mesh_arrays(body.data)
bones = [b.name for b in arm.data.bones]
W = weights_from_object(body, bones); B = bone_matrices(arm)
M = lbs_matrices(W, B, bones)
chk = apply_lbs(M, R)
print("LBS reproduces evaluated body: max err", np.abs(chk-P).max())
# upper arm direction in A pose
for side in "LR":
    pb = arm.pose.bones[f"upper_arm.{side}"]
    h, t = np.array(pb.head), np.array(pb.tail)
    d = (t-h); L=np.linalg.norm(d); d/=L
    print(side, "head",h.round(3),"tail",t.round(3),"len %.3f"%L, "angle from down %.1f"%math.degrees(math.acos(-d[2])))
print("posed x range", P[:,0].min(), P[:,0].max(), "hand low z", P[:,2][P[:,0]>0.2].min())
# regions
names=["region_neck","region_torso","region_upper_arms","region_forearms","region_hands","region_upper_legs","region_lower_legs","region_feet"]
RW=np.zeros((len(P),len(names)))
gi={g.name:g.index for g in body.vertex_groups}
for v in body.data.vertices:
    for g in v.groups:
        for k,n in enumerate(names):
            if g.group==gi[n]: RW[v.index,k]=g.weight
rid=RW.argmax(1); none=(RW.max(1)<=0)
print("verts with no region:", none.sum(), "counts", {n:int((rid==k).sum()) for k,n in enumerate(names)})
neck=P[(rid==0)]
print("neck z", neck[:,2].min(), neck[:,2].max(), "y mean@z>1.5", neck[neck[:,2]>1.5][:,1].mean())
np.savez("/home/claude/work/apose.npz", P=P, R=R, rid=rid)
