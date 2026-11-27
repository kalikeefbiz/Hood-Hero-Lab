import bpy, math
from mathutils import Vector

def setup_scene(res=900):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = res; sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sh = sc.display.shading
    sh.light = "STUDIO"; sh.color_type = "OBJECT"; sh.show_cavity = True
    sh.cavity_ridge_factor = 0.8; sh.cavity_valley_factor = 1.0
    sc.display.render_aa = "8"
    w = bpy.data.worlds.get("W") or bpy.data.worlds.new("W")
    sc.world = w; w.color = (0.25,0.27,0.32)
    return sc

def shoot(path, target, dist, yaw_deg, pitch_deg=5, focal=70, hide=(), colors=None):
    sc = bpy.context.scene
    cam = bpy.data.objects.get("RCAM")
    if cam is None:
        cd = bpy.data.cameras.new("RCAM"); cam = bpy.data.objects.new("RCAM", cd); sc.collection.objects.link(cam)
    cam.data.lens = focal
    yaw = math.radians(yaw_deg); pit = math.radians(pitch_deg)
    # front of the character is -Y; yaw 0 = camera in front
    pos = Vector((target[0] + dist*math.sin(yaw)*math.cos(pit), target[1] - dist*math.cos(yaw)*math.cos(pit), target[2] + dist*math.sin(pit)))
    cam.location = pos
    d = Vector(target) - pos
    cam.rotation_euler = d.to_track_quat("-Z","Y").to_euler()
    sc.camera = cam
    for o in bpy.data.objects:
        if o.type=="MESH" and o.name in hide: o.hide_render = True
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
