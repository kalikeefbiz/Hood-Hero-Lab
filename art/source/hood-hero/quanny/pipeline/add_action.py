import sys; sys.path.insert(0,'/home/claude/scripts')
from common import *
base,src,name,out=sys.argv[-4],sys.argv[-3],sys.argv[-2],sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=base)
with bpy.data.libraries.load(src) as (a,b): b.actions=[name]
for x in bpy.data.actions: x.use_fake_user=True; print('action',x.name)
try: bpy.ops.file.pack_all()
except Exception: pass
bpy.ops.wm.save_as_mainfile(filepath=out,compress=True)
