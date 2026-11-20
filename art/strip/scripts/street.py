"""Street, sidewalks, yards, fences, poles, lamps and props for the Reservoir strip.

Blender coords: property line at y=0, street toward -Y. Road surface z=-0.15,
sidewalk top z=0. Lil Jay's occupies x -4..4, y 0..10; side street at x>6.6.
"""
import sys, math, random
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset

OUT = sys.argv[sys.argv.index("--") + 1]
reset()
random.seed(4)
M = {
    "asphalt": material("S_Asphalt", "asphalt_albedo.png", rough=0.92, normal="asphalt_normal.png"),
    "walk": material("S_Sidewalk", "sidewalk_albedo.png", rough=0.9, normal="sidewalk_normal.png"),
    "curb": material("S_Curb", "concrete_albedo.png", rough=0.9, normal="concrete_normal.png", tint=srgb("d8d2c8")),
    "yard": material("S_Yard", "yard_albedo.png", rough=0.98),
    "gravel": material("S_Gravel", "roof_albedo.png", rough=0.98, tint=srgb("c8b8a0")),
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
    "bark": material("S_Bark", color=srgb("3d3127"), rough=0.95),
    "leaves": material("S_Leaves", "leaves.png", rough=0.85),
    "grass": material("S_Grass", "grass_card.png", rough=0.9, alpha=True),
    "bin": material("S_Bin", color=srgb("24272a"), rough=0.6),
}
B = Builder(M)
B.use("Street")
X0, X1 = -48.0, 22.0
CURB, ROAD_F, ROAD_B, FAR = -3.2, -3.2, -12.6, -15.8
SX0, SX1 = 6.6, 14.0            # side street
RZ, SZ = -0.15, 0.0

def ground(x0, x1, y0, y1, z, mat, tile):
    B.quad((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), mat, tile)

# road: main street + side street
ground(X0, X1, ROAD_B, ROAD_F, RZ, "asphalt", (4, 4))
ground(SX0, SX1, ROAD_F, 18.0, RZ, "asphalt", (4, 4))
ground(SX0, SX1, -24.0, ROAD_B, RZ, "asphalt", (4, 4))
# sidewalks (near side split around the side street; far side continuous)
ground(X0, SX0, CURB, 0.0, SZ, "walk", (3, 3))
ground(SX1, X1, CURB, 0.0, SZ, "walk", (3, 3))
ground(4.0, SX0, 0.0, 18.0, SZ, "walk", (3, 3))          # along Lil Jay's side wall
ground(SX1, SX1 + 2.6, 0.0, 18.0, SZ, "walk", (3, 3))
ground(X0, SX0, ROAD_B - 3.2, ROAD_B, SZ, "walk", (3, 3))
ground(SX1, X1, ROAD_B - 3.2, ROAD_B, SZ, "walk", (3, 3))
# curbs (vertical faces + top lip)
def curb_x(xa, xb, y, facing):  # face toward -Y if facing<0
    if facing < 0:
        B.quad((xa, y, RZ), (xb, y, RZ), (xb, y, SZ), (xa, y, SZ), "curb", (1, 0.3))
    else:
        B.quad((xb, y, RZ), (xa, y, RZ), (xa, y, SZ), (xb, y, SZ), "curb", (1, 0.3))
    B.quad((xa, y + (0.18 if facing < 0 else -0.18), SZ + 0.002), (xb, y + (0.18 if facing < 0 else -0.18), SZ + 0.002),
           (xb, y, SZ + 0.002), (xa, y, SZ + 0.002), "curb", (1, 1)) if facing < 0 else \
        B.quad((xa, y, SZ + 0.002), (xb, y, SZ + 0.002), (xb, y - 0.18, SZ + 0.002), (xa, y - 0.18, SZ + 0.002), "curb", (1, 1))
def curb_y(ya, yb, x, facing):  # face toward +X if facing>0
    if facing > 0:
        B.quad((x, ya, RZ), (x, yb, RZ), (x, yb, SZ), (x, ya, SZ), "curb", (1, 0.3))
    else:
        B.quad((x, yb, RZ), (x, ya, RZ), (x, ya, SZ), (x, yb, SZ), "curb", (1, 0.3))
