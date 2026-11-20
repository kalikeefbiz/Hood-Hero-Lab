import sys, time; sys.path.insert(0,'/home/claude/scripts')
from common import *
src,out=sys.argv[-2],sys.argv[-1]
reset(); bpy.ops.import_scene.gltf(filepath=src)
body=[o for o in bpy.data.objects if o.type=='MESH'][0]; body.name='Quanny'; body.data.name='Quanny'
# put feet on ground
body.location.z+=0.9517
bpy.context.view_layer.objects.active=body; body.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for o in list(bpy.data.objects):
    if o!=body: bpy.data.objects.remove(o)
V=mathutils.Vector
B={ # name: (head, tail, parent)
 'Root':((0,0,0),(0,0.15,0),None),
 'Hips':((0,0.03,0.97),(0,0.035,1.08),'Root'),
 'Spine':((0,0.035,1.08),(0,0.04,1.22),'Hips'),
 'Spine1':((0,0.04,1.22),(0,0.045,1.37),'Spine'),
 'Spine2':((0,0.045,1.37),(0,0.04,1.58),'Spine1'),
 'Neck':((0,0.04,1.58),(0,0.03,1.69),'Spine2'),
 'Head':((0,0.03,1.69),(0,0.03,1.90),'Neck'),
 'Bandana':((0.11,-0.15,1.02),(0.13,-0.16,0.70),'Hips'),
}
for s,sg in (('Left',1),('Right',-1)):
    def X(p): return (p[0]*sg,p[1],p[2])
    P=s
    B.update({
     P+'Shoulder':(X((0.04,0.0,1.56)),X((0.19,0.015,1.535)),'Spine2'),
     P+'Arm':(X((0.19,0.015,1.535)),X((0.455,0.025,1.53)),P+'Shoulder'),
     P+'ForeArm':(X((0.455,0.025,1.53)),X((0.59,0.015,1.525)),P+'Arm'),
     P+'Hand':(X((0.59,0.015,1.525)),X((0.70,0.017,1.525)),P+'ForeArm'),
     P+'HandFingers1':(X((0.70,0.017,1.525)),X((0.735,0.017,1.523)),P+'Hand'),
     P+'HandFingers2':(X((0.735,0.017,1.523)),X((0.77,0.017,1.52)),P+'HandFingers1'),
     P+'HandThumb1':(X((0.615,-0.005,1.51)),X((0.66,-0.015,1.505)),P+'Hand'),
     P+'HandThumb2':(X((0.66,-0.015,1.505)),X((0.70,-0.02,1.50)),P+'HandThumb1'),
     P+'UpLeg':(X((0.10,0.03,0.97)),X((0.14,0.01,0.53)),'Hips'),
     P+'Leg':(X((0.14,0.01,0.53)),X((0.19,0.04,0.10)),P+'UpLeg'),
     P+'Foot':(X((0.19,0.04,0.10)),X((0.20,-0.10,0.025)),P+'Leg'),
     P+'ToeBase':(X((0.20,-0.10,0.025)),X((0.20,-0.21,0.025)),P+'Foot'),
    })
arm=bpy.data.armatures.new('QuannyRig'); ao=bpy.data.objects.new('QuannyRig',arm)
bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t,p) in B.items():
    e=arm.edit_bones.new(n); e.head=h; e.tail=t
for n,(h,t,p) in B.items():
    e=arm.edit_bones[n]
    if p:
        e.parent=arm.edit_bones[p]
        e.use_connect=(V(arm.edit_bones[p].tail)-V(h)).length<1e-4 and n not in('LeftShoulder','RightShoulder')
# consistent rolls: legs/spine local X = world +X ; arms: local Z up
for e in arm.edit_bones:
    e.align_roll(V((0,0,1)) if abs(e.vector.normalized().z)<0.7 else V((0,-1,0)))
arm.edit_bones['Root'].use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
# --- proxy for heat weights
proxy=body.copy(); proxy.data=body.data.copy(); bpy.context.scene.collection.objects.link(proxy)
m=proxy.modifiers.new('r','REMESH'); m.mode='VOXEL'; m.voxel_size=0.009
bpy.context.view_layer.objects.active=proxy; bpy.ops.object.modifier_apply(modifier='r')
print('proxy verts',len(proxy.data.vertices))
for o in bpy.data.objects: o.select_set(False)
proxy.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
t=time.time(); bpy.ops.object.parent_set(type='ARMATURE_AUTO'); print('heat s',time.time()-t)
print('proxy groups',len(proxy.vertex_groups))
empty=sum(1 for v in proxy.data.vertices if not v.groups); print('unweighted proxy verts',empty)
# transfer to body
for n in B:
    if n!='Root': body.vertex_groups.new(name=n)
dt=body.modifiers.new('dt','DATA_TRANSFER'); dt.object=proxy
dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
bpy.context.view_layer.objects.active=body; bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(proxy)
body.parent=ao; mod=body.modifiers.new('Armature','ARMATURE'); mod.object=ao
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved')
