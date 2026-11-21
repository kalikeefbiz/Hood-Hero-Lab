"""Blocc Boy Boulevard + Kirkwood St south of Lil Bit Lane (Reservoir street 2).

python blocc_boy_street.py -- out.blend
Same conventions as art/strip/scripts/street.py: Blender y = -(three.js z), the
road surface is at z=-0.15 and sidewalks at 0. Lil Bit Lane's strip ends at
y=-40 (its far lots); Kirkwood St keeps its x (6.6..14) and runs south past
Blocc Boy Blvd. North-side storefronts sit with their fronts on y=-44.8.
"""
import sys, math, random
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset

OUT = sys.argv[sys.argv.index("--") + 1]
reset()
random.seed(11)
M = {
    "asphalt": material("S_Asphalt", "asphalt_albedo.png", rough=0.92, normal="asphalt_normal.png"),
    "walk": material("S_Sidewalk", "sidewalk_albedo.png", rough=0.9, normal="sidewalk_normal.png"),
    "curb": material("S_Curb", "concrete_albedo.png", rough=0.9, normal="concrete_normal.png", tint=srgb("d8d2c8")),
    "yard": material("S_Yard", "yard_albedo.png", rough=0.98),
    "lot": material("S_LotPaving", "asphalt_albedo.png", rough=0.95, tint=srgb("b8b2a8")),
    "paint_y": material("S_PaintYellow", color=srgb("d6a531"), rough=0.7),
    "paint_w": material("S_PaintWhite", color=srgb("d8d6cf"), rough=0.7),
    "fence": material("S_Fence", "chainlink.png", rough=0.5, metal=0.6, alpha=True),
    "galv": material("S_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "pole": material("S_WoodPole", color=srgb("4a3b2d"), rough=0.9),
    "metal": material("S_DarkMetal", color=srgb("2a2c2e"), rough=0.5, metal=0.6),
    "wire": material("S_Wire", color=srgb("151515"), rough=0.6),
    "lens": material("S_Lamp_Lens", color=srgb("fff1d0"), rough=0.2, emit_color=(1.0, 0.78, 0.5), emit_strength=3.0),
    "hydrant": material("S_Hydrant", color=srgb("b8322a"), rough=0.5, metal=0.2),
    "dumpster": material("S_Dumpster", color=srgb("2f5a3a"), rough=0.6, metal=0.4),
    "bin": material("S_Bin", color=srgb("24272a"), rough=0.6),
    "grass": material("S_Grass", "grass_card.png", rough=0.9, alpha=True),
}
B = Builder(M)
B.use("BloccBoyStreet")
X0, X1 = -48.0, 22.0
SX0, SX1 = 6.6, 14.0                 # Kirkwood St
NF = -44.8                           # north storefront line
NC, RN, RS, SC = -48.0, -48.0, -57.4, -60.6   # north curb, road north/south edge, south curb
KS0, KS1 = -24.0, -78.0              # Kirkwood segment owned by this file
RZ, SZ = -0.15, 0.0

def ground(x0, x1, y0, y1, z, mat, tile):
    B.quad((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), mat, tile)
def curb_x(xa, xb, y, facing):
    if facing < 0:
        B.quad((xa, y, RZ), (xb, y, RZ), (xb, y, SZ), (xa, y, SZ), "curb", (1, 0.3))
    else:
        B.quad((xb, y, RZ), (xa, y, RZ), (xa, y, SZ), (xb, y, SZ), "curb", (1, 0.3))
def curb_y(ya, yb, x, facing):
    if facing > 0:
        B.quad((x, ya, RZ), (x, yb, RZ), (x, yb, SZ), (x, ya, SZ), "curb", (1, 0.3))
    else:
        B.quad((x, yb, RZ), (x, ya, RZ), (x, ya, SZ), (x, yb, SZ), "curb", (1, 0.3))

# ---------------------------------------------------------------- roads
ground(X0, X1, RS, RN, RZ, "asphalt", (4, 4))                       # Blocc Boy Blvd
ground(SX0, SX1, RN, KS0, RZ, "asphalt", (4, 4))                    # Kirkwood, north of the blvd
ground(SX0, SX1, KS1, RS, RZ, "asphalt", (4, 4))                    # Kirkwood, south
curb_x(X0, SX0, RN, -1); curb_x(SX1, X1, RN, -1)
curb_x(X0, SX0, RS, 1); curb_x(SX1, X1, RS, 1)
curb_y(RN, KS0, SX0, 1); curb_y(RN, KS0, SX1, -1)
curb_y(KS1, RS, SX0, 1); curb_y(KS1, RS, SX1, -1)
# sidewalks
ground(X0, SX0, RN, NF, SZ, "walk", (3, 3)); ground(SX1, X1, RN, NF, SZ, "walk", (3, 3))
ground(X0, SX0, SC, RS, SZ, "walk", (3, 3)); ground(SX1, X1, SC, RS, SZ, "walk", (3, 3))
ground(4.0, SX0, NF, -15.8, SZ, "walk", (3, 3)); ground(SX1, SX1 + 2.6, NF, -15.8, SZ, "walk", (3, 3))
ground(4.0, SX0, KS1, SC, SZ, "walk", (3, 3)); ground(SX1, SX1 + 2.6, KS1, SC, SZ, "walk", (3, 3))
# lots: paved commercial lots behind the north storefront line, yards south
ground(X0, 4.0, NF, -40.0, SZ - 0.01, "lot", (4, 4))
ground(SX1 + 2.6, X1, NF, -40.0, SZ - 0.02, "yard", (4, 4))
ground(X0, 4.0, KS1, SC, SZ - 0.02, "yard", (4, 4))
ground(SX1 + 2.6, X1, KS1, SC, SZ - 0.02, "yard", (4, 4))
# lane paint: double yellow, broken white lane lines (a boulevard: two lanes each way)
MID = (RN + RS) / 2
for yy in (MID - 0.08, MID + 0.08):
    for xa, xb in ((X0, SX0 - 3.0), (SX1 + 3.0, X1)):
        B.quad((xa, yy - 0.05, RZ + 0.004), (xb, yy - 0.05, RZ + 0.004), (xb, yy + 0.05, RZ + 0.004), (xa, yy + 0.05, RZ + 0.004), "paint_y", (1, 1))
for yy in (RN - 2.35, RS + 2.35):
    for xa, xb in ((X0, SX0 - 3.0), (SX1 + 3.0, X1)):
        x = xa
        while x + 3.0 < xb:
            B.quad((x, yy - 0.06, RZ + 0.004), (x + 3.0, yy - 0.06, RZ + 0.004), (x + 3.0, yy + 0.06, RZ + 0.004), (x, yy + 0.06, RZ + 0.004), "paint_w", (1, 1))
            x += 9.0
# crosswalks on all four legs of the Kirkwood intersection
for i in range(8):
    x = SX0 + 0.55 + i * 0.9
    for ya, yb in ((RN + 0.5, RN + 2.9), (RS - 2.9, RS - 0.5)):
        B.quad((x, ya, RZ + 0.004), (x + 0.5, ya, RZ + 0.004), (x + 0.5, yb, RZ + 0.004), (x, yb, RZ + 0.004), "paint_w", (1, 1))
for side_x0 in (SX0 - 3.0, SX1 + 0.6):
    for i in range(10):
        y = RS + 0.5 + i * 0.9
        B.quad((side_x0, y, RZ + 0.004), (side_x0 + 2.4, y, RZ + 0.004), (side_x0 + 2.4, y + 0.5, RZ + 0.004), (side_x0, y + 0.5, RZ + 0.004), "paint_w", (1, 1))
# parking lot west of the barbershop: stalls
for i in range(7):
    x = -46.5 + i * 2.7
    B.quad((x, NF + 0.5, SZ - 0.005), (x + 0.1, NF + 0.5, SZ - 0.005), (x + 0.1, NF + 5.5, SZ - 0.005), (x, NF + 5.5, SZ - 0.005), "paint_w", (1, 1))
for x in (-46.0, -42.0, -38.0):
    B.box(x - 0.9, x + 0.9, NF + 0.3, NF + 0.45, SZ, SZ + 0.12, "curb")

# ---------------------------------------------------------------- fences
def fence(p0, p1, h=1.2):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    B.face([(x0, y0, 0.02), (x1, y1, 0.02), (x1, y1, h), (x0, y0, h)], "fence", [(0, 0), (L, 0), (L, h), (0, h)])
    B.cyl((x0, y0, h), (x1, y1, h), 0.02, "galv", 6, caps=False)
    for i in range(int(L / 2.4) + 1):
        t = i / max(1, int(L / 2.4))
        B.cyl((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h + 0.05), 0.03, "galv", 6)
fence((X0 + 0.2, -40.2), (-29.0, -40.2), 1.8)          # back of the parking lot
fence((X0 + 0.2, SC - 0.2), (4.0 - 0.2, SC - 0.2))      # south lots, until their buildings arrive
fence((SX1 + 2.8, SC - 0.2), (X1, SC - 0.2))

# ---------------------------------------------------------------- poles, wires, lamps
POLES = [-40.0, -22.0, -6.5, 18.5]
PY = RN + 0.45
for x in POLES:
    B.cyl((x, PY, 0.0), (x, PY, 9.4), 0.15, "pole", 8, r1=0.12)
    B.box(x - 1.1, x + 1.1, PY - 0.07, PY + 0.07, 8.6, 8.74, "pole")
    for dx in (-0.9, 0.0, 0.9):
        B.cyl((x + dx, PY, 8.74), (x + dx, PY, 8.86), 0.04, "galv", 6)
    B.cyl((x, PY, 6.2), (x, PY - 1.6, 6.45), 0.045, "galv", 6)
    B.obox((x, PY - 1.85, 6.32), (0.32, 0.65, 0.16), 0.0, "galv")
    B.face([(x - 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 1.58, 6.315), (x - 0.13, PY - 1.58, 6.315)], "lens", [(0, 0)] * 4)
def wire(p0, p1, sag=0.45, n=10):
    pts = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t - sag * 4 * t * (1 - t))
           for t in (i / n for i in range(n + 1))]
    for a, b in zip(pts, pts[1:]):
        B.cyl(a, b, 0.012, "wire", 4, caps=False)
