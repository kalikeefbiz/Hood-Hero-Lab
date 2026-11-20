"""Lil Jay's Market — procedural hero building for Hood Hero.

Blender coords: X along the storefront (0..8 m), Y into the building
(front face at y=0, back at y=DEPTH), Z up. Front faces look toward -Y.
Facade texture is the user's front-view art, projected 1:1 (171 px/m).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/lj/out"
TEX = "/tmp/lj/tex"
W, DEPTH, H = 8.0, 10.0, 4.89          # wall width, depth, wall top
PPM, OX, OY, S = 171.0, 44.0, 50.0, 2048 / 1376  # px/m, crop offset, atlas scale

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- materials
def img(name, colorspace="sRGB"):
    i = bpy.data.images.load(os.path.join(TEX, name))
    i.colorspace_settings.name = colorspace
    return i

def material(name, base=None, color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0,
             normal=None, emissive=None, alpha=False, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if base:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(base)
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
            if hasattr(m, "surface_render_method"):
                m.surface_render_method = "BLENDED"
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
    return m

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

MATS = {
    "facade": material("LJ_Facade", "atlas_albedo.png", rough=0.85, emissive="atlas_emissive.png", emit_strength=0.0),
    "window": material("LJ_Window", "atlas_albedo.png", rough=0.12, emissive="atlas_emissive.png", emit_strength=0.0),
    "brick": material("LJ_Brick", "brick_albedo.png", rough=0.9, normal="brick_normal.png"),
    "concrete": material("LJ_Concrete", "concrete_albedo.png", rough=0.95, normal="concrete_normal.png"),
    "roof": material("LJ_Roof", "roof_albedo.png", rough=0.95),
    "metal": material("LJ_DarkMetal", color=srgb("26292c"), rough=0.45, metal=0.7),
    "galv": material("LJ_Galvanized", color=srgb("8f9294"), rough=0.4, metal=0.85),
    "fabric": material("LJ_AwningUnder", color=srgb("4a1c1e"), rough=0.9),
    "decal": material("LJ_Decal", "atlas_albedo.png", rough=0.85, alpha=True),
    "glassdark": material("LJ_SideGlass", color=srgb("1b2226"), rough=0.08, metal=0.2),
    "bulb": material("LJ_Bulb", color=srgb("ffe2a8"), rough=0.3),
}
for k in ("bulb",):
    p = MATS[k].node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (1.0, 0.8, 0.5, 1)
    p.inputs["Emission Strength"].default_value = 4.0
ORDER = list(MATS)

# ---------------------------------------------------------------- builder
bm_main = bmesh.new()
bm_dec = bmesh.new()
uv = bm_main.loops.layers.uv.new("UVMap")
uv_dec = bm_dec.loops.layers.uv.new("UVMap")
bm = bm_main

def atlas_uv(ax, ay):
    return (ax / 2048.0, 1.0 - ay / 2048.0)

def facade_uv(x, z):
    """World point on the storefront -> atlas UV (front-view projection)."""
    px = 48 + x * PPM
    py = 925 - z * PPM
    return atlas_uv((px - OX) * S, (py - OY) * S)

def tile_uv(u, v, sx=1.68, sy=1.65):
    return (u / sx, v / sy)

def face(pts, mat, uvs):
    b, layer = (bm_dec, uv_dec) if mat == "decal" else (bm_main, uv)
    vs = [b.verts.new(p) for p in pts]
    f = b.faces.new(vs)
    f.material_index = ORDER.index(mat)
    for loop, t in zip(f.loops, uvs):
        loop[layer].uv = t
    return f

def auto_uv(p, n, mode, tile=(1.68, 1.65)):
    x, y, z = p
    if mode == "facade":
        return facade_uv(x, z)
    ax = max(range(3), key=lambda i: abs(n[i]))
    if ax == 0:   # faces +-X: u along Y
        return tile_uv(y, z, *tile)
    if ax == 1:   # faces +-Y: u along X
        return tile_uv(x, z, *tile)
    return tile_uv(x, y, *tile)

def quad(a, b, c, d, mat, mode="tile", tile=(1.68, 1.65)):
    n = (Vector(b) - Vector(a)).cross(Vector(c) - Vector(a)).normalized()
    pts = [a, b, c, d]
    return face(pts, mat, [auto_uv(p, n, mode, tile) for p in pts])

def box(x0, x1, y0, y1, z0, z1, mat, front=None, skip=(), tile=(1.68, 1.65), front_mode="facade"):
    """Axis box. `front` material/mode is used for the -Y face."""
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
        if k == "front" and front:
            quad(*pts, front, front_mode)
        else:
            quad(*pts, mat, "tile", tile)

def cyl(p0, p1, r, mat, seg=8, caps=True):
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized(); v = axis.cross(u)
    ring = lambda c: [c + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r for i in range(seg)]
    a, b = ring(p0), ring(p1)
    L = (p1 - p0).length
    for i in range(seg):
        j = (i + 1) % seg
        face([a[i], a[j], b[j], b[i]], mat, [(i / seg, 0), ((i + 1) / seg, 0), ((i + 1) / seg, L), (i / seg, L)])
    if caps:
        face(list(reversed(a)), mat, [(0, 0)] * seg)
        face(b, mat, [(0, 0)] * seg)

# ---------------------------------------------------------------- facade
X = lambda px: (px - 48) / PPM
Z = lambda py: (925 - py) / PPM
PL0, PL1 = 0.0, X(180)        # left pilaster
PR0, PR1 = X(1285), W         # right pilaster
WIN_Z0, WIN_Z1 = Z(790), Z(492)
WL = (X(180), X(600)); WR = (X(862), X(1285))
DB = (X(600), X(862)); DOOR = (X(630), X(830)); DOOR_Z1 = Z(545); TRANS_Z1 = Z(495)
REC = 0.24                    # window recess
CORN_Z0, CORN_Z1 = Z(118), Z(88)

# pilasters (protrude 6 cm)
for x0, x1 in ((PL0, PL1), (PR0, PR1)):
    box(x0, x1, -0.06, 0.0, 0.0, Z(135), "brick", front="facade", skip=("back",))
# caps on pilasters
for x0, x1 in ((X(45), X(195)), (X(1265), X(1418))):
    box(x0, x1, -0.13, 0.32, Z(135), Z(55), "concrete", front="facade")
# wall between pilasters, excluding openings
def wall_rect(x0, x1, z0, z1):
    quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1), "facade", "facade")
wall_rect(PL1, PR0, WIN_Z1, CORN_Z0)                   # above windows
wall_rect(PL1, DOOR[0], 0.0, WIN_Z0)
wall_rect(DOOR[1], PR0, 0.0, WIN_Z0)
# door bay piers between window and door (above sill height)
wall_rect(WL[1], DOOR[0], WIN_Z0, WIN_Z1)
wall_rect(DOOR[1], WR[0], WIN_Z0, WIN_Z1)
# transom strip above door
wall_rect(DOOR[0], DOOR[1], DOOR_Z1, WIN_Z1)

def opening(x0, x1, z0, z1, depth, back_mat="window"):
    # reveals
    quad((x0, 0, z0), (x0, depth, z0), (x0, depth, z1), (x0, 0, z1), "metal")
    quad((x1, depth, z0), (x1, 0, z0), (x1, 0, z1), (x1, depth, z1), "metal")
    quad((x0, 0, z1), (x1, 0, z1), (x1, depth, z1), (x0, depth, z1), "metal")
    quad((x0, depth, z0), (x1, depth, z0), (x1, 0, z0), (x0, 0, z0), "concrete")
    # interior picture plane
    quad((x0, depth, z0), (x1, depth, z0), (x1, depth, z1), (x0, depth, z1), back_mat, "facade")

for x0, x1 in (WL, WR):
    opening(x0 + 0.02, x1 - 0.02, WIN_Z0, WIN_Z1, REC)
opening(DOOR[0], DOOR[1], 0.0, DOOR_Z1, 0.18)

# sills (concrete ledge)
for x0, x1 in (WL, WR):
    box(x0 - 0.04, x1 + 0.04, -0.07, 0.02, WIN_Z0 - 0.06, WIN_Z0, "concrete", front="facade")

# window bars: verticals every ~15 cm, two rails, frame
def bars(x0, x1, z0, z1, y=-0.025, spacing=0.152):
    n = int((x1 - x0) / spacing)
    sp = (x1 - x0) / n
    for i in range(1, n):
        x = x0 + i * sp
        cyl((x, y, z0), (x, y, z1), 0.011, "metal", 6, caps=False)
    for z in (z0 + 0.06, z0 + (z1 - z0) * 0.86, z1 - 0.04):
        box(x0, x1, y - 0.012, y + 0.012, z - 0.012, z + 0.012, "metal", front="metal", front_mode="tile")
    for x in (x0, x1):
        box(x - 0.015, x + 0.015, y - 0.015, y + 0.015, z0, z1, "metal", front="metal", front_mode="tile")
for x0, x1 in (WL, WR):
    bars(x0 + 0.06, x1 - 0.06, WIN_Z0 + 0.02, WIN_Z1 - 0.02)
# security gate on door
bars(DOOR[0] + 0.03, DOOR[1] - 0.03, 0.05, DOOR_Z1 - 0.03, y=0.06, spacing=0.13)
box(DOOR[0] + 0.08, DOOR[1] - 0.08, 0.035, 0.06, 1.12, 1.17, "galv", front="galv", front_mode="tile")  # push bar
# door frame posts
for x in (DOOR[0], DOOR[1]):
    box(x - 0.05, x + 0.05, -0.04, 0.04, 0.0, DOOR_Z1 + 0.05, "metal", front="metal", front_mode="tile")
box(DOOR[0] - 0.05, DOOR[1] + 0.05, -0.04, 0.04, DOOR_Z1, DOOR_Z1 + 0.06, "metal", front="metal", front_mode="tile")

# cornice band + parapet coping
box(PL1, PR0, -0.05, 0.0, CORN_Z0, CORN_Z1, "concrete", front="facade")
quad((PL1, 0, CORN_Z1), (PR0, 0, CORN_Z1), (PR0, 0, H), (PL1, 0, H), "facade", "facade")

# sign panel
SX0, SX1, SZ0, SZ1 = X(208), X(1265), Z(397), Z(182)
box(SX0, SX1, -0.11, -0.0, SZ0, SZ1, "metal", front="facade", skip=("back",))

# ---------------------------------------------------------------- awning
AX0, AX1 = X(133), X(1327)
AZ_TOP, AZ_FRONT, AZ_VAL = Z(403), Z(470), Z(497)
AD = 0.95  # projection
def aw_uv(t, s):  # t across 0..1, s 0 (wall) .. 1 (front edge)
    return atlas_uv(t * 2048, 1320 + s * 160)
segs = 24
for i in range(segs):
    t0, t1 = i / segs, (i + 1) / segs
    xa, xb = AX0 + (AX1 - AX0) * t0, AX0 + (AX1 - AX0) * t1
    # slight sag in the fabric
    sag = 0.02
    face([(xa, -AD, AZ_FRONT), (xb, -AD, AZ_FRONT), (xb, 0.0, AZ_TOP), (xa, 0.0, AZ_TOP)], "facade",
         [aw_uv(t0, 1), aw_uv(t1, 1), aw_uv(t1, 0), aw_uv(t0, 0)])
    face([(xa, 0.0, AZ_TOP - 0.02), (xb, 0.0, AZ_TOP - 0.02), (xb, -AD, AZ_FRONT - 0.02), (xa, -AD, AZ_FRONT - 0.02)], "fabric",
         [(0, 0)] * 4)
# scalloped valance
scal = 30
for i in range(scal):
    t0, t1 = i / scal, (i + 1) / scal
    xa, xb = AX0 + (AX1 - AX0) * t0, AX0 + (AX1 - AX0) * t1
    k = 4
    pts_top, pts_bot, uvt, uvb = [], [], [], []
    for j in range(k + 1):
        tt = t0 + (t1 - t0) * j / k
        x = AX0 + (AX1 - AX0) * tt
        dip = math.sin(math.pi * j / k)
        zb = AZ_FRONT - (AZ_FRONT - AZ_VAL) * (0.55 + 0.45 * dip)
        pts_top.append((x, -AD, AZ_FRONT)); pts_bot.append((x, -AD, zb))
        uvt.append(atlas_uv(tt * 2048, 1490)); uvb.append(atlas_uv(tt * 2048, 1490 + 60 * (0.55 + 0.45 * dip)))
    for j in range(k):
        face([pts_bot[j], pts_bot[j + 1], pts_top[j + 1], pts_top[j]], "facade", [uvb[j], uvb[j + 1], uvt[j + 1], uvt[j]])
        face([pts_top[j], pts_top[j + 1], pts_bot[j + 1], pts_bot[j]], "fabric", [(0, 0)] * 4)
# awning end caps
for x, flip in ((AX0, True), (AX1, False)):
    pts = [(x, 0.0, AZ_TOP), (x, -AD, AZ_FRONT), (x, -AD, AZ_VAL + 0.03), (x, 0.0, AZ_FRONT - 0.15)]
    if not flip:
        pts = list(reversed(pts))
    face(pts, "fabric", [(0, 0)] * 4)
# awning frame tube
cyl((AX0, -AD + 0.01, AZ_FRONT), (AX1, -AD + 0.01, AZ_FRONT), 0.015, "metal", 6, caps=False)

# ---------------------------------------------------------------- shell
BASE_Z = 0.45
for x, sgn in ((0.0, -1), (W, 1)):
    # side walls (brick), concrete base band
    if sgn < 0:
        quad((x, DEPTH, BASE_Z), (x, 0.0, BASE_Z), (x, 0.0, H), (x, DEPTH, H), "brick")
        box(x - 0.035, x, 0.0, DEPTH, 0.0, BASE_Z, "concrete", skip=("right",))
    else:
        quad((x, 0.0, BASE_Z), (x, DEPTH, BASE_Z), (x, DEPTH, H), (x, 0.0, H), "brick")
        box(x, x + 0.035, 0.0, DEPTH, 0.0, BASE_Z, "concrete", skip=("left",))
quad((W, DEPTH, BASE_Z), (0.0, DEPTH, BASE_Z), (0.0, DEPTH, H), (W, DEPTH, H), "brick")
box(0.0, W, DEPTH, DEPTH + 0.035, 0.0, BASE_Z, "concrete", skip=("front",))
# parapet: inner faces + coping, roof deck
PT, ROOF_Z = 0.28, H - 0.55
quad((PT, PT, ROOF_Z), (W - PT, PT, ROOF_Z), (W - PT, DEPTH - PT, ROOF_Z), (PT, DEPTH - PT, ROOF_Z), "roof", "tile", (3, 3))
quad((PT, PT, ROOF_Z), (PT, DEPTH - PT, ROOF_Z), (PT, DEPTH - PT, H), (PT, PT, H), "brick")
quad((W - PT, DEPTH - PT, ROOF_Z), (W - PT, PT, ROOF_Z), (W - PT, PT, H), (W - PT, DEPTH - PT, H), "brick")
quad((PT, PT, ROOF_Z), (W - PT, PT, ROOF_Z), (W - PT, PT, H), (PT, PT, H), "brick")
quad((W - PT, DEPTH - PT, ROOF_Z), (PT, DEPTH - PT, ROOF_Z), (PT, DEPTH - PT, H), (W - PT, DEPTH - PT, H), "brick")
C = 0.04  # coping overhang
for (x0, x1, y0, y1) in ((-C, W + C, -0.02, PT + C), (-C, W + C, DEPTH - PT - C, DEPTH + C),
                         (-C, PT + C, PT, DEPTH - PT), (W - PT - C, W + C, PT, DEPTH - PT)):
    box(x0, x1, y0, y1, H, H + 0.09, "concrete", tile=(1.0, 1.0))

# ---------------------------------------------------------------- side wall details (+X side)
def side_window(y0, y1, z0, z1):
    x = W
    box(x, x + 0.04, y0 - 0.08, y1 + 0.08, z1, z1 + 0.16, "concrete", tile=(1, 1))      # lintel
    box(x, x + 0.06, y0 - 0.06, y1 + 0.06, z0 - 0.08, z0, "concrete", tile=(1, 1))      # sill
    n = 7
    for i in range(1, n):
        y = y0 + (y1 - y0) * i / n
        cyl((x + 0.02, y, z0), (x + 0.02, y, z1), 0.012, "metal", 6, caps=False)
    for z in (z0 + 0.12, z1 - 0.12):
        cyl((x + 0.02, y0, z), (x + 0.02, y1, z), 0.012, "metal", 6, caps=False)
side_window(2.35, 3.80, 1.65, 3.30)
side_window(6.55, 8.05, 1.65, 3.30)
# cut window holes visually: the brick wall still covers them, so push glass via a dark recess quad in front
# (simple approach: overlay frame quads slightly proud of the wall)
for (y0, y1) in ((2.35, 3.80), (6.55, 8.05)):
    quad((W + 0.003, y0, 1.65), (W + 0.003, y1, 1.65), (W + 0.003, y1, 3.30), (W + 0.003, y0, 3.30), "glassdark")
# vent
box(W, W + 0.05, 1.2, 1.85, 3.7, 4.2, "galv", tile=(0.3, 0.3))
for k in range(6):
    z = 3.75 + k * 0.075
    box(W + 0.05, W + 0.07, 1.25, 1.8, z, z + 0.03, "galv", tile=(0.3, 0.3))
# side gooseneck lamp
cyl((W, 4.6, 4.05), (W + 0.45, 4.6, 4.2), 0.025, "metal", 6)
cyl((W + 0.45, 4.6, 4.2), (W + 0.6, 4.6, 4.0), 0.025, "metal", 6)
cyl((W + 0.6, 4.6, 4.02), (W + 0.6, 4.6, 3.92), 0.2, "metal", 10)
cyl((W + 0.6, 4.6, 3.93), (W + 0.6, 4.6, 3.90), 0.12, "bulb", 10)
# graffiti decals on +X side
def decal(y0, y1, z0, z1, ax0, ay0, ax1, ay1, x=W + 0.004):
    face([(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)], "decal",
         [atlas_uv(ax0, ay1), atlas_uv(ax1, ay1), atlas_uv(ax1, ay0), atlas_uv(ax0, ay0)])
decal(0.35, 2.55, 0.75, 1.75, 640, 1560, 1080, 1760)
decal(8.3, 9.4, 0.55, 1.55, 1100, 1560, 1320, 1760)
# left side (-X) gets a crown tag so it isn't bare
face([(-0.004, 6.2, 1.0), (-0.004, 5.4, 1.0), (-0.004, 5.4, 1.6), (-0.004, 6.2, 1.6)], "decal",
     [atlas_uv(420, 1710), atlas_uv(620, 1710), atlas_uv(620, 1560), atlas_uv(420, 1560)])
# back door
box(3.2, 4.3, DEPTH, DEPTH + 0.05, 0.0, 2.15, "galv", tile=(1.0, 1.0))

# ---------------------------------------------------------------- front props
# gooseneck lamp over sign
LX = X(730)
cyl((LX, 0.0, 4.72), (LX, -0.45, 4.78), 0.025, "metal", 6)
box(LX - 0.27, LX + 0.27, -0.62, -0.36, 4.62, 4.72, "metal", front="metal", front_mode="tile")
box(LX - 0.24, LX + 0.24, -0.6, -0.38, 4.60, 4.62, "bulb", front="bulb", front_mode="tile")
# security camera on left pilaster
CX, CZ = X(118), Z(255)
box(CX - 0.05, CX + 0.05, -0.12, -0.06, CZ - 0.25, CZ - 0.05, "galv", tile=(0.3, 0.3))
cyl((CX, -0.09, CZ - 0.12), (CX + 0.05, -0.28, CZ - 0.05), 0.02, "galv", 6)
box(CX - 0.06, CX + 0.30, -0.42, -0.20, CZ - 0.12, CZ + 0.02, "galv", front="metal", front_mode="tile")
cyl((CX + 0.08, -0.42, CZ - 0.05), (CX - 0.0, -0.46, CZ - 0.06), 0.045, "metal", 8)
# conduit down left pilaster
cyl((X(108), -0.075, Z(330)), (X(108), -0.075, Z(600)), 0.012, "galv", 6)
# downpipes on right pilaster
for px in (1350, 1382):
    cyl((X(px), -0.10, Z(150)), (X(px), -0.10, Z(585)), 0.035, "galv", 8)
cyl((X(1350), -0.10, Z(150)), (W + 0.05, -0.10, Z(150)), 0.03, "galv", 8)
# electric meter
box(X(1330), X(1392), -0.15, -0.06, Z(667), Z(585), "galv", front="facade", tile=(0.3, 0.3))
# rooftop: AC unit, vent stack, edge pipe, small vents
ACX0, ACX1 = X(362), X(528)
box(ACX0, ACX1, 0.55, 1.45, ROOF_Z, ROOF_Z + 0.9, "galv", tile=(0.5, 0.5))
f = quad((ACX0, 0.549, ROOF_Z + 0.25), (ACX1, 0.549, ROOF_Z + 0.25), (ACX1, 0.549, ROOF_Z + 0.9), (ACX0, 0.549, ROOF_Z + 0.9), "facade")
for loop, t in zip(f.loops, [atlas_uv(0, 1710), atlas_uv(400, 1710), atlas_uv(400, 1560), atlas_uv(0, 1560)]):
    loop[uv].uv = t
cyl((ACX1 - 0.1, 1.0, ROOF_Z + 0.4), (ACX1 + 0.6, 1.0, ROOF_Z + 0.4), 0.04, "galv", 8)
cyl((ACX1 + 0.6, 1.0, ROOF_Z + 0.4), (ACX1 + 0.6, 0.18, ROOF_Z + 0.4), 0.04, "galv", 8)
cyl((0.9, 0.18, H + 0.14), (7.1, 0.18, H + 0.14), 0.035, "galv", 8)
VX = X(1102)
cyl((VX, 0.75, ROOF_Z), (VX, 0.75, H + 0.42), 0.17, "galv", 12)
cyl((VX, 0.75, H + 0.42), (VX, 0.75, H + 0.52), 0.27, "galv", 12)
for (vx, vy) in ((X(1207), 1.4), (5.0, 5.5), (2.5, 7.8)):
    cyl((vx, vy, ROOF_Z), (vx, vy, ROOF_Z + 0.45), 0.06, "galv", 8)
box(5.5, 7.2, 6.0, 8.0, ROOF_Z, ROOF_Z + 0.08, "galv", tile=(1, 1))   # roof hatch base

# ---------------------------------------------------------------- finish
def make(bmx, name):
    me = bpy.data.meshes.new(name)
    bmx.normal_update()
    bmesh.ops.remove_doubles(bmx, verts=bmx.verts, dist=0.0005)
    bmx.to_mesh(me); bmx.free()
    for m in MATS.values():
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (-W / 2, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True)
    bpy.ops.object.shade_smooth_by_angle(angle=0.55)
    # drop unused material slots
    used = {p.material_index for p in me.polygons}
    for i in reversed(range(len(me.materials))):
        if i not in used:
            ob.active_material_index = i
            bpy.ops.object.material_slot_remove()
    print("OBJ", name, "TRIS", sum(len(p.vertices) - 2 for p in me.polygons))
    return ob
make(bm_main, "LilJaysMarket")
make(bm_dec, "LilJaysMarket_Decals")
bpy.ops.wm.save_as_mainfile(filepath=OUT + ".blend")
