"""Reservoir houses from a front view (or a rectified angled view) + a spec in houses.json.

python house.py -- <houses.json> <id> <ref dir> <out.blend>
Front plane at y=0 facing -Y (+Z in three.js), centred on x=0. Everything facing
the street is textured by projecting the front view; real depth comes from recessed
openings, porch decks, posts, piers, railings, steps, roofs, chimney and fence.
Yard ground runs out to y=-yard: put that line on the sidewalk edge.
"""
import sys, os, math
sys.path.insert(0, "/tmp/lj")
import bpy
import numpy as np
from PIL import Image
from lib3d import Builder, material, srgb, reset

a = sys.argv[sys.argv.index("--") + 1:]
import json
S = json.load(open(a[0]))[a[1]]; REF, OUT, BID = a[2], a[3], a[1]
reset()
im = Image.open(os.path.join(REF, S["src"])).convert("RGB")
IW, IH = im.size
im.save(f"/tmp/lj/tex/{BID}_atlas.png")
arr = np.asarray(im); em = np.zeros_like(arr)
for x0, x1, y0, y1 in S.get("lamps", []):
    em[y0:y1, x0:x1] = arr[y0:y1, x0:x1]
Image.fromarray(em).save(f"/tmp/lj/tex/{BID}_emissive.png")
x0, x1, y0, y1 = S["side"]
crop = im.crop((x0, y0, x1, y1))
if "sidetile" in S:
    crop.resize((512, 256), Image.LANCZOS).save(f"/tmp/lj/tex/{BID}_side.png")
else:   # paint bands of a clean strip times wood/stucco detail
    strip = np.asarray(crop.resize((32, 512), Image.LANCZOS)).astype(np.float32)
    prof = np.median(strip, axis=1)
    det = np.asarray(Image.open("/tmp/lj/tex/concrete_albedo.png").convert("RGB").resize((512, 512))).astype(np.float32).mean(2, keepdims=True)
    det = 1 + (det / det.mean() - 1) * 0.6
    Image.fromarray(np.clip(np.tile(prof[:, None, :], (1, 512, 1)) * det, 0, 255).astype(np.uint8)).save(f"/tmp/lj/tex/{BID}_side.png")