for a, b in zip(POLES, POLES[1:]):
    for dx in (-0.9, 0.0, 0.9):
        wire((a + dx, PY, 8.86), (b + dx, PY, 8.86))
# street lights on the south side (cobra heads facing the road)
for x in (-31.0, -12.0, 20.0):
    y = RS - 0.45
    B.cyl((x, y, 0.0), (x, y, 6.6), 0.09, "galv", 8, r1=0.07)
    B.cyl((x, y, 6.4), (x, y + 1.6, 6.6), 0.045, "galv", 6)
    B.obox((x, y + 1.85, 6.5), (0.32, 0.65, 0.16), 0.0, "galv")
    B.face([(x - 0.13, y + 1.58, 6.495), (x + 0.13, y + 1.58, 6.495), (x + 0.13, y + 2.12, 6.495), (x - 0.13, y + 2.12, 6.495)], "lens", [(0, 0)] * 4)

# ---------------------------------------------------------------- props
def hydrant(hx, hy):
    B.cyl((hx, hy, 0.0), (hx, hy, 0.62), 0.13, "hydrant", 10)
    B.cyl((hx, hy, 0.62), (hx, hy, 0.75), 0.15, "hydrant", 10, r1=0.06)
    B.cyl((hx - 0.2, hy, 0.42), (hx + 0.2, hy, 0.42), 0.055, "hydrant", 8)
hydrant(-8.8, RN + 0.5); hydrant(15.0, RS - 0.5)
for x in (-24.5, -16.0, 1.8):
    B.cyl((x, NF - 0.6, 0.0), (x, NF - 0.6, 1.0), 0.3, "bin", 10, r1=0.34)
B.obox((-28.4, -41.5, 0.0), (1.4, 2.0, 1.25), 0.05, "dumpster")
B.obox((-28.4, -41.5, 1.25), (1.5, 2.1, 0.08), 0.05, "metal")
B.obox((-5.5, NF - 0.7, 0.0), (0.45, 0.45, 1.05), 0.0, "dumpster")      # newspaper box
for _ in range(24):
    x, y = random.uniform(X0, 20), random.uniform(NF - 0.25, NF - 0.05)
    for a in (0.0, math.pi / 2):
        s = random.uniform(0.25, 0.4); dx, dy = math.cos(a) * 0.45 * s, math.sin(a) * 0.45 * s
        B.face([(x - dx, y - dy, 0.0), (x + dx, y + dy, 0.0), (x + dx, y + dy, 0.7 * s), (x - dx, y - dy, 0.7 * s)], "grass", [(0, 0), (1, 0), (1, 1), (0, 1)])

B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
