"""Generic Reservoir storefront from a straight-on front elevation + a spec.

blender -b --python storefront.py -- <buildings.json> <id> <out.blend>
(or: python storefront.py -- ...  with the bpy module)

Blender coords match the strip: X along the frontage (centred on 0), front face at
y=0 looking toward -Y (the street), Z up. Exported Y-up the front faces +Z.
The front elevation is projected 1:1 onto every forward-facing surface, so signs,
paint and wear come straight from the owner's art; real depth comes from recessed
openings, protruding panels, canopies, lamps, roof gear and props.
"""
import sys, json, math
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset

args = sys.argv[sys.argv.index("--") + 1:]
SPEC, BID, OUT = args[0], args[1], args[2]
s = json.load(open(SPEC))[BID]
reset()

L, R, G, PPM, D = s["L"], s["R"], s["G"], s["ppm"], s["depth"]
TL = s.get("Tl", s.get("T")); TR = s.get("Tr", s.get("T"))
TOP = min(TL, TR)
CX = (L + R) / 2
X = lambda px: (px - CX) / PPM
Z = lambda py: (G - py) / PPM
W0, W1 = X(L), X(R)
HL, HR = Z(TL), Z(TR)
HMAX = max(HL, HR)
def roof_z(x):  # roofline height at x (sloped or flat)
    t = (x - W0) / (W1 - W0)
    return HL + (HR - HL) * t
def fuv(x, z):  # world (x,z) on the front -> atlas uv
    px = CX + x * PPM; py = G - z * PPM
    return ((px - L) / (R - L), 1 - (py - TOP) / (G - TOP))

