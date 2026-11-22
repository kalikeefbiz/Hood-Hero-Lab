"""A Reservoir street from a config entry in streets.json (same look as Blocc Boy Blvd).

python avenue.py -- <streets.json> <id> <out.blend>
Config is in three.js metres (x east, z south) and converted here (Blender y = -z).
Road surface at -0.15, sidewalks at 0, like art/strip/scripts/street.py.
Keys: x0, x1 road extent; zn road north edge (road is 9.4 m wide, sidewalks 3.2 m);
kirkwood: [[z_from, z_to], ...] stretches of Kirkwood St (x 6.6..14) with curbs and
sidewalks; poles_n / lights_s: x positions; yards / lots: [x0, x1, z0, z1];
fences: [[x0, z0, x1, z1, h]]; hydrants, bins: [[x, z]]; base: [x0, x1, z0, z1] for a
low dirt plane under everything (fills the gaps at the edge of the built area).
"""
import sys, json, math, random
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset

a = sys.argv[sys.argv.index("--") + 1:]
C = json.load(open(a[0]))[a[1]]; OUT = a[2]
reset(); random.seed(C.get("seed", 7))
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
    "wire": material("S_Wire", color=srgb("151515"), rough=0.6),
    "lens": material("S_Lamp_Lens", color=srgb("fff1d0"), rough=0.2, emit_color=(1.0, 0.78, 0.5), emit_strength=3.0),
    "hydrant": material("S_Hydrant", color=srgb("b8322a"), rough=0.5, metal=0.2),
    "bin": material("S_Bin", color=srgb("24272a"), rough=0.6),
    "grass": material("S_Grass", "grass_card.png", rough=0.9, alpha=True),
}
B = Builder(M); B.use(C["name"])
Y = lambda z: -z
X0, X1 = C["x0"], C["x1"]
SX0, SX1 = 6.6, 14.0
RN = Y(C["zn"]); RS = RN - 9.4; NC = RN + 3.2; SC = RS - 3.2
RZ, SZ = -0.15, 0.0

def ground(x0, x1, y0, y1, z, mat, tile):
    y0, y1 = min(y0, y1), max(y0, y1)
    B.quad((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), mat, tile)
def curb_x(xa, xb, y, facing):
    if facing < 0: B.quad((xa, y, RZ), (xb, y, RZ), (xb, y, SZ), (xa, y, SZ), "curb", (1, 0.3))
    else: B.quad((xb, y, RZ), (xa, y, RZ), (xa, y, SZ), (xb, y, SZ), "curb", (1, 0.3))
def curb_y(ya, yb, x, facing):
    ya, yb = min(ya, yb), max(ya, yb)
    if facing > 0: B.quad((x, ya, RZ), (x, yb, RZ), (x, yb, SZ), (x, ya, SZ), "curb", (1, 0.3))
    else: B.quad((x, yb, RZ), (x, ya, RZ), (x, ya, SZ), (x, yb, SZ), "curb", (1, 0.3))

kx = X0 < SX0 and X1 > SX1           # does Kirkwood cross this street?
segs = [(X0, SX0), (SX1, X1)] if kx else [(X0, X1)]
ground(X0, X1, RS, RN, RZ, "asphalt", (4, 4))
for xa, xb in segs:
    curb_x(xa, xb, RN, -1); curb_x(xa, xb, RS, 1)
    ground(xa, xb, RN, NC, SZ, "walk", (3, 3)); ground(xa, xb, SC, RS, SZ, "walk", (3, 3))
if kx:   # Kirkwood's crossing legs between the road and the sidewalk lines
    for ya, yb in ((RN, NC), (SC, RS)):
        ground(SX0, SX1, ya, yb, RZ, "asphalt", (1, 1))
        curb_y(ya, yb, SX0, 1); curb_y(ya, yb, SX1, -1)
for za, zb in C.get("kirkwood", []):
    ya, yb = Y(za), Y(zb)
    ground(SX0, SX1, ya, yb, RZ, "asphalt", (4, 4))
    curb_y(ya, yb, SX0, 1); curb_y(ya, yb, SX1, -1)
    ground(SX0 - 2.6, SX0, ya, yb, SZ, "walk", (3, 3)); ground(SX1, SX1 + 2.6, ya, yb, SZ, "walk", (3, 3))
if "base" in C:
    x0, x1, z0, z1 = C["base"]; ground(x0, x1, Y(z0), Y(z1), -0.22, "yard", (6, 6))
for x0, x1, z0, z1 in C.get("yards", []):
    ground(x0, x1, Y(z0), Y(z1), SZ - 0.02, "yard", (4, 4))
for x0, x1, z0, z1 in C.get("lots", []):
    ground(x0, x1, Y(z0), Y(z1), SZ - 0.01, "lot", (4, 4))

