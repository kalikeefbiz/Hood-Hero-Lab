"""Reservoir boarded house (327) from the owner's straight-on front view.

python boarded_house.py -- <ref dir> <out.blend>
House centred on x=0, front wall at y=0 facing -Y; porch, steps and front yard run
out to the chain-link fence at y=-4.3 (put that on the sidewalk edge). Everything
that faces the street is textured by projecting the front view; real depth comes
from the porch, posts, railings, steps, the porch gable, roof, chimney and fence.
"""
import sys, os, math
sys.path.insert(0, "/tmp/lj")
import bpy
import numpy as np
from PIL import Image
from lib3d import Builder, material, srgb, reset

a = sys.argv[sys.argv.index("--") + 1:]
REF, OUT = a[0], a[1]
reset()
im = Image.open(os.path.join(REF, "front-boarded-house.png")).convert("RGB")
IW, IH = im.size
im.save("/tmp/lj/tex/boarded_atlas.png")
# night: only the porch light glows
em = np.zeros((IH, IW, 3), np.uint8); arr = np.asarray(im)
em[385:430, 700:750] = arr[385:430, 700:750]
Image.fromarray(em).save("/tmp/lj/tex/boarded_emissive.png")
# side walls: the paint bands of the right-hand wall times stucco detail
strip = np.asarray(im.crop((1168, 370, 1212, 940)).resize((32, 512), Image.LANCZOS)).astype(np.float32)
prof = np.median(strip, axis=1)
det = np.asarray(Image.open("/tmp/lj/tex/concrete_albedo.png").convert("RGB").resize((512, 512))).astype(np.float32).mean(2, keepdims=True)
det = 1 + (det / det.mean() - 1) * 0.9
Image.fromarray(np.clip(prof[:, None, :] * det, 0, 255).astype(np.uint8)).save("/tmp/lj/tex/boarded_side.png")

G, PPM = 940, 150.0
CX = (122 + 1300) / 2
X = lambda px: (px - CX) / PPM
Z = lambda py: (G - py) / PPM
def fuv(x, z): return ((CX + x * PPM) / IW, 1 - (G - z * PPM) / IH)

