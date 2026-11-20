import sys; sys.path.insert(0,'/home/claude/scripts')
from common import *
src,outdir,mode=sys.argv[-3],sys.argv[-2],sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
ao=bpy.data.objects['QuannyRig']; body=bpy.data.objects['Quanny']
s=bpy.context.scene; act=ao.animation_data.action; NF=int(act.frame_range[1])
s.frame_start=0; s.frame_end=NF; s.render.fps=30
for o in bpy.data.objects: o.select_set(False)
common=dict(export_format='GLB',export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
if mode=='model':
    s.frame_set(0); ao.animation_data.action=None
    for pb in ao.pose.bones: pb.matrix_basis=mathutils.Matrix()
    bpy.ops.export_scene.gltf(filepath=f'{outdir}/quanny.glb',export_animations=False,export_skins=True,**common)
else:
    ao.select_set(True); bpy.context.view_layer.objects.active=ao
    bpy.ops.export_scene.gltf(filepath=f'{outdir}/quanny-{mode}.glb',use_selection=True,export_animations=True,
        export_animation_mode='ACTIONS',export_frame_range=True,export_force_sampling=True,**common)
print('ok',mode)
