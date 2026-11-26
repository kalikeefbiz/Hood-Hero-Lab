"""Shared helpers for the wardrobe pipeline (Blender 5.3 via the bpy module)."""
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

SRC = "/home/claude/hood-hero-lab/art/incoming/protagonist-male-rework/source/protagonist-male-rework_source.blend"

def open_source():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    arm = bpy.data.objects["GAME_RIG_Body"]
    body = bpy.data.objects["Body"]
    return arm, body

def set_pose(arm, action="Idle", frame=1):
    act = bpy.data.actions[action]
    arm.animation_data_create(); arm.animation_data.action = act
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()

def eval_verts(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    e = ob.evaluated_get(dg)
    me = e.to_mesh()
    n = len(me.vertices)
    co = np.empty(n*3); me.vertices.foreach_get("co", co)
    e.to_mesh_clear()
    return co.reshape(-1,3)

def mesh_arrays(me):
    n=len(me.vertices); co=np.empty(n*3); me.vertices.foreach_get("co",co)
    return co.reshape(-1,3)

def new_obj_from_arrays(name, verts, faces, collection=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob

def bvh_from_object(ob, world=True):
    dg = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(ob, dg)