curb_x(X0, SX0, CURB, -1); curb_x(SX1, X1, CURB, -1)
curb_x(X0, SX0, ROAD_B, 1); curb_x(SX1, X1, ROAD_B, 1)
curb_y(CURB, 18.0, SX0, 1); curb_y(CURB, 18.0, SX1, -1)
curb_y(-24.0, ROAD_B, SX0, 1); curb_y(-24.0, ROAD_B, SX1, -1)
# lane paint
for yy in (-7.82, -7.98):
    B.quad((X0, yy - 0.05, RZ + 0.004), (SX0 - 2.5, yy - 0.05, RZ + 0.004), (SX0 - 2.5, yy + 0.05, RZ + 0.004), (X0, yy + 0.05, RZ + 0.004), "paint_y", (1, 1))
    B.quad((SX1 + 2.5, yy - 0.05, RZ + 0.004), (X1, yy - 0.05, RZ + 0.004), (X1, yy + 0.05, RZ + 0.004), (SX1 + 2.5, yy + 0.05, RZ + 0.004), "paint_y", (1, 1))
# crosswalk across the side street (ladder) and stop bar
for i in range(9):
    x = SX0 + 0.5 + i * 0.8
    B.quad((x, CURB - 0.4, RZ + 0.004), (x + 0.45, CURB - 0.4, RZ + 0.004), (x + 0.45, CURB + 0.0 - 0.05, RZ + 0.004) if False else (x + 0.45, -0.6 + CURB + 3.2 - 3.2 + 0.0, RZ + 0.004), (x, -0.6, RZ + 0.004), "paint_w", (1, 1)) if False else None
for i in range(8):
    x = SX0 + 0.55 + i * 0.9
    B.quad((x, -2.9, RZ + 0.004), (x + 0.5, -2.9, RZ + 0.004), (x + 0.5, -0.5, RZ + 0.004), (x, -0.5, RZ + 0.004), "paint_w", (1, 1))
for i in range(8):
    x = SX0 + 0.55 + i * 0.9
    B.quad((x, ROAD_B - 0.5 - 2.4, RZ + 0.004), (x + 0.5, ROAD_B - 0.5 - 2.4, RZ + 0.004), (x + 0.5, ROAD_B - 0.5, RZ + 0.004), (x, ROAD_B - 0.5, RZ + 0.004), "paint_w", (1, 1))
# storm drain grates
for x in (-20.0, 3.0):
    B.box(x - 0.45, x + 0.45, CURB - 0.02, CURB + 0.35, RZ, RZ + 0.01, "metal")

# ---------------------------------------------------------------- lots
LOTS = [(-15.0, -6.0), (-24.0, -15.0), (-33.0, -24.0), (-44.0, -33.0)]
for (a, b) in LOTS:
    ground(a, b, 0.0, 18.0, SZ - 0.02, "yard", (4, 4))
ground(-6.0, -4.0, 0.0, 18.0, SZ - 0.01, "gravel", (2, 2))     # alley beside the store
ground(-4.0, 4.0, 10.0, 18.0, SZ - 0.01, "gravel", (2, 2))     # lot behind the store
ground(-4.0, 4.0, 0.0, 10.0, SZ - 0.004, "walk", (3, 3))        # slab under the store
ground(X0, X1, 18.0, 40.0, SZ - 0.02, "yard", (4, 4))           # back field
ground(X0, X1, -40.0, ROAD_B - 3.2, SZ - 0.02, "yard", (4, 4))  # far side lots
# walkways from sidewalk to porches
for cx in (-10.5, -19.5, -28.5):
    ground(cx - 0.6, cx + 0.6, 0.0, 2.2, SZ + 0.003, "walk", (3, 3))

