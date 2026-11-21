"""Reservoir Lot Court: the fenced vacant-lot basketball court on No Refund Road.

python lot_court.py -- <ref dir> <out.blend>
Lot is 22 x 13 m, x -11..11, front fence on y=0 (the sidewalk edge), back fence at
y=13 (Blender coords; the front faces -Y, +Z in three.js). The court surface is cut
from the owner's top-down plan; the backboards and the "Reservoir LOT COURT" mural
from the angled view. The mural sits on a wall at x=+12.08, just off is where No Refund
Auto & Tires' west wall (12.12) lands when the court is placed beside it.
"""
import sys, os, math
sys.path.insert(0, "/tmp/lj")
import bpy
from PIL import Image
from lib3d import Builder, material, srgb, reset

a = sys.argv[sys.argv.index("--") + 1:]
REF, OUT = a[0], a[1]
reset()
plan = Image.open(os.path.join(REF, "plan-lot-court.jpg")).convert("RGB")
plan.crop((268, 250, 1185, 752)).resize((1536, 840), Image.LANCZOS).save("/tmp/lj/tex/court_floor.png")
ang = Image.open(os.path.join(REF, "bldg-lot-court.jpg")).convert("RGB")
ang.crop((905, 205, 1052, 325)).resize((256, 192), Image.LANCZOS).save("/tmp/lj/tex/court_board.png")
ang.crop((168, 243, 528, 428)).resize((1024, 512), Image.LANCZOS).save("/tmp/lj/tex/court_atlas.png")

M = {
    "floor": material("LC_Floor", "court_floor.png", rough=0.95),
    "board": material("LC_Backboard", "court_board.png", rough=0.6),
    "mural": material("LC_Mural", "court_atlas.png", rough=0.9),
    "rust": material("LC_RustPipe", color=srgb("8a4b30"), rough=0.7, metal=0.5),
    "rim": material("LC_Rim", color=srgb("c4521f"), rough=0.5, metal=0.5),
    "net": material("S_Fence", "chainlink.png", rough=0.5, metal=0.6, alpha=True),
    "galv": material("S_Galvanized", color=srgb("8a8d90"), rough=0.45, metal=0.8),
    "dumpster": material("S_Dumpster", color=srgb("2f5a3a"), rough=0.6, metal=0.4),
    "bin": material("S_Bin", color=srgb("24272a"), rough=0.6),
    "wood": material("LC_Pallet", color=srgb("8b6c4a"), rough=0.9),
    "box": material("WT_UtilityBox", color=srgb("5f7a5c"), rough=0.6, metal=0.4),
    "metal": material("R_DarkMetal", color=srgb("2b2d30"), rough=0.5, metal=0.7),
    "bulb": material("R_Bulb", color=srgb("ffe2a8"), rough=0.3, emit_color=(1.0, 0.82, 0.55), emit_strength=4.0),
    "grass": material("S_Grass", "grass_card.png", rough=0.9, alpha=True),
}
B = Builder(M); B.use("ReservoirLotCourt")
W, D, FH = 11.0, 13.0, 2.4
B.face([(-W, 0, 0.0), (W, 0, 0.0), (W, D, 0.0), (-W, D, 0.0)], "floor", [(0, 0), (1, 0), (1, 1), (0, 1)])

def fence(x0, y0, x1, y1):
    L = math.hypot(x1 - x0, y1 - y0)
    B.face([(x0, y0, 0.02), (x1, y1, 0.02), (x1, y1, FH), (x0, y0, FH)], "net", [(0, 0), (L, 0), (L, FH), (0, FH)])
    B.face([(x1, y1, 0.02), (x0, y0, 0.02), (x0, y0, FH), (x1, y1, FH)], "net", [(L, 0), (0, 0), (0, FH), (L, FH)])
    B.cyl((x0, y0, FH), (x1, y1, FH), 0.025, "galv", 6, caps=False)
    n = max(1, int(L / 2.5))
    for i in range(n + 1):
        t = i / n
        B.cyl((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, FH + 0.05), 0.04, "galv", 6)
GATE = 1.85
fence(-W, 0.1, -GATE, 0.1); fence(GATE, 0.1, W, 0.1)
fence(W, 0.1, W, D); fence(W, D, -W, D); fence(-W, D, -W, 0.1)
# open gate leaf swung inward on the right, closed leaf on the left
for (x0, y0, x1, y1) in ((-GATE, 0.1, 0.0, 0.1), (GATE, 0.1, GATE - 0.4, 1.9)):
    fence(x0, y0, x1, y1)
for x in (-GATE, GATE):
    B.cyl((x, 0.1, 0), (x, 0.1, FH + 0.15), 0.06, "galv", 8)

