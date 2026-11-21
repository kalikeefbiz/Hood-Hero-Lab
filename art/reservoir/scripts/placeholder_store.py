"""Stand-in storefront for a building whose art has not arrived yet (blank sign, dark glass).

python placeholder_store.py -- out.blend [width] [depth] [height]
"""
import sys
sys.path.insert(0, "/tmp/lj")
import bpy
from lib3d import Builder, material, srgb, reset
a = sys.argv[sys.argv.index("--") + 1:]
OUT = a[0]; W = float(a[1]) if len(a) > 1 else 7.5; D = float(a[2]) if len(a) > 2 else 10; H = float(a[3]) if len(a) > 3 else 4.4
reset()
M = {
    "brick": material("P_Brick", "brick_albedo.png", rough=0.9, normal="brick_normal.png"),
    "concrete": material("R_Concrete", "concrete_albedo.png", rough=0.92, normal="concrete_normal.png"),
    "roof": material("R_Roof", "roof_albedo.png", rough=0.95),
    "metal": material("R_DarkMetal", color=srgb("2b2d30"), rough=0.5, metal=0.7),
    "sign": material("P_BlankSign", color=srgb("3b3430"), rough=0.8),
    "glass": material("P_Glass", color=srgb("161b1e"), rough=0.1, metal=0.2),
}
B = Builder(M); B.use("PlaceholderStore")
x0, x1 = -W / 2, W / 2
T = (1.68, 1.65)
# front with a window band and door
wz0, wz1, dx0, dx1 = 0.7, 2.6, -0.55, 0.55
for (a_, b_, c_, d_) in ((x0, x1, wz1, H), (x0, dx0, 0, wz0), (dx1, x1, 0, wz0), (x0, x0 + 0.5, wz0, wz1), (x1 - 0.5, x1, wz0, wz1), (dx0 - 0.3, dx0, wz0, wz1), (dx1, dx1 + 0.3, wz0, wz1)):
    B.quad((a_, 0, c_), (b_, 0, c_), (b_, 0, d_), (a_, 0, d_), "brick", T)
for (a_, b_, c_, d_) in ((x0 + 0.5, dx0 - 0.3, wz0, wz1), (dx1 + 0.3, x1 - 0.5, wz0, wz1), (dx0, dx1, 0, wz1)):
    r = 0.15
    B.quad((a_, r, c_), (b_, r, c_), (b_, r, d_), (a_, r, d_), "glass")
    B.quad((a_, 0, c_), (a_, r, c_), (a_, r, d_), (a_, 0, d_), "metal"); B.quad((b_, r, c_), (b_, 0, c_), (b_, 0, d_), (b_, r, d_), "metal")
    B.quad((a_, 0, d_), (b_, 0, d_), (b_, r, d_), (a_, r, d_), "metal")
    if c_ > 0: B.quad((a_, r, c_), (b_, r, c_), (b_, 0, c_), (a_, 0, c_), "concrete")
B.box(x0 + 0.4, x1 - 0.4, -0.06, 0, 2.95, 3.85, "sign")
B.box(x0, x0 + 0.001, 0, D, 0, H, "brick", T, skip=("front", "back", "top", "bottom", "right"))
B.quad((x1, 0, 0), (x1, D, 0), (x1, D, H), (x1, 0, H), "brick", T)
B.quad((x0, D, 0), (x0, 0, 0), (x0, 0, H), (x0, D, H), "brick", T)
B.quad((x1, D, 0), (x0, D, 0), (x0, D, H), (x1, D, H), "brick", T)
B.quad((x0, 0, H - 0.2), (x1, 0, H - 0.2), (x1, D, H - 0.2), (x0, D, H - 0.2), "roof", (3, 3))
B.box(x0 - 0.05, x1 + 0.05, -0.08, D + 0.05, H - 0.15, H, "concrete", (1, 1), skip=("bottom",))
B.finish()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