# ---------------------------------------------------------------- fences
def fence(p0, p1, h=1.2, gate=None):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    segs = [(0.0, L)]
    if gate:
        segs = [(0.0, gate[0]), (gate[1], L)]
    for (s0, s1) in segs:
        if s1 - s0 < 0.1:
            continue
        ax, ay = x0 + (x1 - x0) * s0 / L, y0 + (y1 - y0) * s0 / L
        bx, by = x0 + (x1 - x0) * s1 / L, y0 + (y1 - y0) * s1 / L
        B.face([(ax, ay, 0.02), (bx, by, 0.02), (bx, by, h), (ax, ay, h)], "fence",
               [(0, 0), ((s1 - s0) / 1.0, 0), ((s1 - s0) / 1.0, h), (0, h)])
        B.cyl((ax, ay, h), (bx, by, h), 0.02, "galv", 6, caps=False)
        n = max(1, int((s1 - s0) / 2.4))
        for i in range(n + 1):
            t = i / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            B.cyl((px, py, 0.0), (px, py, h + 0.05), 0.03, "galv", 6)
for (a, b), cx in zip(LOTS[:3], (-10.5, -19.5, -28.5)):
    fence((a + 0.1, 0.15), (b - 0.1, 0.15), gate=(cx - a - 0.7, cx - a + 0.7))
    fence((a + 0.1, 0.15), (a + 0.1, 14.0))
fence((-44.0, 0.15), (-33.1, 0.15), h=1.8)
fence((-6.0, 0.15), (-6.0, 14.0))
fence((4.3, 10.4), (4.3, 17.5), h=1.8)
fence((-4.0, 17.8), (4.3, 17.8), h=1.8)
fence((-44.0, 14.0), (-6.0, 14.0))

# ---------------------------------------------------------------- utility poles, wires, street lamps
POLES = [-38.0, -20.5, -5.0, 16.5]
PY = CURB + 0.45
for x in POLES:
    B.cyl((x, PY, 0.0), (x, PY, 9.4), 0.15, "pole", 8, r1=0.12)
    B.box(x - 1.1, x + 1.1, PY - 0.07, PY + 0.07, 8.6, 8.74, "pole")
    for dx in (-0.9, 0.0, 0.9):
        B.cyl((x + dx, PY, 8.74), (x + dx, PY, 8.86), 0.04, "galv", 6)
    B.cyl((x - 0.2, PY + 0.15, 7.2), (x - 0.2, PY + 0.15, 7.9), 0.25, "galv", 8)     # transformer
    # cobra-head street lamp
    B.cyl((x, PY, 6.2), (x, PY - 1.6, 6.45), 0.045, "galv", 6)
    B.obox((x, PY - 1.85, 6.32), (0.32, 0.65, 0.16), 0.0, "galv")
    B.face([(x - 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 2.12, 6.315), (x + 0.13, PY - 1.58, 6.315), (x - 0.13, PY - 1.58, 6.315)],
           "lens", [(0, 0)] * 4)
def wire(p0, p1, sag=0.45, n=10):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t,
                    p0[2] + (p1[2] - p0[2]) * t - sag * 4 * t * (1 - t)))
    for a, b in zip(pts, pts[1:]):
        B.cyl(a, b, 0.012, "wire", 4, caps=False)
for a, b in zip(POLES, POLES[1:]):
    for dx in (-0.9, 0.0, 0.9):
        wire((a + dx, PY, 8.86), (b + dx, PY, 8.86))
    wire((a, PY + 0.12, 7.4), (b, PY + 0.12, 7.4), sag=0.6)
# service drops to the store and the dark house
wire((-5.0, PY, 7.4), (-3.6, 0.6, 4.9), sag=0.3)
wire((-20.5, PY, 7.4), (-12.0, -2.0, 5.6), sag=0.3)

# ---------------------------------------------------------------- props
# fire hydrant
hx, hy = 5.4, CURB + 0.5
B.cyl((hx, hy, 0.0), (hx, hy, 0.62), 0.13, "hydrant", 10)
B.cyl((hx, hy, 0.62), (hx, hy, 0.75), 0.15, "hydrant", 10, r1=0.06)
B.cyl((hx - 0.2, hy, 0.42), (hx + 0.2, hy, 0.42), 0.055, "hydrant", 8)
B.cyl((hx, hy - 0.22, 0.42), (hx, hy, 0.42), 0.07, "hydrant", 8)
# dumpster behind the store
B.obox((-0.5, 12.5, 0.0), (2.0, 1.4, 1.25), 0.05, "dumpster")
B.obox((-0.5, 12.5, 1.25), (2.1, 1.5, 0.08), 0.05, "metal")
# trash bins at the curb in front of houses
for x in (-13.0, -21.5, -23.0):
    B.cyl((x, -0.6, 0.0), (x, -0.6, 1.0), 0.3, "bin", 10, r1=0.34)
