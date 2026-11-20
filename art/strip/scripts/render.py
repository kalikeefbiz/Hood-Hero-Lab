"""Preview renders: python render.py -- file.blend out_prefix [night]"""
import bpy, sys, math
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
blend, out = args[0], args[1]
night = len(args) > 2 and args[2] == "night"
views = args[3].split(",") if len(args) > 3 else ["q34", "front", "side"]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 48
sc.cycles.use_denoising = True
try:
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
sc.render.resolution_x, sc.render.resolution_y = 1100, 800
sc.view_settings.view_transform = "AgX"
# ground
if "Ground" not in bpy.data.objects:
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 5, -0.001))
    g = bpy.context.object; g.name = "Ground"
    m = bpy.data.materials.new("G"); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.25, 0.23, 0.22, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    g.data.materials.append(m)
world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]
if night:
    bg.inputs["Color"].default_value = (0.012, 0.014, 0.03, 1); bg.inputs["Strength"].default_value = 1.0
    for m in bpy.data.materials:
        if m.name in ("LJ_Facade", "LJ_Window"):
            m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 2.5 if m.name == "LJ_Window" else 1.5
    for loc, e, col in (((0, -0.9, 4.4), 120, (1, 0.8, 0.55)), ((4.6, 4.6, 3.8), 80, (1, 0.75, 0.45)), ((-1, -3, 2.0), 40, (0.7, 0.75, 1))):
        L = bpy.data.lights.new("p", "POINT"); L.energy = e; L.color = col; L.shadow_soft_size = 0.2
        o = bpy.data.objects.new("p", L); o.location = loc; sc.collection.objects.link(o)
    moon = bpy.data.lights.new("moon", "SUN"); moon.energy = 0.25; moon.color = (0.55, 0.62, 1.0)
    o = bpy.data.objects.new("moon", moon); o.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(o)
else:
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "HOSEK_WILKIE"
    except Exception:
        pass
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.35
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.2; sun.color = (1, 0.88, 0.72); sun.angle = math.radians(2)
    o = bpy.data.objects.new("sun", sun); o.rotation_euler = (math.radians(58), 0, math.radians(-42)); sc.collection.objects.link(o)
cam = bpy.data.cameras.new("c"); cam.lens = 30
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
def look(eye, target):
    co.location = eye
    d = Vector(target) - Vector(eye)
    co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
V = {
    "q34": ((9.5, -10.5, 3.2), (1.0, 3.0, 2.3)),
    "front": ((0.0, -11.0, 2.4), (0.0, 0.0, 2.5)),
    "side": ((14.0, 2.0, 2.2), (4.0, 5.0, 2.3)),
    "street": ((-2.2, -3.2, 1.65), (1.0, 0.0, 1.9)),
    "roof": ((-6, -9, 9), (0, 4, 4)),
}
for v in views:
    look(*V[v])
    sc.render.filepath = f"{out}_{v}{'_night' if night else ''}.png"
    bpy.ops.render.render(write_still=True)
