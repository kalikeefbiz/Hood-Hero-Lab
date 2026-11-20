"""Three Reservoir houses from the user's reference art.

Blender coords: house centred on x=0, front wall at y=0 facing -Y, depth +Y.
Run: python houses.py -- <which> <out.blend>   (which = dark | tan | abandoned)
"""
import sys, math
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset

which, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
reset()

TRIM = {"dark": "c9ad84", "tan": "ece4d2", "abandoned": "ddd6c6"}[which]
SIDING = {"dark": "siding_navy.png", "tan": "siding_tan.png", "abandoned": "siding_green.png"}[which]
M = {
    "siding": material(f"H_{which}_Siding", SIDING, rough=0.85, normal="siding_normal.png"),
    "trim": material(f"H_{which}_Trim", color=srgb(TRIM), rough=0.7),
    "roof": material(f"H_{which}_Shingles", "shingles.png", rough=0.95,
                     tint=srgb({"dark": "c08a70", "tan": "8a8378", "abandoned": "7a7a80"}[which])),
    "found": material("H_Foundation", "concrete_albedo.png", rough=0.95, normal="concrete_normal.png"),
    "brick": material("H_Brick", "brick_albedo.png", rough=0.9, normal="brick_normal.png"),
    "glass": material(f"H_{which}_Window", "windows_atlas.png", rough=0.15,
                      emissive="windows_emissive.png", emit_strength=0.0),
    "door": material(f"H_{which}_Door", "doors_atlas.png", rough=0.6),
    "wood": material("H_PorchWood", color=srgb("6f5a45"), rough=0.85),
    "rust": material("H_RustMetal", color=srgb("7b4a32"), rough=0.6, metal=0.4),
    "metal": material("H_DarkMetal", color=srgb("2a2c2e"), rough=0.5, metal=0.6),
    "galv": material("H_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "bulb": material("H_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1, 0.8, 0.5), emit_strength=4.0),
    "soffit": material(f"H_{which}_Soffit", color=srgb("3a3632"), rough=0.9),
}
B = Builder(M)
B.use(f"House_{which}")

