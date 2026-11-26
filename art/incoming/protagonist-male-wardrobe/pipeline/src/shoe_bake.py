import sys; sys.path.insert(0,"/home/claude/work/pipe")
from posing import *
import bpy, bmesh
RES=2048
bpy.ops.wm.open_mainfile(filepath="/home/claude/work/shoe_uv.blend")
arm=[o for o in bpy.data.objects if o.type=="ARMATURE"][0]; shoe=bpy.data.objects["court-sneakers-white"]
body=[o for o in bpy.data.objects if o.type=="MESH" and o is not shoe][0]
a_pose(arm,0.63); dg=bpy.context.evaluated_depsgraph_get()
me=bpy.data.meshes.new_from_object(shoe.evaluated_get(dg)); low=bpy.data.objects.new("LOW",me); bpy.context.scene.collection.objects.link(low)
nL=len(me.polygons)//2
bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bmesh.ops.delete(bm,geom=[bm.faces[i] for i in range(nL,len(bm.faces))],context="FACES"); bm.to_mesh(me); bm.free()
shoe.hide_render=True; body.hide_render=True
sc=bpy.context.scene; sc.render.engine="CYCLES"; sc.cycles.device="CPU"; sc.render.bake.margin=8
if sc.world is None: sc.world=bpy.data.worlds.new("W")
sc.world.light_settings.distance=0.05
mat=bpy.data.materials.new("B"); mat.use_nodes=True; me.materials.append(mat); nt=mat.node_tree; tex=nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active=tex
for o in bpy.data.objects: o.select_set(False)
low.select_set(True); bpy.context.view_layer.objects.active=low
def img(n,fl): i=bpy.data.images.new(n,RES,RES,float_buffer=fl); i.colorspace_settings.name="Non-Color"; return i
sc.cycles.samples=64; a=img("ao",False); tex.image=a; bpy.ops.object.bake(type="AO",margin=8)
a.filepath_raw="/home/claude/work/bake/shoe_ao.png"; a.file_format="PNG"; a.save()
for n in list(nt.nodes):
    if n.type=="BSDF_PRINCIPLED": nt.nodes.remove(n)
geo=nt.nodes.new("ShaderNodeNewGeometry"); em=nt.nodes.new("ShaderNodeEmission"); out=[n for n in nt.nodes if n.type=="OUTPUT_MATERIAL"][0]
nt.links.new(em.outputs["Emission"],out.inputs["Surface"]); sc.cycles.samples=1
for sock,fn in (("Position","shoe_pos.exr"),("Normal","shoe_wn.exr")):
    nt.links.new(geo.outputs[sock],em.inputs["Color"]); i=img(sock,True); tex.image=i; bpy.ops.object.bake(type="EMIT",margin=8)
    i.filepath_raw="/home/claude/work/bake/"+fn; i.file_format="OPEN_EXR"; i.save()
print("shoe bakes done")
