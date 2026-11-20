import sys; sys.path.insert(0,'/home/claude/scripts')
from common import *
walk,run,out=sys.argv[-3],sys.argv[-2],sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=walk)
with bpy.data.libraries.load(run) as (src,dst): dst.actions=['Run']
ao=bpy.data.objects['QuannyRig']
for a in bpy.data.actions: a.use_fake_user=True; print('action',a.name,tuple(a.frame_range))
ao.animation_data.action=bpy.data.actions['Walk']
try: bpy.ops.file.pack_all()
except Exception: pass
bpy.ops.wm.save_as_mainfile(filepath=out,compress=True)