M = {
    "front": material("BH_Front", "boarded_atlas.png", rough=0.88, emissive="boarded_emissive.png", emit_strength=0.0),
    "side": material("BH_Side", "boarded_side.png", rough=0.9),
    "roof": material("R_Roof", "roof_albedo.png", rough=0.95, tint=srgb("8a6a58")),
    "trim": material("BH_Trim", color=srgb("cdbfa8"), rough=0.8),
    "concrete": material("R_Concrete", "concrete_albedo.png", rough=0.92, normal="concrete_normal.png"),
    "yard": material("S_Yard", "yard_albedo.png", rough=0.98),
    "walk": material("S_Sidewalk", "sidewalk_albedo.png", rough=0.9, normal="sidewalk_normal.png"),
    "metal": material("R_DarkMetal", color=srgb("2b2d30"), rough=0.5, metal=0.7),
    "galv": material("S_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "fence": material("S_Fence", "chainlink.png", rough=0.5, metal=0.6, alpha=True),
    "brick": material("H_Brick", "brick_albedo.png", rough=0.9, normal="brick_normal.png"),
    "bulb": material("R_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1.0, 0.82, 0.55), emit_strength=4.0),
}
B = Builder(M); B.use("BoardedHouse")

def fq(pts, mat="front"):
    B.face(pts, mat, [fuv(p[0], p[2]) for p in pts])
def fbox(x0, x1, y0, y1, z0, z1, side="trim", top="trim"):
    fq([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    B.box(x0, x1, y0, y1, z0, z1, side, tile=(1, 1), skip=("front", "back"), mats={"top": top, "bottom": side})

W0, W1, D = X(122), X(1300), 9.0
EAVE = Z(350)
# front wall with recessed boarded windows and door
holes = [(X(335), X(570), Z(615), Z(410), 0.06), (X(915), X(1120), Z(615), Z(410), 0.06), (X(655), X(800), Z(745), Z(438), 0.15)]
xs = sorted({W0, W1, *[h[0] for h in holes], *[h[1] for h in holes]})
for xa, xb in zip(xs, xs[1:]):
    mid = (xa + xb) / 2
    spans = sorted((h[2], h[3]) for h in holes if h[0] < mid < h[1])
    z = 0.0
    for z0, z1 in spans:
        if z0 > z: fq([(xa, 0, z), (xb, 0, z), (xb, 0, z0), (xa, 0, z0)])
        z = max(z, z1)
    fq([(xa, 0, z), (xb, 0, z), (xb, 0, EAVE), (xa, 0, EAVE)])
for x0, x1, z0, z1, d in holes:
    B.quad((x0, 0, z0), (x0, d, z0), (x0, d, z1), (x0, 0, z1), "trim")
    B.quad((x1, d, z0), (x1, 0, z0), (x1, 0, z1), (x1, d, z1), "trim")
    B.quad((x0, 0, z1), (x1, 0, z1), (x1, d, z1), (x0, d, z1), "trim")
    fq([(x0, d, z0), (x1, d, z0), (x1, d, z1), (x0, d, z1)])
# shell
SW = 2.5
def side(pts):
    B.face(pts, "side", [((p[1] if abs(pts[0][0] - pts[1][0]) < 1e-6 else p[0]) / SW, p[2] / EAVE) for p in pts])
side([(W0, D, 0), (W0, 0, 0), (W0, 0, EAVE), (W0, D, EAVE)])
side([(W1, 0, 0), (W1, D, 0), (W1, D, EAVE), (W1, 0, EAVE)])
side([(W1, D, 0), (W0, D, 0), (W0, D, EAVE), (W1, D, EAVE)])
# main side-gabled roof
RIDGE, ZR, ZE, OH = D / 2, Z(140), Z(325), 0.35
RX0, RX1 = X(70), X(1370)
fq([(RX0, -OH, ZE), (RX1, -OH, ZE), (RX1, RIDGE, ZR), (RX0, RIDGE, ZR)])
B.face([(RX1, D + OH, ZE), (RX0, D + OH, ZE), (RX0, RIDGE, ZR), (RX1, RIDGE, ZR)], "roof", [(0, 0), (4, 0), (4, 2), (0, 2)])
for x, sgn in ((W0, -1), (W1, 1)):
    pts = [(x, 0, EAVE), (x, D, EAVE), (x, RIDGE, ZR)] if sgn > 0 else [(x, D, EAVE), (x, 0, EAVE), (x, RIDGE, ZR)]
    side(pts)
B.face([(RX0, -OH, ZE - 0.12), (RX1, -OH, ZE - 0.12), (RX1, -OH, ZE), (RX0, -OH, ZE)], "trim", [(0, 0)] * 4)
# porch: deck, piers, posts, beam, shed roof, railings, steps
PY = -2.0
fbox(X(280), X(1180), PY, 0, 0, Z(750), side="concrete", top="concrete")
for a_, b_ in ((280, 355), (555, 630), (1100, 1175)):
    fbox(X(a_), X(b_), PY - 0.05, PY + 0.35, Z(750), Z(630))
for a_, b_ in ((300, 335), (575, 610), (1120, 1155)):
    fbox(X(a_), X(b_), PY + 0.02, PY + 0.3, Z(630), Z(375))
fbox(X(230), X(1230), PY - 0.15, PY + 0.15, Z(375), Z(352))
B.face([(X(230), PY - 0.15, Z(352)), (X(1230), PY - 0.15, Z(352)), (X(1230), 0, Z(300)), (X(230), 0, Z(300))], "front",
       [fuv(X(230), Z(352)), fuv(X(1230), Z(352)), fuv(X(1230), Z(300)), fuv(X(230), Z(300))])
B.face([(X(230), 0, Z(300) - 0.05), (X(1230), 0, Z(300) - 0.05), (X(1230), PY - 0.15, Z(352) - 0.05), (X(230), PY - 0.15, Z(352) - 0.05)], "trim", [(0, 0)] * 4)
for x0, x1 in ((X(355), X(555)), (X(630), X(590)), (X(910), X(1100))):
    if x1 <= x0: continue
    B.cyl((x0, PY + 0.1, Z(655)), (x1, PY + 0.1, Z(655)), 0.02, "metal", 5, caps=False)
    n = int((x1 - x0) / 0.14)
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        B.cyl((x, PY + 0.1, Z(750)), (x, PY + 0.1, Z(655)), 0.01, "metal", 4, caps=False)
NS = 5; run = 0.3
for i in range(NS):
    zt = Z(750) * (NS - i) / NS
    fbox(X(600), X(870), PY - run * (i + 1), PY - run * i, 0, zt, side="concrete", top="concrete")
for x in (X(595), X(880)):
    B.cyl((x, PY - run * NS, 0.9), (x, PY + 0.1, Z(750) + 0.9), 0.022, "metal", 5)
    B.cyl((x, PY - run * NS, 0), (x, PY - run * NS, 0.9), 0.022, "metal", 5)
# porch gable over the steps
GY = PY - 0.17
ax, az = X(727), Z(65)
lx, rx, gz = X(255), X(1200), Z(330)
fq([(lx, GY, gz), (rx, GY, gz), (ax, GY, az)])
GB = 3.0   # the porch gable's roof runs back to here and is closed by a small gable wall
for x0 in (lx, rx):
    pts = [(x0, GY - 0.12, gz - 0.05), (x0, GB, gz - 0.05), (ax, GB, az + 0.06), (ax, GY - 0.12, az + 0.06)]
    uvs = [(0, 0), (3, 0), (3, 1.5), (0, 1.5)]
    B.face(pts, "roof", uvs); B.face(pts[::-1], "roof", uvs[::-1])        # visible from both sides
    B.cyl((x0, GY - 0.12, gz - 0.08), (ax, GY - 0.12, az + 0.02), 0.06, "trim", 4)
tri = [(rx, GB, gz - 0.05), (lx, GB, gz - 0.05), (ax, GB, az)]
B.face(tri, "side", [(0, 0), (2, 0), (1, 0.6)]); B.face(tri[::-1], "side", [(1, 0.6), (2, 0), (0, 0)])
# chimney, roof vent, downspouts, porch light
fbox(X(185), X(275), 1.0, 1.9, Z(350), Z(45), side="brick", top="concrete")
x = X(982); B.cyl((x, 3.2, Z(140) - 0.4), (x, 3.2, Z(110)), 0.12, "galv", 10)
B.cyl((x, 3.2, Z(110)), (x, 3.2, Z(85)), 0.22, "galv", 12, r1=0.12)
for px in (140, 1285):
    B.cyl((X(px), -0.12, Z(345)), (X(px), -0.12, 0.35), 0.045, "galv", 6)
B.box(X(712), X(740), -0.25, -0.02, Z(425), Z(395), "bulb", tile=(1, 1))
# side gate, yard, walk, front fence
fbox(X(1300), X(1395), 1.2, 1.3, 0, Z(550), side="trim", top="trim")
B.quad((X(0), -4.4, -0.01), (X(1448), -4.4, -0.01), (X(1448), D + 0.5, -0.01), (X(0), D + 0.5, -0.01), "yard", (4, 4))
B.quad((X(610), -4.4, 0.0), (X(870), -4.4, 0.0), (X(870), PY - run * NS, 0.0), (X(610), PY - run * NS, 0.0), "walk", (1, 2))
FH = Z(735); FY = -4.3
def fence(x0, x1):
    L = x1 - x0
    B.face([(x0, FY, 0.02), (x1, FY, 0.02), (x1, FY, FH), (x0, FY, FH)], "fence", [(0, 0), (L, 0), (L, FH), (0, FH)])
    B.cyl((x0, FY, FH), (x1, FY, FH), 0.022, "galv", 6, caps=False)
    for x in (x0, x1):
        B.cyl((x, FY, 0), (x, FY, FH + 0.05), 0.035, "galv", 6)
fence(X(35), X(570)); fence(X(915), X(1410))
for x in (X(35), X(1410)):
    L = 4.3
    B.face([(x, FY, 0.02), (x, 0.0, 0.02), (x, 0.0, FH), (x, FY, FH)], "fence", [(0, 0), (L, 0), (L, FH), (0, FH)])
B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("HOUSE", round(W1 - W0, 2), "x", D, "ridge", round(ZR, 2))
