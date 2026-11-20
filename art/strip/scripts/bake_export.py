"""Bake ambient occlusion into a second UV set and export an optimized GLB.

python bake_export.py -- in.blend out.glb [ao_size] [samples]
"""
import bpy, sys, os
args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
size = int(args[2]) if len(args) > 2 else 1024
samples = int(args[3]) if len(args) > 3 else 96
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = samples
sc.cycles.device = "CPU"
SKIP_AO = ("Decal", "Bulb", "Glass", "Leaves", "Fence", "Wire")

def ensure_gltf_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    if hasattr(g, "interface"):
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    else:
        g.inputs.new("NodeSocketFloat", "Occlusion")
    g.nodes.new("NodeGroupInput")
    return g

group = ensure_gltf_group()
objs = [o for o in sc.objects if o.type == "MESH" and o.name != "Ground"]
for ob in objs:
    if "Decal" in ob.name or "Foliage" in ob.name:
        continue
    for o in objs:
        o.hide_render = ("Decal" in o.name)
    me = ob.data
    if "Lightmap" not in me.uv_layers:
        me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = me.uv_layers["Lightmap"]
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.new(ob.name + "_AO", size, size, alpha=False)
    img.generated_color = (1, 1, 1, 1)
    nodes_added = []
    for slot in ob.material_slots:
        m = slot.material
        nt = m.node_tree
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "Lightmap"
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.name = "AO_BAKE"
        t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.nodes.active = t
        nodes_added.append((m, t))
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    sc.render.bake.margin = 6
    me.uv_layers.active = me.uv_layers["Lightmap"]
    bpy.ops.object.bake(type="AO")
    me.uv_layers.active = me.uv_layers[0]
    me.uv_layers[0].active_render = True
    # soften + lift so AO reads as contact shadow, not grime
    px = list(img.pixels)
    print("AO_RAW_MEAN", sum(px[0::4]) / (len(px) // 4))
    for i in range(0, len(px), 4):
        v = px[i]
        v = 0.25 + 0.75 * v
        px[i] = px[i + 1] = px[i + 2] = v
    img.pixels = px
    img.filepath_raw = os.path.join(os.path.dirname(out), ob.name + "_ao.png")
    img.file_format = "PNG"; img.save()
    for m, t in nodes_added:
        nt = m.node_tree
        if any(s in m.name for s in SKIP_AO):
            nt.nodes.remove(t); continue
        gn = nt.nodes.new("ShaderNodeGroup"); gn.node_tree = group
        nt.links.new(t.outputs["Color"], gn.inputs[0])

for o in objs:
    o.hide_render = False
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB", use_selection=False,
    export_image_format="AUTO",
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials="EXPORT", export_apply=True, export_yup=True,
)
print("EXPORTED", out)
