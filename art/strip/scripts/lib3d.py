"""Small procedural-mesh toolkit shared by the strip asset scripts (Blender 5.x)."""
import bpy, bmesh, math, os
from mathutils import Vector

TEX = "/tmp/lj/tex"


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


_images = {}


def img(name, colorspace="sRGB"):
    key = (name, colorspace)
    if key not in _images:
        i = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
        i.colorspace_settings.name = colorspace
        _images[key] = i
    return _images[key]


def material(name, base=None, color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0, normal=None,
             emissive=None, emit_strength=1.0, emit_color=None, alpha=False, tint=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if base:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(base)
        if tint:
            mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs["B"].default_value = (*tint, 1)
            nt.links.new(t.outputs["Color"], mix.inputs["A"])
            nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
            if hasattr(m, "surface_render_method"):
                m.surface_render_method = "DITHERED"
    else:
        p.inputs["Base Color"].default_value = (*color, 1)
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(normal, "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    if emissive:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(emissive)
        nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = emit_strength
    elif emit_color:
        p.inputs["Emission Color"].default_value = (*emit_color, 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    return m


class Builder:
    """Collects faces per object, each face tagged with a material key."""

    def __init__(self, mats):
        self.mats = mats              # key -> bpy material
        self.order = list(mats)
        self.parts = {}               # object name -> (bm, uvlayer)
        self.target = None

    def use(self, name):
        if name not in self.parts:
            b = bmesh.new()
            self.parts[name] = (b, b.loops.layers.uv.new("UVMap"))
        self.target = name

    def face(self, pts, mat, uvs):
        b, layer = self.parts[self.target]
        vs = [b.verts.new(p) for p in pts]
        f = b.faces.new(vs)
        f.material_index = self.order.index(mat)
        for loop, t in zip(f.loops, uvs):
            loop[layer].uv = t
        return f

    # planar tiling UVs by dominant axis
    @staticmethod
    def tuv(p, n, tile):
        x, y, z = p
        ax = max(range(3), key=lambda i: abs(n[i]))
        sx, sy = tile
        if ax == 0:
            return ((y if n[0] > 0 else -y) / sx, z / sy)
        if ax == 1:
            return ((-x if n[1] > 0 else x) / sx, z / sy)
        return (x / sx, y / sy)

    def quad(self, a, b, c, d, mat, tile=(2.0, 2.0), uvs=None):
        pts = [a, b, c, d]
        if uvs is None:
            n = (Vector(b) - Vector(a)).cross(Vector(d) - Vector(a)).normalized()
            uvs = [self.tuv(p, n, tile) for p in pts]
        return self.face(pts, mat, uvs)

    def poly(self, pts, mat, tile=(2.0, 2.0)):
        n = (Vector(pts[1]) - Vector(pts[0])).cross(Vector(pts[-1]) - Vector(pts[0])).normalized()
        return self.face(pts, mat, [self.tuv(p, n, tile) for p in pts])

    def box(self, x0, x1, y0, y1, z0, z1, mat, tile=(1.0, 1.0), skip=(), mats=None):
        mats = mats or {}
        F = {
            "front": ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)),
            "back": ((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)),
            "left": ((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)),
            "right": ((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)),
            "top": ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)),
            "bottom": ((x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)),
        }
        for k, pts in F.items():
            if k in skip:
                continue
            self.quad(*pts, mats.get(k, mat), tile)

    def obox(self, center, size, yaw, mat, tile=(1.0, 1.0)):
        """Oriented box (yaw around Z) for props."""
        cx, cy, cz = center; sx, sy, sz = size
        c, s = math.cos(yaw), math.sin(yaw)
        def P(x, y, z):
            return (cx + x * c - y * s, cy + x * s + y * c, cz + z)
        hx, hy = sx / 2, sy / 2
        v = [P(-hx, -hy, 0), P(hx, -hy, 0), P(hx, hy, 0), P(-hx, hy, 0),
             P(-hx, -hy, sz), P(hx, -hy, sz), P(hx, hy, sz), P(-hx, hy, sz)]
        for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)):
            self.poly([v[i] for i in f], mat, tile)

    def cyl(self, p0, p1, r, mat, seg=8, caps=True, r1=None):
        r1 = r if r1 is None else r1
        p0, p1 = Vector(p0), Vector(p1)
        axis = (p1 - p0).normalized()
        ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(ref).normalized(); v = axis.cross(u)
        ring = lambda c, rr: [c + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * rr for i in range(seg)]
        a, b = ring(p0, r), ring(p1, r1)
        L = (p1 - p0).length
        for i in range(seg):
            j = (i + 1) % seg
            self.face([a[i], a[j], b[j], b[i]], mat,
                      [(i / seg, 0), ((i + 1) / seg, 0), ((i + 1) / seg, L), (i / seg, L)])
        if caps:
            self.face(list(reversed(a)), mat, [(0.5, 0.5)] * seg)
            self.face(b, mat, [(0.5, 0.5)] * seg)

    def finish(self, offset=(0, 0, 0)):
        out = []
        for name, (b, _) in self.parts.items():
            me = bpy.data.meshes.new(name)
            b.normal_update()
            bmesh.ops.remove_doubles(b, verts=b.verts, dist=0.0003)
            b.to_mesh(me); b.free()
            for k in self.order:
                me.materials.append(self.mats[k])
            ob = bpy.data.objects.new(name, me)
            bpy.context.scene.collection.objects.link(ob)
            ob.location = offset
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.transform_apply(location=True)
            bpy.ops.object.shade_smooth_by_angle(angle=0.55)
            used = {p.material_index for p in me.polygons}
            for i in reversed(range(len(me.materials))):
                if i not in used:
                    ob.active_material_index = i
                    bpy.ops.object.material_slot_remove()
            print("OBJ", name, "TRIS", sum(len(p.vertices) - 2 for p in me.polygons))
            out.append(ob)
        return out