N = s["name"]
M = {
    "facade": material(N + "_Facade", f"{BID}_atlas.png", rough=0.88, emissive=f"{BID}_emissive.png", emit_strength=0.0),
    "glass": material(N + "_Window", f"{BID}_atlas.png", rough=0.16, emissive=f"{BID}_emissive.png", emit_strength=0.0),
    "side": material(N + "_Side", f"{BID}_side.png", rough=0.9),
    "roof": material("R_Roof", "roof_albedo.png", rough=0.95),
    "concrete": material("R_Concrete", "concrete_albedo.png", rough=0.92, normal="concrete_normal.png"),
    "metal": material("R_DarkMetal", color=srgb("2b2d30"), rough=0.5, metal=0.7),
    "galv": material("R_Galvanized", color=srgb("8d9093"), rough=0.4, metal=0.85),
    "rust": material("R_RustMetal", color=srgb("6b4a35"), rough=0.75, metal=0.5),
    "yellow": material("R_SafetyYellow", color=srgb("d3a62a"), rough=0.55),
    "rubber": material("R_Rubber", color=srgb("1c1c1d"), rough=0.85),
    "under": material(N + "_Underside", color=srgb("3a2a24"), rough=0.9),
    "bulb": material("R_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1.0, 0.82, 0.55), emit_strength=4.0),
}
B = Builder(M)
B.use(N)

def fquad(pts, mat="facade"):
    """Polygon on/parallel to the front, uv from the elevation."""
    B.face(pts, mat, [fuv(p[0], p[2]) for p in pts])

def fbox(x0, x1, y0, y1, z0, z1, side="metal", top="metal", bottom=None):
    """Box whose -Y face shows the elevation; other faces get plain materials."""
    fquad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    B.box(x0, x1, y0, y1, z0, z1, side, tile=(1, 1), skip=("front", "back"),
          mats={"top": top, "bottom": bottom or side})

# ---------------------------------------------------------------- front wall with holes
ops = [dict(o, x0=X(o["r"][0]), x1=X(o["r"][1]), z0=Z(o["r"][3]), z1=Z(o["r"][2])) for o in s["openings"]]
for o in ops:
    o["z0"] = max(0.0, o["z0"]) if o["z0"] < 0.03 else o["z0"]
xs = sorted({W0, W1, *[o["x0"] for o in ops], *[o["x1"] for o in ops]})
ztop_op = max(o["z1"] for o in ops)
zs = sorted({0.0, ztop_op, *[o["z0"] for o in ops], *[o["z1"] for o in ops]})
def inside(cx, cz):
    return any(o["x0"] < cx < o["x1"] and o["z0"] < cz < o["z1"] for o in ops)
for i in range(len(xs) - 1):
    xa, xb = xs[i], xs[i + 1]
    for j in range(len(zs) - 1):
        za, zb = zs[j], zs[j + 1]
        if zb - za < 1e-4 or xb - xa < 1e-4 or inside((xa + xb) / 2, (za + zb) / 2):
            continue
        fquad([(xa, 0, za), (xb, 0, za), (xb, 0, zb), (xa, 0, zb)])
    fquad([(xa, 0, ztop_op), (xb, 0, ztop_op), (xb, 0, roof_z(xb)), (xa, 0, roof_z(xa))])

for o in ops:
    x0, x1, z0, z1, d = o["x0"], o["x1"], o["z0"], o["z1"], o["d"]
    B.quad((x0, 0, z0), (x0, d, z0), (x0, d, z1), (x0, 0, z1), "metal")
    B.quad((x1, d, z0), (x1, 0, z0), (x1, 0, z1), (x1, d, z1), "metal")
    B.quad((x0, 0, z1), (x1, 0, z1), (x1, d, z1), (x0, d, z1), "metal")
    if z0 > 0.02:
        B.quad((x0, d, z0), (x1, d, z0), (x1, 0, z0), (x0, 0, z0), "concrete")
    else:
        B.quad((x0, 0, 0.005), (x1, 0, 0.005), (x1, d, 0.005), (x0, d, 0.005), "concrete")
    fquad([(x0, d, z0), (x1, d, z0), (x1, d, z1), (x0, d, z1)], "glass" if o["k"] == "glass" else "facade")

# ---------------------------------------------------------------- shell
SW = 2.5                                              # side tile width in metres
def side_wall(pts):
    uvs = []
    for (x, y, z) in pts:
        along = y if abs(pts[0][0] - pts[1][0]) < 1e-6 else x
        uvs.append((along / SW, z / HMAX))
    B.face(pts, "side", uvs)
side_wall([(W0, D, 0), (W0, 0, 0), (W0, 0, HL), (W0, D, HL)])
side_wall([(W1, 0, 0), (W1, D, 0), (W1, D, HR), (W1, 0, HR)])
side_wall([(W1, D, 0), (W0, D, 0), (W0, D, HL), (W1, D, HR)])
if "cap" in s:                                         # flat roof + coping
    c = s["cap"] / PPM; H = HL
    B.quad((W0, 0, H - 0.25), (W1, 0, H - 0.25), (W1, D, H - 0.25), (W0, D, H - 0.25), "roof", (3, 3))
    for (a, b, cdir) in (((W0, -0.07), (W1, -0.07), 0),):
        pass
    fbox(W0 - 0.05, W1 + 0.05, -0.09, 0.22, H - c, H, side="concrete", top="concrete")
    B.box(W0 - 0.05, W0 + 0.22, 0.22, D + 0.05, H - c, H, "concrete", tile=(1, 1))
    B.box(W1 - 0.22, W1 + 0.05, 0.22, D + 0.05, H - c, H, "concrete", tile=(1, 1))
    B.box(W0 + 0.22, W1 - 0.22, D - 0.22, D + 0.05, H - c, H, "concrete", tile=(1, 1))
    roof_base = H - 0.25
else:                                                  # sloped shed roof with fascia
    o = 0.25
    a, b = (W0 - o, -o, HL + 0.06), (W1 + o, -o, HR + 0.06)
    c_, d_ = (W1 + o, D + o, HR + 0.06), (W0 - o, D + o, HL + 0.06)
    B.face([a, b, c_, d_], "roof", [(0, 0), ((W1 - W0) / 3, 0), ((W1 - W0) / 3, D / 3), (0, D / 3)])
    B.face([d_, c_, b, a], "rust", [(0, 0)] * 4)
    fquad([(a[0], -o, HL - 0.12), (b[0], -o, HR - 0.12), (b[0], -o, HR + 0.06), (a[0], -o, HL + 0.06)], "rust")
    roof_base = None

# ---------------------------------------------------------------- facade depth
for p in s.get("panels", []):
    x0, x1, z0, z1 = X(p["r"][0]), X(p["r"][1]), Z(p["r"][3]), Z(p["r"][2])
    fbox(x0, x1, -p["out"], 0, z0, z1, side="rust", top="rust")
for (a, b, t, u) in s.get("sills", []):
    fbox(X(a), X(b), -0.08, 0, Z(u), Z(t), side="concrete", top="concrete")
if "canopy" in s:
    c = s["canopy"]; x0, x1, z0, z1 = X(c["r"][0]), X(c["r"][1]), Z(c["r"][3]), Z(c["r"][2])
    fbox(x0, x1, -c["out"], 0, z0, z1, side="rust", top="rust", bottom="under")
    for xx in (x0 + 0.3, (x0 + x1) / 2, x1 - 0.3):
        B.cyl((xx, -0.02, z0 - 0.35), (xx, -c["out"] + 0.08, z0 - 0.01), 0.025, "metal", 6)
if "tarp" in s:
    t = s["tarp"]; x0, x1, z0, z1 = X(t["r"][0]), X(t["r"][1]), Z(t["r"][3]), Z(t["r"][2])
    out, drop = t["out"], t["drop"]
    # sloped tarp: back edge on the wall at z1, front edge lower; the elevation maps by (x,z)
    zf = z1 - drop
    B.face([(x0, -out, zf), (x1, -out, zf), (x1, 0, z1), (x0, 0, z1)], "facade",
           [fuv(x0, zf), fuv(x1, zf), fuv(x1, z1), fuv(x0, z1)])
    B.face([(x0, 0, z1 - 0.01), (x1, 0, z1 - 0.01), (x1, -out, zf - 0.01), (x0, -out, zf - 0.01)], "under", [(0, 0)] * 4)
    fquad([(x0, -out, z0), (x1, -out, z0), (x1, -out, zf), (x0, -out, zf)])           # valance
    for px in t.get("posts", []):
        xx = X(px)
        B.cyl((xx, -out + 0.03, zf), (xx, -0.02, zf - 0.9), 0.022, "rust", 6)
for (a, b, py) in s.get("tubes", []):
    z = Z(py)
    B.box(X(a), X(b), -0.22, -0.12, z - 0.05, z, "galv", tile=(1, 1))
    B.box(X(a) + 0.03, X(b) - 0.03, -0.21, -0.13, z - 0.07, z - 0.05, "bulb", tile=(1, 1))

def gooseneck(px, py):
    x, z = X(px), Z(py)
    B.cyl((x, 0, z + 0.28), (x, -0.32, z + 0.28), 0.018, "metal", 6)
    B.cyl((x, -0.32, z + 0.28), (x, -0.36, z + 0.08), 0.018, "metal", 6)
    B.cyl((x, -0.36, z + 0.1), (x, -0.36, z - 0.06), 0.04, "galv", 10, r1=0.17)
    B.cyl((x, -0.36, z - 0.05), (x, -0.36, z - 0.07), 0.12, "bulb", 10)
for (px, py) in s.get("lamps", []):
    gooseneck(px, py)
for (px, py) in s.get("floods", []):
    x, z = X(px), Z(py)
    B.box(x - 0.2, x + 0.2, -0.3, -0.08, z - 0.15, z + 0.15, "galv", tile=(1, 1))
    B.box(x - 0.17, x + 0.17, -0.31, -0.3, z - 0.12, z + 0.12, "bulb", tile=(1, 1))

if "dock" in s:
    d = s["dock"]; x0, x1, h = X(d["r"][0]), X(d["r"][1]), Z(d["r"][2])
    fbox(x0, x1, -d["out"], 0, 0, h, side="concrete", top="concrete")
    for xx in (x0 + 0.05, x1 - 0.05):
        pass
if "stairs" in s:
    st = s["stairs"]; x0, x1, h = X(st["r"][0]), X(st["r"][1]), Z(st["r"][2])
    n, run = st["steps"], st["run"]
    for i in range(n):
        zt = h * (n - i) / n
        y0 = -run * (i + 1)
        y1 = -run * i if i else 0.0
        fbox(x0, x1, y0, y1 if i else 0.0, 0, zt, side="concrete", top="concrete")
    for xx in (x0 + 0.06, x1 - 0.06):
        B.cyl((xx, -run * n, 0.95), (xx, -0.05, h + 0.95), 0.025, "yellow", 6)
        for k in range(3):
            yy = -run * n * (1 - k / 2) if k < 2 else -0.05
            zz = h * (k / 2) if k < 2 else h
            B.cyl((xx, yy, zz), (xx, yy, zz + 0.95), 0.025, "yellow", 6)
for (px, py) in s.get("bollards", []):
    x, top = X(px), Z(py)
    B.cyl((x, -0.25, 0), (x, -0.25, top), 0.1, "yellow", 10)
for (px, count) in s.get("tires", []):
    x = X(px)
    for k in range(count):
        B.cyl((x, -0.45, 0.22 * k + 0.01), (x, -0.45, 0.22 * k + 0.2), 0.33, "rubber", 14)

# ---------------------------------------------------------------- roof gear
rb = roof_base if roof_base is not None else None
rf = s.get("roof", {})
def roof_at(x):
    return rb if rb is not None else roof_z(x) + 0.06
for (a, b, fy) in rf.get("ac", []):
    x0, x1 = X(a), X(b); z = roof_at((x0 + x1) / 2); y = D * fy + 0.6
    B.box(x0, x1, y, y + 1.0, z, z + 0.85, "galv", tile=(1, 1))
    B.box(x0 + 0.1, x1 - 0.1, y - 0.01, y, z + 0.15, z + 0.75, "metal", tile=(1, 1))
for px in rf.get("turbine", []):
    x = X(px); z = roof_at(x); y = 1.4
    B.cyl((x, y, z), (x, y, z + 0.45), 0.13, "galv", 10)
    B.cyl((x, y, z + 0.45), (x, y, z + 0.72), 0.24, "galv", 12, r1=0.16)
    B.cyl((x, y, z + 0.72), (x, y, z + 0.8), 0.16, "galv", 12, r1=0.04)
for px in rf.get("stack", []):
    x = X(px); z = roof_at(x)
    B.cyl((x, 1.0, z), (x, 1.0, z + 0.55), 0.07, "galv", 8)
    B.cyl((x, 1.0, z + 0.55), (x, 1.0, z + 0.62), 0.11, "galv", 8)

ob = B.finish()[0]
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("SIZE", round(W1 - W0, 2), "x", D, "x", round(HMAX, 2))
