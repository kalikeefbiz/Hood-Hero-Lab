"""Render garment(s) skinned by LBS on the animated, masked body. args: out act frame cams... ; garments from GARMENTS env (npz:mask pairs)"""
import sys, os; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
from render_util import *
import bpy, bmesh, json
out,act,fr=sys.argv[1],sys.argv[2],int(sys.argv[3]); cams=json.loads(sys.argv[4])
pairs=[g.split(":") for g in os.environ["GARMENTS"].split(",")]
arm,body=open_source()
for o in bpy.data.objects:
    if o.type=="MESH" and o!=body: o.hide_render=True
hid=np.zeros(len(body.data.polygons),bool)
for npz,mask in pairs: hid|=np.load(mask)
me=body.data; bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i] for i in np.where(hid)[0]],context="FACES_ONLY"); bm.to_mesh(me); bm.free()
set_pose(arm,act,fr); B=bone_matrices(arm)
cols=[(0.93,0.93,0.91,1),(0.25,0.35,0.55,1),(0.95,0.95,0.95,1)]
for k,(npz,mask) in enumerate(pairs):
    d=np.load(npz,allow_pickle=True); bones=list(d["bones"])
    G=apply_lbs(lbs_matrices(d["W"],B,bones),d["VT"]); F=[tuple(int(x) for x in f if x>=0) for f in d["F"]]
    ob=new_obj_from_arrays(f"G{k}",G,F); ob.color=cols[k%3]
    for p in ob.data.polygons: p.use_smooth=True
sc=setup_scene(700); sc.display.shading.show_backface_culling=False; body.color=(0.55,0.38,0.3,1)
for i,c in enumerate(cams): shoot(f"{out}_{i}.png",tuple(c[0]),c[1],c[2],c[3],c[4] if len(c)>4 else 60)