# quadrant UVs in the window / door atlases
def quad_uv(q):  # q: 0 TL, 1 TR, 2 BL, 3 BR
    u0 = 0.5 * (q % 2); v1 = 1.0 - 0.5 * (q // 2); v0 = v1 - 0.5
    e = 0.004
    return [(u0 + e, v0 + e), (u0 + 0.5 - e, v0 + e), (u0 + 0.5 - e, v1 - e), (u0 + e, v1 - e)]
WIN = {"lit": 0, "blinds": 1, "dark": 2, "boarded": 3}
DOOR = {"panel": 0, "security": 1, "boarded": 2, "brown": 3}

# ---------------------------------------------------------------- walls with openings
def wall(P, u0, u1, z0, z1, holes):
    """Fill rectangle (u0..u1, z0..z1) on a wall, leaving `holes` [(a,b,c,d)] open."""
    xs = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
    for a, b in zip(xs, xs[1:]):
        if b - a < 1e-4:
            continue
        mid = (a + b) / 2
        spans = sorted((h[2], h[3]) for h in holes if h[0] <= mid <= h[1])
        z = z0
        for (hz0, hz1) in spans:
            if hz0 > z + 1e-4:
                B.quad(P(a, z), P(b, z), P(b, hz0), P(a, hz0), "siding")
            z = max(z, hz1)
        if z1 > z + 1e-4:
            B.quad(P(a, z), P(b, z), P(b, z1), P(a, z1), "siding")

def opening(P, n_in, a, b, z0, z1, kind, depth=0.12, casing=0.09, door=False, boarded=False):
    """Recessed window/door with trim casing and sill. n_in = inward unit vector."""
    def Q(u, z, d=0.0):
        p = P(u, z); return (p[0] + n_in[0] * d, p[1] + n_in[1] * d, p[2])
    # reveals
    B.quad(Q(a, z0), Q(a, z0, depth), Q(a, z1, depth), Q(a, z1), "trim")
    B.quad(Q(b, z0, depth), Q(b, z0), Q(b, z1), Q(b, z1, depth), "trim")
    B.quad(Q(a, z1), Q(a, z1, depth), Q(b, z1, depth), Q(b, z1), "trim")
    B.quad(Q(b, z0), Q(b, z0, depth), Q(a, z0, depth), Q(a, z0), "trim")
    mat = "door" if door else "glass"
    q = (DOOR if door else WIN).get(kind, 3 if not door else 2)
    B.face([Q(a, z0, depth), Q(b, z0, depth), Q(b, z1, depth), Q(a, z1, depth)], mat, quad_uv(q))
    # casing (proud 3 cm)
    o = -0.03
    for (ua, ub, za, zb) in ((a - casing, a, z0, z1 + casing), (b, b + casing, z0, z1 + casing),
                             (a - casing, b + casing, z1, z1 + casing)):
        B.quad(Q(ua, za, o), Q(ub, za, o), Q(ub, zb, o), Q(ua, zb, o), "trim")
        B.quad(Q(ua, za, 0), Q(ua, za, o), Q(ua, zb, o), Q(ua, zb, 0), "trim")
        B.quad(Q(ub, za, o), Q(ub, za, 0), Q(ub, zb, 0), Q(ub, zb, o), "trim")
        B.quad(Q(ua, zb, o), Q(ub, zb, o), Q(ub, zb, 0), Q(ua, zb, 0), "trim")
    if not door:
        # sill
        B.quad(Q(a - 0.12, z0 - 0.05, -0.07), Q(b + 0.12, z0 - 0.05, -0.07), Q(b + 0.12, z0, -0.07), Q(a - 0.12, z0, -0.07), "trim")
        B.quad(Q(a - 0.12, z0, -0.07), Q(b + 0.12, z0, -0.07), Q(b + 0.12, z0, 0), Q(a - 0.12, z0, 0), "trim")
    if boarded:
        # plywood sheet nailed over the casing
        B.face([Q(a - 0.05, z0 - 0.03, -0.05), Q(b + 0.05, z0 - 0.03, -0.05), Q(b + 0.05, z1 + 0.05, -0.05), Q(a - 0.05, z1 + 0.05, -0.05)],
               "door" if door else "glass", quad_uv(DOOR["boarded"] if door else WIN["boarded"]))

def walls(w, d, z0, zt, faces, gable_front=True, ridge=None):
    """Four walls of a box. faces: {side: [(u0,u1,z0,z1,kind,is_door,boarded)]}."""
    hw = w / 2
    sides = {
        "front": (lambda u, z: (u, 0.0, z), (0, 1, 0), -hw, hw),
        "right": (lambda u, z: (hw, u, z), (-1, 0, 0), 0.0, d),
        "back": (lambda u, z: (-u, d, z), (0, -1, 0), -hw, hw),
        "left": (lambda u, z: (-hw, -u, z), (1, 0, 0), -d, 0.0),
    }
    for side, (P, n_in, u0, u1) in sides.items():
        ops = faces.get(side, [])
        wall(P, u0, u1, z0, zt, [(o[0], o[1], o[2], o[3]) for o in ops])
        for (a, b, oz0, oz1, kind, is_door, boarded) in ops:
            opening(P, n_in, a, b, oz0, oz1, kind, door=is_door, boarded=boarded)
    if ridge is not None:
        for side in (("front", "back") if gable_front else ("left", "right")):
            P = sides[side][0]; u0, u1 = sides[side][2], sides[side][3]
            B.poly([P(u0, zt), P(u1, zt), P((u0 + u1) / 2, ridge)], "siding")

def gable_roof(w, d, zt, ridge, oh=0.35, mat="roof", ridge_axis="y", y0=0.0):
    hw = w / 2
    pitch = (ridge - zt) / hw
    ze = zt - oh * pitch                      # eave height at overhang
    if ridge_axis == "y":
        ya, yb = y0 - oh, y0 + d + oh
        L = math.hypot(hw + oh, ridge - ze)
        for s in (-1, 1):
            e = s * (hw + oh)
            pts = [(e, ya, ze), (e, yb, ze), (0, yb, ridge), (0, ya, ridge)] if s > 0 else \
                  [(e, yb, ze), (e, ya, ze), (0, ya, ridge), (0, yb, ridge)]
            uvs = [(pts[i][1] / 2.0, (0 if i < 2 else L) / 2.0) for i in range(4)]
            B.face(pts, mat, uvs)
            # thickness / fascia
            B.quad((e, ya, ze - 0.14), (e, yb, ze - 0.14), (e, yb, ze), (e, ya, ze), "trim") if s > 0 else \
                B.quad((e, yb, ze - 0.14), (e, ya, ze - 0.14), (e, ya, ze), (e, yb, ze), "trim")
            # soffit
            sp = [(e, ya, ze - 0.14), (s * hw, ya, zt - 0.02), (s * hw, yb, zt - 0.02), (e, yb, ze - 0.14)]
            B.poly(sp if s < 0 else list(reversed(sp)), "soffit")
        # rake boards on gable ends
        for yy, flip in ((ya, False), (yb, True)):
            for s in (-1, 1):
                p = [(s * (hw + oh), yy, ze - 0.14), (0, yy, ridge - 0.14), (0, yy, ridge + 0.02), (s * (hw + oh), yy, ze + 0.02)]
                if (s > 0) != flip:
                    p = list(reversed(p))
                B.poly(p, "trim")
        # undersides of overhang at gable ends
        for yy, yw in ((ya, y0), (yb, y0 + d)):
            for s in (-1, 1):
                p = [(s * (hw + oh), yy, ze - 0.1), (0, yy, ridge - 0.12), (0, yw, ridge - 0.12), (s * (hw + oh), yw, ze - 0.1)]
                if (s < 0) == (yy == ya):
                    p = list(reversed(p))
                B.poly(p, "soffit")
    return ze

def chimney(x, y, z0, z1):
    B.box(x - 0.32, x + 0.32, y - 0.32, y + 0.32, z0, z1, "brick", tile=(1.68, 1.65))
    B.box(x - 0.38, x + 0.38, y - 0.38, y + 0.38, z1, z1 + 0.08, "found")
    B.cyl((x, y, z1 + 0.08), (x, y, z1 + 0.3), 0.08, "galv", 8)

def foundation(w, d, fh, y0=0.0):
    B.box(-w / 2 - 0.03, w / 2 + 0.03, y0 - 0.03, y0 + d + 0.03, 0.0, fh, "found", tile=(1.2, 1.2), skip=("top", "bottom"))

def corner_boards(w, d, z0, z1, y0=0.0):
    t = 0.11
    for (x, y) in ((-w / 2, y0), (w / 2, y0), (-w / 2, y0 + d), (w / 2, y0 + d)):
        sx = -1 if x < 0 else 1; sy = -1 if y == y0 else 1
        B.box(min(x, x + sx * 0.03), max(x, x + sx * 0.03), min(y, y - sy * t), max(y, y - sy * t), z0, z1, "trim")
        B.box(min(x, x - sx * t), max(x, x - sx * t), min(y, y + sy * 0.03), max(y, y + sy * 0.03), z0, z1, "trim")

def steps(x0, x1, y_front, top_z, n, run=0.28, mat="wood"):
    h = top_z / n
    for i in range(n):
        z = top_z - (i + 1) * h
        B.box(x0, x1, y_front - (i + 1) * run, y_front - i * run, 0.0 if i == n - 1 else z, z + h, mat, tile=(1, 1))

def railing(x0, x1, y, z, height=0.9, spacing=0.13, along="x", mat="wood"):
    if along == "x":
        B.box(x0, x1, y - 0.04, y + 0.04, z + height - 0.06, z + height, mat)
        B.box(x0, x1, y - 0.03, y + 0.03, z + 0.08, z + 0.13, mat)
        n = max(1, int((x1 - x0) / spacing))
        for i in range(1, n):
            xx = x0 + (x1 - x0) * i / n
            B.box(xx - 0.02, xx + 0.02, y - 0.02, y + 0.02, z + 0.13, z + height - 0.06, mat)
    else:
        B.box(y - 0.04, y + 0.04, x0, x1, z + height - 0.06, z + height, mat)
        B.box(y - 0.03, y + 0.03, x0, x1, z + 0.08, z + 0.13, mat)
        n = max(1, int((x1 - x0) / spacing))
        for i in range(1, n):
            yy = x0 + (x1 - x0) * i / n
            B.box(y - 0.02, y + 0.02, yy - 0.02, yy + 0.02, z + 0.13, z + height - 0.06, mat)

def porch_light(x, y, z):
    B.box(x - 0.08, x + 0.08, y - 0.12, y, z - 0.1, z + 0.12, "metal")
    B.cyl((x, y - 0.1, z - 0.02), (x, y - 0.1, z - 0.16), 0.07, "bulb", 8)

def meter(x, y, z):
    B.box(x - 0.15, x + 0.15, y, y + 0.12, z, z + 0.38, "galv")

def downspout(x, y, z1):
    B.cyl((x, y, 0.05), (x, y, z1), 0.04, "galv", 6)

# ================================================================ HOUSES
if which == "dark":
    # two-storey, front gable, shed-roof porch across the front, side stair door
    w, d, fh = 6.4, 9.0, 0.75
    zt = fh + 5.0
    ridge = zt + 2.6
    foundation(w, d, fh)
    walls(w, d, fh, zt, {
        "front": [(-2.25, -0.95, 1.05, 2.55, "lit", False, False), (-0.55, 0.55, fh, fh + 2.1, "panel", True, False),
                  (0.95, 2.25, 1.05, 2.55, "dark", False, False),
                  (-2.05, -0.95, 3.55, 5.05, "dark", False, False), (0.95, 2.05, 3.55, 5.05, "lit", False, False)],
        "right": [(1.4, 2.4, 1.15, 2.6, "blinds", False, False), (5.2, 6.1, fh + 0.9, fh + 3.0, "brown", True, False),
                  (1.6, 2.6, 3.6, 5.0, "dark", False, False), (6.6, 7.6, 3.6, 5.0, "blinds", False, False)],
        "left": [(-7.6, -6.6, 1.15, 2.6, "dark", False, False), (-3.4, -2.4, 1.15, 2.6, "blinds", False, False),
                 (-7.2, -6.2, 3.6, 5.0, "dark", False, False)],
        "back": [(-1.2, 0.0, 1.2, 2.5, "dark", False, False)],
    }, ridge=ridge)
    # attic louver
    B.box(-0.4, 0.4, -0.06, 0.0, zt + 1.0, zt + 1.75, "trim")
    for k in range(6):
        z = zt + 1.06 + k * 0.11
        B.box(-0.34, 0.34, -0.09, -0.06, z, z + 0.05, "soffit")
    corner_boards(w, d, fh, zt)
    B.box(-w / 2 - 0.02, w / 2 + 0.02, -0.04, 0.0, fh + 2.75, fh + 2.9, "trim")  # belt between floors
    gable_roof(w, d, zt, ridge, oh=0.35)
    chimney(1.2, 5.6, ridge - 0.8, ridge + 0.9)
    # porch: deck, posts, shed roof, railing, steps
    pd = 2.1; pz = fh - 0.05
    B.box(-w / 2, w / 2, -pd, 0.0, pz - 0.12, pz, "wood", tile=(1, 1))
    B.box(-w / 2, w / 2, -pd, -pd + 0.05, 0.0, pz - 0.12, "found", tile=(1, 1))
    proof_z0, proof_z1 = fh + 2.55, fh + 3.0
    for x in (-w / 2 + 0.1, -0.9, 0.9, w / 2 - 0.1):
        B.box(x - 0.07, x + 0.07, -pd + 0.05, -pd + 0.19, pz, proof_z0, "trim")
    B.box(-w / 2 - 0.1, w / 2 + 0.1, -pd - 0.05, -pd + 0.22, proof_z0, proof_z0 + 0.18, "trim")
    pr = [(-w / 2 - 0.15, -pd - 0.3, proof_z0 + 0.12), (w / 2 + 0.15, -pd - 0.3, proof_z0 + 0.12),
          (w / 2 + 0.15, 0.0, proof_z1), (-w / 2 - 0.15, 0.0, proof_z1)]
    B.face(pr, "rust", [(p[0] / 1.2, p[1] / 1.2) for p in pr])
    B.face(list(reversed(pr)), "soffit", [(0, 0)] * 4)
    railing(-w / 2 + 0.15, -0.75, -pd + 0.12, pz)
    railing(0.75, w / 2 - 0.15, -pd + 0.12, pz)
    railing(-pd + 0.2, -0.1, -w / 2 + 0.12, pz, along="y")
    railing(-pd + 0.2, -0.1, w / 2 - 0.12, pz, along="y")
    steps(-0.75, 0.75, -pd, pz, 3, mat="found")
    porch_light(0.0, -0.01, fh + 2.35)
    # side stairs + landing to the side door
    sx = w / 2
    B.box(sx, sx + 1.1, 4.9, 6.4, fh + 0.85, fh + 0.9, "wood")
    for x, y in ((sx + 1.05, 4.95), (sx + 1.05, 6.35)):
        B.box(x - 0.05, x + 0.05, y - 0.05, y + 0.05, 0.0, fh + 0.85, "wood")
    n = 6
    for i in range(n):
        z = (fh + 0.85) * (n - i) / (n + 1)
        y = 4.9 - (i + 1) * 0.27
        B.box(sx + 0.05, sx + 1.05, y, y + 0.27, z - 0.04, z, "wood")
    railing(4.9 - n * 0.27, 6.4, sx + 1.05, fh + 0.45, along="y", height=0.95)
    porch_light(sx + 0.01, 5.65, fh + 3.1) if False else None
    B.box(sx, sx + 0.12, 5.55, 5.75, fh + 3.05, fh + 3.25, "metal")
    B.cyl((sx + 0.12, 5.65, fh + 3.1), (sx + 0.12, 5.65, fh + 2.98), 0.06, "bulb", 8)
    meter(w / 2, 3.2, 1.3) if False else B.box(w / 2, w / 2 + 0.12, 3.0, 3.3, 1.4, 1.8, "galv")
    downspout(-w / 2 - 0.06, -0.05, zt)
    downspout(w / 2 + 0.06, d + 0.05, zt)
    # trash can by the porch
    B.cyl((-w / 2 - 0.55, -0.8, 0.0), (-w / 2 - 0.55, -0.8, 0.95), 0.3, "metal", 10, r1=0.33)

elif which == "tan":
    # one-storey bungalow, front gable, enclosed sun porch, detached garage behind
    w, d, fh = 7.2, 9.5, 0.55
    zt = fh + 2.75
    ridge = zt + 2.3
    foundation(w, d, fh)
    walls(w, d, fh, zt, {
        "front": [(-2.9, -1.7, 1.2, 2.55, "blinds", False, False), (1.7, 2.9, 1.2, 2.55, "blinds", False, False)],
        "right": [(2.0, 3.0, 1.2, 2.55, "blinds", False, False), (5.6, 6.6, 1.2, 2.55, "dark", False, False)],
        "left": [(-6.5, -5.5, 1.2, 2.55, "dark", False, False), (-3.0, -2.0, 1.2, 2.55, "blinds", False, False)],
        "back": [(-0.5, 0.5, fh, fh + 2.05, "brown", True, False)],
    }, ridge=ridge)
    B.box(-0.35, 0.35, -0.06, 0.0, zt + 0.9, zt + 1.45, "trim")
    for k in range(4):
        z = zt + 0.96 + k * 0.12
        B.box(-0.3, 0.3, -0.09, -0.06, z, z + 0.05, "soffit")
    corner_boards(w, d, fh, zt)
    gable_roof(w, d, zt, ridge, oh=0.4)
    chimney(-1.6, 4.0, ridge - 0.9, ridge + 0.7)
    # enclosed porch box in front (lower shed roof, big windows, security door)
    pd = 2.4; pw = w
    B.use("Porch_tan")
    B.box(-pw / 2 - 0.03, pw / 2 + 0.03, -pd - 0.03, 0.0, 0.0, fh, "found", tile=(1.2, 1.2), skip=("top", "bottom", "back"))
    hw = pw / 2
    P = lambda u, z: (u, -pd, z)
    wall(P, -hw, hw, fh, fh + 2.45, [(-3.3, -1.0, fh + 0.55, fh + 2.1), (-0.5, 0.5, fh, fh + 2.1), (1.0, 3.3, fh + 0.55, fh + 2.1)])
    for (a, b) in ((-3.3, -2.15), (-2.15, -1.0), (1.0, 2.15), (2.15, 3.3)):
        opening(P, (0, 1, 0), a + 0.03, b - 0.03, fh + 0.55, fh + 2.1, "blinds", depth=0.08, casing=0.06)
    opening(P, (0, 1, 0), -0.5, 0.5, fh, fh + 2.1, "security", door=True, depth=0.06)
    for side, x, n_in in (("r", hw, (-1, 0, 0)), ("l", -hw, (1, 0, 0))):
        Ps = (lambda u, z, x=x: (x, u, z)) if side == "r" else (lambda u, z, x=x: (x, -u, z))
        if side == "r":
            wall(Ps, -pd, 0.0, fh, fh + 2.45, [(-1.9, -0.5, fh + 0.55, fh + 2.1)])
            opening(Ps, n_in, -1.9, -0.5, fh + 0.55, fh + 2.1, "blinds", depth=0.08, casing=0.06)
        else:
            wall(Ps, 0.0, pd, fh, fh + 2.45, [(0.5, 1.9, fh + 0.55, fh + 2.1)])
            opening(Ps, n_in, 0.5, 1.9, fh + 0.55, fh + 2.1, "blinds", depth=0.08, casing=0.06)
    zt2 = fh + 2.45
    rp = [(-hw - 0.3, -pd - 0.35, zt2 - 0.1), (hw + 0.3, -pd - 0.35, zt2 - 0.1), (hw + 0.3, 0.0, zt2 + 0.55), (-hw - 0.3, 0.0, zt2 + 0.55)]
    B.face(rp, "roof", [(p[0] / 2, p[1] / 2) for p in rp])
    B.face(list(reversed(rp)), "soffit", [(0, 0)] * 4)
    B.box(-hw - 0.3, hw + 0.3, -pd - 0.37, -pd - 0.33, zt2 - 0.28, zt2 - 0.08, "trim")
    for s in (-1, 1):
        tri = [(s * (hw + 0.3), -pd - 0.35, zt2 - 0.1), (s * (hw + 0.3), 0.0, zt2 + 0.55), (s * (hw + 0.3), 0.0, zt2 - 0.1)]
        B.poly(tri if s > 0 else list(reversed(tri)), "trim")
    for x in (-hw, hw):
        B.box(x - 0.06, x + 0.06, -pd - 0.06, -pd + 0.06, fh, zt2, "trim")
    steps(-0.6, 0.6, -pd, fh, 3, mat="found")
    porch_light(0.75, -pd - 0.01, fh + 2.2)
    downspout(hw + 0.06, -pd - 0.06, zt2)
    B.box(hw, hw + 0.12, -1.2, -0.9, 1.0, 1.4, "galv")
    # detached garage behind, offset right
    B.use("Garage_tan")
    gx, gy, gw, gd, gh = 2.3, 11.0, 3.4, 5.5, 2.6
    def G(u, z):
        return (gx + u, gy, z)
    wall(G, -gw / 2, gw / 2, 0.0, gh, [(-1.35, 1.35, 0.0, 2.25)])
    B.face([G(-1.35, 0), G(1.35, 0), G(1.35, 2.25), G(-1.35, 2.25)], "trim",
           [(0, 0), (1, 0), (1, 1), (0, 1)])
    for k in range(1, 5):
        z = k * 0.45
        B.box(gx - 1.35, gx + 1.35, gy - 0.025, gy, z - 0.02, z, "soffit")
    for side in ("r", "l", "b"):
        if side == "r":
            B.quad((gx + gw / 2, gy, 0), (gx + gw / 2, gy + gd, 0), (gx + gw / 2, gy + gd, gh), (gx + gw / 2, gy, gh), "siding")
        elif side == "l":
            B.quad((gx - gw / 2, gy + gd, 0), (gx - gw / 2, gy, 0), (gx - gw / 2, gy, gh), (gx - gw / 2, gy + gd, gh), "siding")
        else:
            B.quad((gx + gw / 2, gy + gd, 0), (gx - gw / 2, gy + gd, 0), (gx - gw / 2, gy + gd, gh), (gx + gw / 2, gy + gd, gh), "siding")
    for yy in (gy, gy + gd):
        tri = [(gx - gw / 2, yy, gh), (gx + gw / 2, yy, gh), (gx, yy, gh + 1.2)]
        B.poly(tri if yy == gy else list(reversed(tri)), "siding")
    # garage gable roof (ridge along y), shifted
    hw2 = gw / 2 + 0.25
    for s in (-1, 1):
        p = [(gx + s * hw2, gy - 0.25, gh - 0.15), (gx + s * hw2, gy + gd + 0.25, gh - 0.15), (gx, gy + gd + 0.25, gh + 1.2), (gx, gy - 0.25, gh + 1.2)]
        if s < 0:
            p = [p[1], p[0], p[3], p[2]]
        B.face(p, "roof", [(q[1] / 2, (0 if i < 2 else 1.1)) for i, q in enumerate(p)])
        B.face(list(reversed(p)), "soffit", [(0, 0)] * 4)

else:  # abandoned
    w, d, fh = 6.8, 9.5, 0.9
    zt = fh + 5.1
    ridge = zt + 3.0
    foundation(w, d, fh)
    walls(w, d, fh, zt, {
        "front": [(-2.5, -1.3, 1.35, 2.85, "", False, True), (0.4, 1.4, fh + 0.05, fh + 2.15, "", True, True),
                  (1.9, 2.8, 1.35, 2.85, "", False, True),
                  (-2.3, -1.2, 3.75, 5.2, "", False, True), (1.2, 2.3, 3.75, 5.2, "", False, True)],
        "left": [(-7.8, -6.8, 1.35, 2.85, "", False, True), (-4.6, -3.6, 1.35, 2.85, "", False, True),
                 (-7.4, -6.4, 3.75, 5.2, "", False, True), (-3.9, -2.9, 3.75, 5.2, "", False, True)],
        "right": [(2.0, 3.0, 1.35, 2.85, "", False, True), (6.0, 7.0, 3.75, 5.2, "", False, True)],
        "back": [(-1.0, 0.0, 1.35, 2.85, "", False, True)],
    }, ridge=ridge)
    B.box(-0.55, 0.55, -0.04, 0.0, zt + 1.0, zt + 2.0, "glass") if False else None
    B.face([(-0.55, -0.05, zt + 1.0), (0.55, -0.05, zt + 1.0), (0.55, -0.05, zt + 2.0), (-0.55, -0.05, zt + 2.0)], "glass", quad_uv(3))
    corner_boards(w, d, fh, zt)
    gable_roof(w, d, zt, ridge, oh=0.3)
    chimney(-1.4, 2.5, ridge - 1.4, ridge + 0.7)
    # wrap porch with brick piers, sagging broken roof
    pd = 2.3; pz = fh - 0.05
    B.box(-w / 2 - 0.2, w / 2 + 0.4, -pd, 0.0, pz - 0.12, pz, "wood", tile=(1, 1))
    for x in (-w / 2 - 0.1, -0.6, w / 2 + 0.25):
        B.box(x - 0.22, x + 0.22, -pd + 0.02, -pd + 0.46, 0.0, pz + 0.35, "brick", tile=(1.68, 1.65))
        B.box(x - 0.1, x + 0.1, -pd + 0.14, -pd + 0.34, pz + 0.35, fh + 2.55, "trim")
    roof_z = fh + 2.6
    # left half intact, right half sagging
    p1 = [(-w / 2 - 0.4, -pd - 0.3, roof_z), (0.6, -pd - 0.3, roof_z - 0.02), (0.6, 0.0, roof_z + 0.45), (-w / 2 - 0.4, 0.0, roof_z + 0.45)]
    p2 = [(0.6, -pd - 0.3, roof_z - 0.02), (w / 2 + 0.55, -pd - 0.3, roof_z - 0.55), (w / 2 + 0.55, 0.0, roof_z + 0.3), (0.6, 0.0, roof_z + 0.45)]
    for p in (p1, p2):
        B.face(p, "roof", [(q[0] / 2, q[1] / 2) for q in p])
        B.face(list(reversed(p)), "soffit", [(0, 0)] * 4)
    B.box(-w / 2 - 0.4, 0.6, -pd - 0.32, -pd - 0.27, roof_z - 0.2, roof_z, "trim")
    railing(-w / 2 - 0.1, -0.7, -pd + 0.2, pz)
    railing(1.6, w / 2 + 0.2, -pd + 0.2, pz)
    steps(0.3, 1.5, -pd, pz, 4)
    # loose boards and debris
    B.obox((2.4, -pd - 1.0, 0.02), (1.6, 0.18, 0.03), 0.5, "wood")
    B.obox((-2.8, -pd - 1.5, 0.0), (0.4, 0.2, 0.2), 0.2, "found")
    B.cyl((-3.6, -pd - 1.0, 0.0), (-3.6, -pd - 1.0, 0.18), 0.32, "metal", 12)   # old tyre stand-in

objs = B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