# lane paint
MID = (RN + RS) / 2
for xa, xb in ((X0, SX0 - 3.0), (SX1 + 3.0, X1)) if kx else ((X0, X1),):
    for yy in (MID - 0.08, MID + 0.08):
        B.quad((xa, yy - 0.05, RZ + 0.004), (xb, yy - 0.05, RZ + 0.004), (xb, yy + 0.05, RZ + 0.004), (xa, yy + 0.05, RZ + 0.004), "paint_y", (1, 1))
if kx:
    for i in range(8):
        x = SX0 + 0.55 + i * 0.9
        for ya, yb in ((RN + 0.5, RN + 2.9), (RS - 2.9, RS - 0.5)):
            B.quad((x, ya, RZ + 0.004), (x + 0.5, ya, RZ + 0.004), (x + 0.5, yb, RZ + 0.004), (x, yb, RZ + 0.004), "paint_w", (1, 1))
    for side_x0 in (SX0 - 3.0, SX1 + 0.6):
        for i in range(10):
            y = RS + 0.5 + i * 0.9
            B.quad((side_x0, y, RZ + 0.004), (side_x0 + 2.4, y, RZ + 0.004), (side_x0 + 2.4, y + 0.5, RZ + 0.004), (side_x0, y + 0.5, RZ + 0.004), "paint_w", (1, 1))

def fence(p0, p1, h=1.2):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    B.face([(x0, y0, 0.02), (x1, y1, 0.02), (x1, y1, h), (x0, y0, h)], "fence", [(0, 0), (L, 0), (L, h), (0, h)])
    B.cyl((x0, y0, h), (x1, y1, h), 0.02, "galv", 6, caps=False)
    n = max(1, int(L / 2.4))
    for i in range(n + 1):
        t = i / n
        B.cyl((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h + 0.05), 0.03, "galv", 6)
for x0, z0, x1, z1, h in C.get("fences", []):
    fence((x0, Y(z0)), (x1, Y(z1)), h)

PY = RN + 0.45
poles = C.get("poles_n", [])
for x in poles:
    B.cyl((x, PY, 0.0), (x, PY, 9.4), 0.15, "pole", 8, r1=0.12)
    B.box(x - 1.1, x + 1.1, PY - 0.07, PY + 0.07, 8.6, 8.74, "pole")
    B.cyl((x, PY, 6.2), (x, PY - 1.6, 6.45), 0.045, "galv", 6)
    B.obox((x, PY - 1.85, 6.32), (0.32, 0.65, 0.16), 0.0, "galv")
    B.face([(x - 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 1.58, 6.315), (x - 0.13, PY - 1.58, 6.315)], "lens", [(0, 0)] * 4)
def wire(p0, p1, sag=0.45, n=10):
    pts = [(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t - sag * 4 * t * (1 - t)) for t in (i / n for i in range(n + 1))]
    for p, q in zip(pts, pts[1:]):
        B.cyl(p, q, 0.012, "wire", 4, caps=False)
for p, q in zip(poles, poles[1:]):
    for dx in (-0.9, 0.0, 0.9):
        wire((p + dx, PY, 8.86), (q + dx, PY, 8.86))
for x in C.get("lights_s", []):
    y = RS - 0.45
    B.cyl((x, y, 0.0), (x, y, 6.6), 0.09, "galv", 8, r1=0.07)
    B.cyl((x, y, 6.4), (x, y + 1.6, 6.6), 0.045, "galv", 6)
    B.obox((x, y + 1.85, 6.5), (0.32, 0.65, 0.16), 0.0, "galv")
    B.face([(x - 0.13, y + 1.58, 6.495), (x + 0.13, y + 1.58, 6.495), (x + 0.13, y + 2.12, 6.495), (x - 0.13, y + 2.12, 6.495)], "lens", [(0, 0)] * 4)
for x, z in C.get("hydrants", []):
    y = Y(z)
    B.cyl((x, y, 0.0), (x, y, 0.62), 0.13, "hydrant", 10)
    B.cyl((x, y, 0.62), (x, y, 0.75), 0.15, "hydrant", 10, r1=0.06)
    B.cyl((x - 0.2, y, 0.42), (x + 0.2, y, 0.42), 0.055, "hydrant", 8)
for x, z in C.get("bins", []):
    B.cyl((x, Y(z), 0.0), (x, Y(z), 1.0), 0.3, "bin", 10, r1=0.34)
for _ in range(C.get("weeds", 20)):
    x, y = random.uniform(X0 + 1, X1 - 1), random.uniform(NC - 0.25, NC - 0.05)
    for ang in (0.0, math.pi / 2):
        s = random.uniform(0.25, 0.4); dx, dy = math.cos(ang) * 0.45 * s, math.sin(ang) * 0.45 * s
        B.face([(x - dx, y - dy, 0.0), (x + dx, y + dy, 0.0), (x + dx, y + dy, 0.7 * s), (x - dx, y - dy, 0.7 * s)], "grass", [(0, 0), (1, 0), (1, 1), (0, 1)])
B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
