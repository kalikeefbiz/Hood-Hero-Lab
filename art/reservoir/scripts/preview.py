"""Preview renders sized to the building: python preview.py -- file.blend out_prefix"""
import bpy, sys, math
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0]); out = args[1]
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 32; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 900, 620
sc.view_settings.view_transform = "AgX"
ob = [o for o in sc.objects if o.type == "MESH"][0]
xs = [(ob.matrix_world @ Vector(c)).x for c in ob.bound_box]
zs = [(ob.matrix_world @ Vector(c)).z for c in ob.bound_box]
w, h = max(xs) - min(xs), max(zs)
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 5, -0.001)); g = bpy.context.object
m = bpy.data.materials.new("G"); m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.25, 0.23, 0.22, 1); g.data.materials.append(m)
world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.65, 0.85, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.2; sun.color = (1, 0.9, 0.75)
o = bpy.data.objects.new("sun", sun); o.rotation_euler = (math.radians(55), 0, math.radians(-38)); sc.collection.objects.link(o)
cam = bpy.data.cameras.new("c"); cam.lens = 30
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
k = max(w, h * 1.4) / 8.0
for name, eye, tgt in (("q34", (9.0 * k, -10.0 * k, 3.0 * k), (0.8 * k, 3.0 * k, h * 0.5)),
                       ("street", (-w * 0.55 - 1.0, -3.6, 1.65), (w * 0.15, 0.0, h * 0.45))):
    co.location = eye
    co.rotation_euler = (Vector(tgt) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{out}_{name}.png"; bpy.ops.render.render(write_still=True)
