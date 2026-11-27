import bpy, math, numpy as np
from mathutils import Quaternion, Matrix, Vector
from common import *

ARM_BONES = ["shoulder", "upper_arm", "upper_arm.001", "forearm", "forearm.001", "hand"]

def a_pose(arm, s=0.63, action="Idle", frame=1):
    """Pose = Idle (legs, spine) with the arm chain only s of the way from T to its Idle rotation."""
    set_pose(arm, action, frame)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    # capture idle local rotations
    idle = {}
    for pb in arm.pose.bones:
        q = pb.matrix_basis.to_quaternion(); l = pb.matrix_basis.to_translation()
        idle[pb.name] = (q.copy(), l.copy())
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        q, l = idle[pb.name]
        base = pb.name.rsplit(".", 1)[0] if pb.name.endswith((".L", ".R")) else pb.name
        stem = pb.name[:-2] if pb.name.endswith((".L", ".R")) else pb.name
        if stem in ARM_BONES:
            q = Quaternion((1, 0, 0, 0)).slerp(q, s)
        pb.rotation_quaternion = q
        pb.location = l
    bpy.context.view_layer.update()

def bone_matrices(arm):
    """Per-bone 4x4 (armature space) mapping rest -> current pose."""
    out = {}
    for pb in arm.pose.bones:
        B = pb.matrix @ pb.bone.matrix_local.inverted()
        out[pb.name] = np.array(B)
    return out

def weights_from_object(ob, bone_names):
    """Dense (n_verts, n_bones) weight matrix from vertex groups named like bones."""
    idx = {n: i for i, n in enumerate(bone_names)}
    gname = {g.index: g.name for g in ob.vertex_groups}
    W = np.zeros((len(ob.data.vertices), len(bone_names)))
    for v in ob.data.vertices:
        for g in v.groups:
            n = gname[g.group]
            if n in idx: W[v.index, idx[n]] = g.weight
    return W

def lbs_matrices(W, B, bone_names):
    Bs = np.stack([B[n] for n in bone_names])  # (nb,4,4)
    s = W.sum(1, keepdims=True); s[s == 0] = 1
    return np.einsum("vb,bij->vij", W / s, Bs)

def apply_lbs(M, v):
    h = np.concatenate([v, np.ones((len(v), 1))], 1)
    return np.einsum("vij,vj->vi", M, h)[:, :3]

def invert_lbs(M, v):
    Mi = np.linalg.inv(M)
    return apply_lbs(Mi, v)
