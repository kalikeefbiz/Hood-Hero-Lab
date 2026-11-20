import bpy, math, mathutils
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
def setup_render(res=512, samples=16):
    s=bpy.context.scene
    s.render.engine='CYCLES'; s.cycles.device='CPU'; s.cycles.samples=samples
    s.cycles.use_denoising=False
    s.render.resolution_x=res; s.render.resolution_y=res
    w=bpy.data.worlds.new('w'); s.world=w; w.use_nodes=True
    w.node_tree.nodes['Background'].inputs[0].default_value=(0.8,0.8,0.82,1)
    w.node_tree.nodes['Background'].inputs[1].default_value=1.0
    sun=bpy.data.lights.new('sun','SUN'); sun.energy=3
    o=bpy.data.objects.new('sun',sun); s.collection.objects.link(o); o.rotation_euler=(math.radians(50),0,math.radians(30))
def bounds(objs):
    mn=mathutils.Vector((1e9,)*3); mx=-mn
    for o in objs:
        if o.type!='MESH': continue
        for c in o.bound_box:
            v=o.matrix_world@mathutils.Vector(c)
            mn=mathutils.Vector(map(min,mn,v)); mx=mathutils.Vector(map(max,mx,v))
    return mn,mx
def cam(name, center, dist, az_deg, el_deg=5, ortho=None):
    s=bpy.context.scene
    c=bpy.data.cameras.new(name)
    if ortho: c.type='ORTHO'; c.ortho_scale=ortho
    o=bpy.data.objects.new(name,c); s.collection.objects.link(o)
    az=math.radians(az_deg); el=math.radians(el_deg)
    o.location=center+mathutils.Vector((math.sin(az)*math.cos(el)*dist,-math.cos(az)*math.cos(el)*dist,math.sin(el)*dist))
    d=center-o.location; o.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    return o
def render(camobj, path):
    s=bpy.context.scene; s.camera=camobj; s.render.filepath=path
    bpy.ops.render.render(write_still=True)
