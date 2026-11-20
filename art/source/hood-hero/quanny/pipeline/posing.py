import bpy, math, mathutils
from mathutils import Quaternion, Vector, Euler
def D(x=0,y=0,z=0,order='XYZ'):
    return Euler((math.radians(x),math.radians(y),math.radians(z)),order).to_quaternion()
def set_delta(ao,name,q):
    """q: rotation relative to parent, expressed in armature rest axes."""
    pb=ao.pose.bones[name]; R=pb.bone.matrix_local.to_quaternion()
    pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=R.inverted()@q@R
def set_loc(ao,name,v):
    pb=ao.pose.bones[name]; R=pb.bone.matrix_local.to_3x3()
    pb.location=R.inverted()@Vector(v)