G, PPM = S["G"], S["ppm"]
CX = (S["L"] + S["R"]) / 2
X = lambda px: (px - CX) / PPM
Z = lambda py: (G - py) / PPM
def fuv(x, z): return ((CX + x * PPM) / IW, 1 - (G - z * PPM) / IH)
N = S["name"]
M = {
    "front": material(N + "_Front", f"{BID}_atlas.png", rough=0.85, emissive=f"{BID}_emissive.png", emit_strength=0.0),
    "glass": material(N + "_Window", f"{BID}_atlas.png", rough=0.2, emissive=f"{BID}_emissive.png", emit_strength=0.0),
    "side": material(N + "_Side", f"{BID}_side.png", rough=0.9),
    "roof": material("R_Roof", "roof_albedo.png", rough=0.95, tint=srgb("8a6a58")),
    "trim": material(N + "_Trim", color=srgb("b8a88e"), rough=0.8),
    "concrete": material("R_Concrete", "concrete_albedo.png", rough=0.92, normal="concrete_normal.png"),
    "yard": material("S_Yard", "yard_albedo.png", rough=0.98),
    "walk": material("S_Sidewalk", "sidewalk_albedo.png", rough=0.9, normal="sidewalk_normal.png"),
    "metal": material("R_DarkMetal", color=srgb("2b2d30"), rough=0.5, metal=0.7),
    "galv": material("S_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "fence": material("S_Fence", "chainlink.png", rough=0.5, metal=0.6, alpha=True),
    "brick": material("H_Brick", "brick_albedo.png", rough=0.9, normal="brick_normal.png"),
    "bulb": material("R_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1.0, 0.82, 0.55), emit_strength=4.0),
}
B = Builder(M); B.use(N)
def fq(pts, mat="front"): B.face(pts, mat, [fuv(p[0], p[2]) for p in pts])
def fbox(x0, x1, y0, y1, z0, z1, side="trim", top="trim"):
    fq([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    B.box(x0, x1, y0, y1, z0, z1, side, tile=(1, 1), skip=("front", "back"), mats={"top": top, "bottom": side})
ST = S.get("sidetile", [2.5, None])
def side(pts, zmax):
    vert = abs(pts[0][0] - pts[1][0]) < 1e-6
    B.face(pts, "side", [((p[1] if vert else p[0]) / ST[0], p[2] / (ST[1] or zmax)) for p in pts])

def wall_with_holes(y, xa_, xb_, ztop, holes):
    xs = sorted({xa_, xb_, *[h[0] for h in holes], *[h[1] for h in holes]})
    for xa, xb in zip(xs, xs[1:]):
        mid = (xa + xb) / 2
        spans = sorted((h[2], h[3]) for h in holes if h[0] < mid < h[1])
        z = 0.0
        for z0, z1 in spans:
            if z0 > z: fq([(xa, y, z), (xb, y, z), (xb, y, z0), (xa, y, z0)])
            z = max(z, z1)
        if ztop > z: fq([(xa, y, z), (xb, y, z), (xb, y, ztop), (xa, y, ztop)])
    for x0, x1, z0, z1, d, k in holes:
        B.quad((x0, y, z0), (x0, y + d, z0), (x0, y + d, z1), (x0, y, z1), "trim")
        B.quad((x1, y + d, z0), (x1, y, z0), (x1, y, z1), (x1, y + d, z1), "trim")
        B.quad((x0, y, z1), (x1, y, z1), (x1, y + d, z1), (x0, y + d, z1), "trim")
        if z0 > 0.02: B.quad((x0, y + d, z0), (x1, y + d, z0), (x1, y, z0), (x0, y, z0), "trim")
        fq([(x0, y + d, z0), (x1, y + d, z0), (x1, y + d, z1), (x0, y + d, z1)], "glass" if k == "glass" else "front")
holes = [(X(o[0]), X(o[1]), Z(o[3]), Z(o[2]), o[4], o[5]) for o in S["openings"]]

W0, W1, D = X(S["L"]), X(S["R"]), S["depth"]
EAVE = Z(S["eave"])
SB = S.get("setback", 0.0)
R = S["roof"]
OH = 0.3
if "box" in S:   # enclosed front porch: its wall carries the openings, the main house sits behind
    bx = S["box"]; BT = Z(bx["top"])
    wall_with_holes(0.0, W0, W1, BT, holes)
    side([(W0, SB, 0), (W0, 0, 0), (W0, 0, BT), (W0, SB, BT)], EAVE)
    side([(W1, 0, 0), (W1, SB, 0), (W1, SB, BT), (W1, 0, BT)], EAVE)
    rx0, rx1 = X(bx["x0"]), X(bx["x1"])
    zf, zb = Z(bx["roof_front"]), Z(bx["roof_back"])
    pts = [(rx0, -0.25, zf), (rx1, -0.25, zf), (rx1, SB, zb), (rx0, SB, zb)]
    fq(pts); B.face(pts[::-1], "trim", [(0, 0)] * 4)
    for xe in (rx0, rx1):   # hip ends
        tri = [(xe, -0.25, zf), (xe, SB, zf), (xe, SB, zb)] if xe > 0 else [(xe, SB, zf), (xe, -0.25, zf), (xe, SB, zb)]
        B.face(tri, "roof", [(0, 0), (1, 0), (1, 1)])
    fq([(rx0, -0.25, BT), (rx1, -0.25, BT), (rx1, -0.25, zf), (rx0, -0.25, zf)])
    B.quad((rx0, -0.25, BT), (rx0, 0, BT), (rx1, 0, BT), (rx1, -0.25, BT), "trim")
    fq([(W0, SB, 0), (W1, SB, 0), (W1, SB, EAVE), (W0, SB, EAVE)])
else:
    wall_with_holes(0.0, W0, W1, EAVE, holes)
side([(W0, D, 0), (W0, SB, 0), (W0, SB, EAVE), (W0, D, EAVE)], EAVE)
side([(W1, SB, 0), (W1, D, 0), (W1, D, EAVE), (W1, SB, EAVE)], EAVE)
side([(W1, D, 0), (W0, D, 0), (W0, D, EAVE), (W1, D, EAVE)], EAVE)

if R["type"] == "side":
    RX0, RX1, ZE, ZR = X(R["x0"]), X(R["x1"]), Z(R["eave"]), Z(R["ridge"])
    RID = D / 2
    fq([(RX0, -OH, ZE), (RX1, -OH, ZE), (RX1, RID, ZR), (RX0, RID, ZR)])
    B.face([(RX1, D + OH, ZE), (RX0, D + OH, ZE), (RX0, RID, ZR), (RX1, RID, ZR)], "roof", [(0, 0), (4, 0), (4, 2), (0, 2)])
    side([(W0, D, EAVE), (W0, 0, EAVE), (W0, RID, ZR)], ZR)
    side([(W1, 0, EAVE), (W1, D, EAVE), (W1, RID, ZR)], ZR)
    def roof_z(y, x=None): return ZE + (ZR - ZE) * (min(y, RID) + OH) / (RID + OH)
else:
    ax, ZR = X(R["apex"][0]), Z(R["apex"][1])
    lx, rx = X(R["lx"]), X(R["rx"])
    fq([(W0, SB, EAVE), (W1, SB, EAVE), (ax, SB, ZR)])
    B.face([(W1, D, EAVE), (W0, D, EAVE), (ax, D, ZR)], "side", [(0, 0), (2, 0), (1, 1)])
    for xe, s in ((lx, -1), (rx, 1)):
        pts = [(xe, SB - OH, EAVE - 0.1), (xe, D + OH, EAVE - 0.1), (ax, D + OH, ZR + 0.05), (ax, SB - OH, ZR + 0.05)]
        if s > 0: pts = pts[::-1]
        B.face(pts, "roof", [(0, 0), (4, 0), (4, 2), (0, 2)]); B.face(pts[::-1], "trim", [(0, 0)] * 4)
        B.cyl((xe, SB - OH, EAVE - 0.12), (ax, SB - OH, ZR + 0.02), 0.06, "trim", 4)
    def roof_z(y, x=None):
        if x is None: return ZR - 0.4
        half = max(ax - lx, rx - ax)
        return EAVE + (ZR - EAVE) * max(0.0, 1 - abs(x - ax) / half)

# open porch
P = S.get("porch")
if P:
    PY = -P["depth"]; DZ = Z(P["deck"])
    fbox(X(P["x0"]), X(P["x1"]), PY, 0, 0, DZ, side="concrete", top="concrete")
    for a_, b_, t, u in P.get("piers", []):
        fbox(X(a_), X(b_), PY - 0.04, PY + 0.3, Z(u), Z(t))
    for a_, b_, t, u in P["posts"]:
        fbox(X(a_), X(b_), PY + 0.02, PY + 0.25, Z(u), Z(t))
    if "beam" in P:
        a_, b_, t, u = P["beam"]; fbox(X(a_), X(b_), PY - 0.05, PY + 0.25, Z(u), Z(t))
    if "gable" in P:
        g = P["gable"]; ax2, az2 = X(g["apex"][0]), Z(g["apex"][1]); l2, r2, gz = X(g["l"][0]), X(g["r"][0]), Z(g["l"][1])
        GY = PY - 0.1; GB = 2.6
        fq([(l2, GY, gz), (r2, GY, gz), (ax2, GY, az2)])
        for x0 in (l2, r2):
            pts = [(x0, GY - 0.1, gz - 0.05), (x0, GB, gz - 0.05), (ax2, GB, az2 + 0.06), (ax2, GY - 0.1, az2 + 0.06)]
            B.face(pts, "roof", [(0, 0), (3, 0), (3, 1.5), (0, 1.5)]); B.face(pts[::-1], "roof", [(0, 1.5), (3, 1.5), (3, 0), (0, 0)])
        tri = [(r2, GB, gz - 0.05), (l2, GB, gz - 0.05), (ax2, GB, az2)]
        B.face(tri, "side", [(0, 0), (2, 0), (1, 0.6)]); B.face(tri[::-1], "side", [(1, 0.6), (2, 0), (0, 0)])
        B.quad((l2, GY, gz - 0.01), (l2, 0, gz - 0.01), (r2, 0, gz - 0.01), (r2, GY, gz - 0.01), "trim")
    if "shed" in P:
        sh = P["shed"]; x0, x1 = X(sh["x0"]), X(sh["x1"]); zf, zb = Z(sh["front"]), Z(sh["back"])
        pts = [(x0, PY - 0.1, zf), (x1, PY - 0.1, zf), (x1, 0, zb), (x0, 0, zb)]
        fq(pts); B.face(pts[::-1], "trim", [(0, 0)] * 4)
        fq([(x0, PY - 0.1, Z(sh["fascia"])), (x1, PY - 0.1, Z(sh["fascia"])), (x1, PY - 0.1, zf), (x0, PY - 0.1, zf)])
    for a_, b_, top in P.get("balusters", []):
        xa, xb, zt = X(a_), X(b_), Z(top)
        B.box(xa, xb, PY + 0.06, PY + 0.14, zt - 0.06, zt, "trim", tile=(1, 1))
        n = max(1, int((xb - xa) / 0.16))
        for i in range(n + 1):
            x = xa + (xb - xa) * i / n
            B.box(x - 0.025, x + 0.025, PY + 0.08, PY + 0.12, DZ, zt, "trim", tile=(1, 1))
    for a_, b_, n in P.get("steps", []):
        run = 0.3
        for i in range(n):
            fbox(X(a_), X(b_), PY - run * (i + 1), PY - run * i, 0, DZ * (n - i) / (n + 0.6), side="concrete", top="concrete")
    for px in P.get("rails", []):
        x = X(px); n = 4
        B.cyl((x, PY - 0.3 * n + 0.1, 0.9), (x, PY + 0.1, DZ + 0.9), 0.02, "metal", 5)
        B.cyl((x, PY - 0.3 * n + 0.1, 0), (x, PY - 0.3 * n + 0.1, 0.9), 0.02, "metal", 5)
    if "shed" in P or "balusters" in P:
        for a_, b_, n in P.get("steps", []):
            for px in (a_, b_):
                x = X(px)
                B.box(x - 0.05, x + 0.05, PY - 0.3 * n, PY, 0, 0.1, "trim", tile=(1, 1))
                B.obox(((x), PY - 0.15 * n, 0.45 + DZ * 0.5), (0.08, 0.3 * n + 0.1, 0.08), 0, "trim")
for a_, b_, n, top in S.get("steps", []):
    run = 0.3; zt = Z(top)
    for i in range(n):
        fbox(X(a_), X(b_), -run * (i + 1), -run * i, 0, zt * (n - i) / n, side="concrete", top="concrete")

if "chimney" in S:
    c0, c1, top = S["chimney"]
    ycen = 2.0 if R["type"] == "side" else D * 0.55
    zb = roof_z(ycen, X((c0 + c1) / 2)) - 0.6 if R['type'] == 'front' else roof_z(ycen) - 0.6
    B.box(X(c0), X(c1), ycen - 0.45, ycen + 0.45, zb, Z(top), "brick", tile=(1, 2))
if "turbine" in S:
    x = X(S["turbine"][0]); ztop = Z(S["turbine"][1]); y = 2.6
    B.cyl((x, y, roof_z(y) - 0.3), (x, y, ztop - 0.45), 0.1, "galv", 10)
    B.cyl((x, y, ztop - 0.45), (x, y, ztop), 0.22, "galv", 12, r1=0.12)

YD = S["yard"]
B.quad((W0 - 1.0, -YD, -0.01), (W1 + 1.0, -YD, -0.01), (W1 + 1.0, D + 1.0, -0.01), (W0 - 1.0, D + 1.0, -0.01), "yard", (4, 4))
if "fence" in S:
    FY, g0, g1 = -S["fence"][0], X(S["fence"][1]), X(S["fence"][2]); FH = 1.1
    def fence(p0, p1):
        (xa, ya), (xb, yb) = p0, p1; L = math.hypot(xb - xa, yb - ya)
        B.face([(xa, ya, 0.02), (xb, yb, 0.02), (xb, yb, FH), (xa, ya, FH)], "fence", [(0, 0), (L, 0), (L, FH), (0, FH)])
        B.cyl((xa, ya, FH), (xb, yb, FH), 0.022, "galv", 6, caps=False)
        for x, y in (p0, p1): B.cyl((x, y, 0), (x, y, FH + 0.05), 0.035, "galv", 6)
    fence((W0 - 0.9, FY), (g0, FY)); fence((g1, FY), (W1 + 0.9, FY))
    fence((W0 - 0.9, FY), (W0 - 0.9, D)); fence((W1 + 0.9, FY), (W1 + 0.9, D))
    B.quad((g0, FY, 0.0), (g1, FY, 0.0), (g1, -0.9, 0.0), (g0, -0.9, 0.0), "walk", (1, 2))
B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("HOUSE", BID, round(W1 - W0, 2), "x", D)