def hoop(side):
    x_pole, x_board = side * 10.4, side * 9.3
    y = D * 0.5
    B.cyl((x_pole, y, 0), (x_pole, y, 3.05), 0.09, "rust", 10)
    B.cyl((x_pole, y, 3.05), (x_pole - side * 0.35, y, 3.45), 0.09, "rust", 10)
    B.cyl((x_pole - side * 0.35, y, 3.45), (x_board + side * 0.06, y, 3.45), 0.09, "rust", 10)
    # backboard faces the centre of the court
    yb0, yb1, z0, z1 = y - 0.9, y + 0.9, 2.95, 4.0
    pts = [(x_board, yb1, z0), (x_board, yb0, z0), (x_board, yb0, z1), (x_board, yb1, z1)] if side > 0 else \
          [(x_board, yb0, z0), (x_board, yb1, z0), (x_board, yb1, z1), (x_board, yb0, z1)]
    B.face(pts, "board", [(0, 0), (1, 0), (1, 1), (0, 1)])
    B.box(x_board + side * 0.0, x_board + side * 0.05, yb0, yb1, z0, z1, "galv", tile=(1, 1)) if side > 0 else \
        B.box(x_board - 0.05, x_board, yb0, yb1, z0, z1, "galv", tile=(1, 1))
    cx = x_board - side * 0.38
    seg = 12
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        p = lambda ang, r, z: (cx + r * math.cos(ang), y + r * math.sin(ang), z)
        B.cyl(p(a0, 0.23, 3.05), p(a1, 0.23, 3.05), 0.012, "rim", 4, caps=False)
        B.face([p(a0, 0.23, 3.05), p(a1, 0.23, 3.05), p(a1, 0.14, 2.62), p(a0, 0.14, 2.62)], "net", [(0, 0), (0.4, 0), (0.4, 0.4), (0, 0.4)])
    B.cyl((x_board, y, 3.05), (cx + side * 0.23, y, 3.05), 0.012, "rim", 4)
hoop(-1); hoop(1)

# the mural on the neighbouring wall, with three gooseneck lamps over it
MX = 12.08; my0, my1, mz0, mz1 = 2.0, 10.0, 0.9, 4.6
B.face([(MX, my1, mz0), (MX, my0, mz0), (MX, my0, mz1), (MX, my1, mz1)], "mural", [(0, 0), (1, 0), (1, 1), (0, 1)])
for yy in (3.2, 6.0, 8.8):
    z = 5.0
    B.cyl((MX, yy, z + 0.25), (MX - 0.35, yy, z + 0.25), 0.018, "metal", 6)
    B.cyl((MX - 0.35, yy, z + 0.25), (MX - 0.4, yy, z + 0.05), 0.018, "metal", 6)
    B.cyl((MX - 0.4, yy, z + 0.08), (MX - 0.4, yy, z - 0.08), 0.04, "galv", 10, r1=0.17)
    B.cyl((MX - 0.4, yy, z - 0.07), (MX - 0.4, yy, z - 0.09), 0.12, "bulb", 10)

# props: dumpster and pallets back corner, cans and utility box front corner
B.obox((9.3, 11.6, 0.0), (1.4, 2.0, 1.25), 0.1, "dumpster")
B.obox((9.3, 11.6, 1.25), (1.5, 2.1, 0.08), 0.1, "metal")
B.obox((10.2, 9.9, 0.0), (1.2, 1.0, 0.14), 0.5, "wood")
B.obox((10.25, 9.95, 0.14), (1.2, 1.0, 0.14), 0.6, "wood")
for x in (8.7, 9.5):
    B.cyl((x, 1.0, 0.0), (x, 1.0, 0.95), 0.3, "galv", 10, r1=0.33)
B.obox((10.3, 1.0, 0.0), (0.7, 0.5, 1.2), 0.0, "box")
import random
random.seed(5)
for _ in range(40):
    x = random.choice((random.uniform(-W + 0.1, -W + 0.6), random.uniform(W - 0.6, W - 0.1), random.uniform(-W, W)))
    y = random.uniform(0.2, D - 0.2) if abs(x) > W - 1 else random.choice((random.uniform(0.2, 0.7), random.uniform(D - 0.7, D - 0.2)))
    for ang in (0.0, math.pi / 2):
        s = random.uniform(0.3, 0.55); dx, dy = math.cos(ang) * 0.45 * s, math.sin(ang) * 0.45 * s
        B.face([(x - dx, y - dy, 0.0), (x + dx, y + dy, 0.0), (x + dx, y + dy, 0.75 * s), (x - dx, y - dy, 0.75 * s)], "grass", [(0, 0), (1, 0), (1, 1), (0, 1)])
B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
