"""Reservoir Water Tower from the owner's straight-on front view.

python water_tower.py -- <ref/front-water-tower.png dir> <out.blend>
Centred on the origin, the painted "Reservoir / WATER TOWER / STIXX" face looks -Y
(+Z in three.js). The tank, roof cone and bowl are wrapped with the front view by
cylindrical projection (exact for the visible half); the back half reuses the
graffiti band at the tank's left edge so no lettering appears mirrored.
"""
import sys, math, os
sys.path.insert(0, "/tmp/lj")
import bpy
from PIL import Image
from lib3d import Builder, material, srgb, reset

a = sys.argv[sys.argv.index("--") + 1:]
REF, OUT = a[0], a[1]
reset()
SRC = os.path.join(REF, "front-water-tower.png")
im = Image.open(SRC).convert("RGB")
IW, IH = im.size
im.save("/tmp/lj/tex/tower_atlas.png")

G, CX, PPM = 990, 720, 80.0            # ground line, tank centre, pixels per metre
X = lambda px: (px - CX) / PPM
Z = lambda py: (G - py) / PPM
def uv(px, py): return (px / IW, 1 - py / IH)

M = {
    "paint": material("WT_Paint", "tower_atlas.png", rough=0.7, metal=0.35),
    "rust": material("WT_Rust", color=srgb("6e4632"), rough=0.75, metal=0.5),
    "steel": material("WT_Steel", color=srgb("5d6166"), rough=0.6, metal=0.7),
    "yellow": material("WT_Yellow", color=srgb("c9a133"), rough=0.6, metal=0.3),
    "concrete": material("R_Concrete", "concrete_albedo.png", rough=0.92, normal="concrete_normal.png"),
    "fence": material("S_Fence", "chainlink.png", rough=0.5, metal=0.6, alpha=True),
    "galv": material("S_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "box": material("WT_UtilityBox", color=srgb("8f9488"), rough=0.6, metal=0.4),
    "bulb": material("R_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1.0, 0.82, 0.55), emit_strength=4.0),
}
B = Builder(M); B.use("ReservoirWaterTower")

R_PX = 330.0                            # tank radius in pixels (x 390..1050)
R = R_PX / PPM
SEG = 32
def ring_uv(theta, py):
    """theta 0 = facing the viewer (-Y). Front half projects straight; back half
    maps onto the graffiti band at the left edge of the tank (x 405..545)."""
    s = math.sin(theta)
    if math.cos(theta) >= 0:
        px = CX + R_PX * s
    else:
        t = (theta % (2 * math.pi)) / (2 * math.pi)
        px = 405 + 140 * abs(math.sin(theta * 2))
    return uv(px, py)
def P(theta, r, z):
    return (r * math.sin(theta), -r * math.cos(theta), z)

def wrapped(r0, r1, py0, py1, n=SEG):
    """Cylinder/cone band between image rows py0 (top) and py1 (bottom)."""
    for i in range(n):
        t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        tm = (t0 + t1) / 2
        if math.cos(tm) >= 0:
            u = [ring_uv(t, 0)[0] for t in (t0, t1)]
        else:   # back half: repeat the graffiti band 4x, continuous within each face
            k0 = ((t0 - math.pi / 2) % (2 * math.pi)) / math.pi * 4
            k1 = k0 + (t1 - t0) / math.pi * 4
            f = k0 - math.floor(k0)
            u = [(405 + 140 * f) / IW, (405 + 140 * (f + k1 - k0)) / IW]
        z0, z1 = Z(py1), Z(py0)
        B.face([P(t0, r1, z0), P(t1, r1, z0), P(t1, r0, z1), P(t0, r0, z1)], "paint",
               [(u[0], 1 - py1 / IH), (u[1], 1 - py1 / IH), (u[1], 1 - py0 / IH), (u[0], 1 - py0 / IH)])

TANK_TOP, TANK_BOT, BOWL_BOT, APEX = 150, 495, 610, 40
wrapped(R, R, TANK_TOP, TANK_BOT)                       # tank wall
wrapped(R * 0.06, R * 1.03, APEX, TANK_TOP)              # roof cone
wrapped(R * 0.98, R * 0.35, TANK_BOT, BOWL_BOT)          # bowl
B.cyl((0, 0, Z(BOWL_BOT)), (0, 0, Z(BOWL_BOT) + 0.01), R * 0.35, "rust", 16)
B.cyl((0, 0, Z(APEX)), (0, 0, Z(APEX) + 0.25), 0.22, "steel", 10)       # finial
B.cyl((0, 0, Z(APEX) + 0.25), (0, 0, Z(APEX) + 0.32), 0.3, "steel", 10, r1=0.1)

# catwalk ring + railing (yellow), lamps under it
CW = 385 / PPM; zc = Z(505)
for i in range(SEG):
    t0, t1 = 2 * math.pi * i / SEG, 2 * math.pi * (i + 1) / SEG
    B.face([P(t0, R, zc), P(t0, CW, zc), P(t1, CW, zc), P(t1, R, zc)], "steel", [(0, 0)] * 4)
    B.face([P(t0, CW, zc - 0.12), P(t1, CW, zc - 0.12), P(t1, CW, zc), P(t0, CW, zc)], "rust", [(0, 0)] * 4)
    for h in (0.5, 1.0):
        B.cyl(P(t0, CW - 0.05, zc + h), P(t1, CW - 0.05, zc + h), 0.025, "yellow", 5, caps=False)
    if i % 2 == 0:
        B.cyl(P(t0, CW - 0.05, zc), P(t0, CW - 0.05, zc + 1.0), 0.025, "yellow", 5)
for th in (-0.35, 0.35):
    p = P(th, R * 0.9, zc - 0.2)
    B.box(p[0] - 0.25, p[0] + 0.25, p[1] - 0.12, p[1] + 0.12, p[2] - 0.12, p[2], "steel", tile=(1, 1))
    B.box(p[0] - 0.21, p[0] + 0.21, p[1] - 0.1, p[1] + 0.1, p[2] - 0.14, p[2] - 0.12, "bulb", tile=(1, 1))

# legs: four splayed box legs on concrete piers, X-braced
zt, zb = Z(520), Z(915)
top_r, bot_r = R * 0.82, 470 / PPM
LEGS = [math.pi / 4 + k * math.pi / 2 for k in range(4)]
def leg_box(t):
    a, b = P(t, top_r, zt), P(t, bot_r, zb)
    B.cyl(b, a, 0.26, "rust", 4)
    p = P(t, bot_r, 0)
    B.box(p[0] - 0.55, p[0] + 0.55, p[1] - 0.55, p[1] + 0.55, 0, zb + 0.02, "concrete", tile=(1, 1))
for t in LEGS:
    leg_box(t)
for k in range(4):
    t0, t1 = LEGS[k], LEGS[(k + 1) % 4]
    for (za, zb2) in ((Z(600), Z(780)), (Z(780), Z(900))):
        f = lambda z: top_r + (bot_r - top_r) * (zt - z) / (zt - zb)
        B.cyl(P(t0, f(za), za), P(t1, f(zb2), zb2), 0.06, "steel", 4)
        B.cyl(P(t1, f(za), za), P(t0, f(zb2), zb2), 0.06, "steel", 4)
    zh = Z(780); f = lambda z: top_r + (bot_r - top_r) * (zt - z) / (zt - zb)
    B.cyl(P(t0, f(zh), zh), P(t1, f(zh), zh), 0.07, "steel", 4)
B.cyl((0, 0, 0), (0, 0, Z(BOWL_BOT)), 0.3, "rust", 10)                  # riser pipe
B.box(-0.6, 0.6, -0.6, 0.6, 0, 0.8, "concrete", tile=(1, 1))

# ladder with safety cage on the right (+x) side, ground to roof
lx = X(1068); ly = -0.0
for dx in (-0.22, 0.22):
    B.cyl((lx + dx, ly - R * 0.15, 0.6), (lx + dx, ly - R * 0.15, Z(80)), 0.03, "yellow", 5)
z = 0.9
while z < Z(80):
    B.cyl((lx - 0.22, ly - R * 0.15, z), (lx + 0.22, ly - R * 0.15, z), 0.018, "yellow", 4, caps=False)
    z += 0.3
z = zc + 0.4
while z < Z(70):
    for k in range(8):
        a0, a1 = math.pi * k / 8, math.pi * (k + 1) / 8
        c = lambda ang: (lx + 0.38 * math.cos(ang), ly - R * 0.15 - 0.38 * math.sin(ang) - 0.05, z)
        B.cyl(c(a0), c(a1), 0.015, "yellow", 4, caps=False)
    z += 0.7

# fenced compound with gate signs and utility boxes
F = 6.75; FH = 2.4
def fence(p0, p1):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    B.face([(x0, y0, 0.02), (x1, y1, 0.02), (x1, y1, FH), (x0, y0, FH)], "fence", [(0, 0), (L, 0), (L, FH), (0, FH)])
    B.face([(x1, y1, 0.02), (x0, y0, 0.02), (x0, y0, FH), (x1, y1, FH)], "fence", [(L, 0), (0, 0), (0, FH), (L, FH)])
    for h in (FH, FH + 0.25):
        B.cyl((x0, y0, h), (x1, y1, h), 0.025, "galv", 6, caps=False)
    n = max(1, int(L / 2.5))
    for i in range(n + 1):
        t = i / n
        B.cyl((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, FH + 0.35), 0.04, "galv", 6)
fence((-F, -F), (F, -F)); fence((F, -F), (F, F)); fence((F, F), (-F, F)); fence((-F, F), (-F, -F))
# the two signs on the gate, cut from the front view
for (x0, x1, y0, y1) in ((583, 688, 828, 907), (798, 862, 853, 897)):
    a_, b_ = X(x0), X(x1); za, zb2 = Z(y1), Z(y0)
    B.face([(a_, -F - 0.03, za), (b_, -F - 0.03, za), (b_, -F - 0.03, zb2), (a_, -F - 0.03, zb2)], "paint",
           [uv(x0, y1), uv(x1, y1), uv(x1, y0), uv(x0, y0)])
B.box(X(1090), X(1180), -F + 0.2, -F + 1.0, 0, 1.6, "box", tile=(1, 1))
B.box(X(280), X(340), -F + 0.2, -F + 0.8, 0, 1.1, "box", tile=(1, 1))
B.box(-F, F, -F, F, -0.01, 0.0, "concrete", tile=(4, 4), skip=("bottom", "front", "back", "left", "right"))

B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("TOWER height", round(Z(APEX) + 0.32, 1), "tank dia", round(2 * R, 1))