# milk crates + newspaper box by the store
B.obox((-2.9, 1.0, 0.0), (0.42, 0.32, 0.3), 0.3, "hydrant")
B.obox((-2.9, 1.0, 0.3), (0.42, 0.32, 0.3), 0.1, "hydrant")
B.obox((3.2, 0.7, 0.0), (0.45, 0.45, 1.05), 0.0, "dumpster")
# bus-stop style bench across the street
B.obox((-6.0, ROAD_B - 1.6, 0.42), (2.0, 0.45, 0.08), 0.0, "pole")
for dx in (-0.85, 0.85):
    B.obox((-6.0 + dx, ROAD_B - 1.6, 0.0), (0.08, 0.4, 0.42), 0.0, "metal")

# ---------------------------------------------------------------- trees + tall grass
B.use("Foliage")
def tree(x, y, h=6.5, r=2.2):
    B.cyl((x, y, 0.0), (x, y, h * 0.55), 0.18, "bark", 7, r1=0.12)
    B.cyl((x, y, h * 0.4), (x + 0.8, y + 0.3, h * 0.7), 0.08, "bark", 5)
    for (dx, dy, dz, s) in ((0, 0, 0.72, 1.0), (0.9, 0.4, 0.62, 0.75), (-0.8, -0.3, 0.6, 0.7), (0.2, -0.8, 0.8, 0.65), (-0.3, 0.7, 0.85, 0.6)):
        icosphere(x + dx * r * 0.6, y + dy * r * 0.6, h * dz, r * s)
def icosphere(cx, cy, cz, r):
    t = (1 + 5 ** 0.5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    # one subdivision for a rounder canopy
    def mid(a, b):
        m = [(a[i] + b[i]) / 2 for i in range(3)]; l = sum(c * c for c in m) ** 0.5
        return tuple(c / l for c in m)
    norm = lambda v: tuple(c / sum(x * x for x in v) ** 0.5 for c in v)
    V = [norm(v) for v in V]
    tris = []
    for (a, b, c) in F:
        A, Bv, C = V[a], V[b], V[c]
        ab, bc, ca = mid(A, Bv), mid(Bv, C), mid(C, A)
        tris += [(A, ab, ca), (Bv, bc, ab), (C, ca, bc), (ab, bc, ca)]
    for tri in tris:
        pts = []
        for v in tri:
            j = 0.85 + 0.3 * random.random()
            pts.append((cx + v[0] * r * j, cy + v[1] * r * j, cz + v[2] * r * 0.8 * j))
        B.face(pts, "leaves", [(v[0] * 0.5 + 0.5, v[1] * 0.5 + 0.5) for v in tri])
tree(-25.5, 9.5, 7.5, 2.6)
tree(-41.0, 4.0, 6.8, 2.4)
tree(17.5, ROAD_B - 2.0, 7.0, 2.4)
tree(-14.0, 12.0, 8.0, 2.8)
def grass_tuft(x, y, s=1.0):
    for a in (0.0, math.pi / 2):
        dx, dy = math.cos(a) * 0.45 * s, math.sin(a) * 0.45 * s
        B.face([(x - dx, y - dy, 0.0), (x + dx, y + dy, 0.0), (x + dx, y + dy, 0.7 * s), (x - dx, y - dy, 0.7 * s)], "grass",
               [(0, 0), (1, 0), (1, 1), (0, 1)])
for _ in range(70):   # overgrown abandoned lot + vacant lot
    grass_tuft(random.uniform(-43.5, -24.5), random.uniform(0.6, 13.5), random.uniform(0.7, 1.4))
for _ in range(25):
    grass_tuft(random.uniform(-14.5, -6.5), random.uniform(0.6, 3.0), random.uniform(0.4, 0.7))
for _ in range(18):   # cracks along the curb line
    grass_tuft(random.uniform(-44, 20), random.uniform(-0.3, -0.05), random.uniform(0.25, 0.4))

B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
