"""Generate original PBR maps for the Reservoir weathered house. Requires Pillow and NumPy."""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 512
rng = np.random.default_rng(22146)
y, x = np.mgrid[:SIZE, :SIZE] / SIZE
folder = Path(__file__).parent


def noise(width, height):
    samples = rng.random((height, width)).astype("float32")
    return np.asarray(Image.fromarray(samples).resize((SIZE, SIZE), Image.Resampling.BICUBIC))


def color(rgb, delta):
    return np.clip(np.array(rgb) + 255 * delta[..., None], 0, 255)


def wood(rgb, light, courses=False):
    grain = noise(37, 330) * .62 + noise(11, 81) * .38
    blotch = noise(14, 35) * .65 + noise(38, 66) * .35
    warp = np.sin(y * 290 + noise(13, 24) * 4)
    chips = np.clip((blotch - .63) * 7, 0, 1) * (.30 + .70 * grain)
    streaks = (grain > .68) * (warp > .1)
    knots = np.zeros_like(x)
    for _ in range(14):
        cx, cy = rng.uniform(0, 1, 2)
        d = np.sqrt(((x - cx) * 3.0) ** 2 + ((y - cy) * 19) ** 2)
        knots += np.exp(-d * 12) * (.5 + .5 * np.cos(d * 100))
    height = grain * .016 + warp * .0009 - chips * .006 - knots * .013
    base = color(rgb, (grain - .5) * .09 + (blotch - .5) * .09 - knots * .13 - streaks * .023)
    exposed = color([118, 76, 54], (grain - .5) * .18)
    wear = chips * light
    if courses:
        # UV strips map six independent worn edges to the bottom of lap boards.
        course_y = y * 6 % 1
        broken_edge = noise(97, 12) * .69 + noise(38, 44) * .31
        edge_peel = np.clip((course_y - 1.025 + broken_edge * .205) * 29, 0, 1)
        edge_peel *= np.clip((broken_edge - .40) * 5, 0, 1)
        wear += edge_peel * .81
        height -= edge_peel * .005
    mix = np.clip(wear, 0, .86)[..., None]
    return base * (1 - mix) + exposed * mix, height, .76 + chips * .22, 0, 1 - knots * .23


def shale():
    grit = noise(290, 290)
    patches = noise(10, 31) * .65 + noise(45, 53) * .35
    scratches = np.maximum(noise(130, 27) - .72, 0)
    return (
        color([86, 55, 46], (grit - .5) * .15 + (patches - .5) * .23 - scratches * .28),
        grit * .015 + patches * .014,
        .78 + grit * .19, 0, .88 + patches * .12,
    )


def steel():
    oxide = np.clip((noise(15, 20) * .65 + noise(45, 67) * .24 + noise(130, 148) * .11 - .35) * 3.2, 0, 1)
    grit = noise(250, 280)
    exposed = color([103, 91, 85], (noise(19, 5) - .5) * .13 + (grit - .5) * .09)
    rust = color([105, 62, 46], (noise(70, 45) - .5) * .20 + (grit - .5) * .18)
    return (
        exposed * (1 - oxide[..., None]) + rust * oxide[..., None],
        grit * .010 + oxide * .013, .43 + oxide * .51, .87 * (1 - oxide), .95 - oxide * .10,
    )


def masonry(brick):
    rows, cols = (9, 5) if brick else (4, 4)
    row = np.floor(y * rows).astype(int)
    px = (x * cols + (row % 2) * .5) % 1
    py = (y * rows) % 1
    grit = noise(285, 235)
    stain = noise(19, 23)
    edge = np.minimum(np.minimum(px, 1 - px), np.minimum(py, 1 - py))
    fill = np.clip((edge + (stain - .5) * .04 - .013) * 38, 0, 1)
    blocks = rng.uniform(-.045, .045, (rows, cols + 1))
    block = blocks[row, np.floor(x * cols + (row % 2) * .5).astype(int)]
    face = color([119, 62, 47] if brick else [126, 111, 94],
                 block + (stain - .5) * .18 + (grit - .5) * .12)
    mortar = color([99, 86, 73], (grit - .5) * .09)
    return (
        mortar * (1 - fill[..., None]) + face * fill[..., None],
        grit * .014 + fill * .037, .85 + stain * .13, 0, .75 + fill * .23,
    )


def terrain():
    fine = noise(325, 325)
    areas = noise(12, 12) * .6 + noise(38, 41) * .4
    gravel = (fine > .77) * (noise(230, 260) > .61)
    return (
        color([111, 94, 65], (areas - .5) * .36 + (fine - .5) * .15 + gravel * .12),
        .012 * fine + .021 * areas + gravel * .008, .92 + .07 * fine, 0, .92 + areas * .08,
    )


def textile():
    grain = noise(186, 255)
    fold = np.cos(x * 2 * np.pi * 11 + np.sin(y * 4) * .85)
    cloth = color([159, 119, 78], fold * .105 + (grain - .5) * .105 + (noise(12, 8) - .5) * .10)
    return cloth, fold * .025 + grain * .008, .88, 0, .85 + fold * .1


tiles = [wood([51, 46, 46], .35, courses=True), wood([166, 130, 109], .44), shale(), steel(),
         masonry(False), masonry(True), terrain(), textile()]
atlases = [np.zeros((SIZE * 2, SIZE * 4, 3), dtype=np.uint8) for _ in range(3)]
for index, (diffuse, height, roughness, metal, ao) in enumerate(tiles):
    dy, dx = np.gradient(height)
    normal = np.stack([-dx * 19, dy * 19, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    orm = np.stack(np.broadcast_arrays(ao, roughness, metal, x)[:3], axis=-1)
    row, col = divmod(index, 4)
    for atlas, tile in zip(atlases, [diffuse, (normal * .5 + .5) * 255, orm * 255]):
        atlas[row * SIZE:(row + 1) * SIZE, col * SIZE:(col + 1) * SIZE] = np.clip(tile, 0, 255)

Image.fromarray(atlases[0]).save(folder / "color.webp", quality=86, method=6)
Image.fromarray(atlases[1]).save(folder / "normal.webp", quality=86, method=6)
Image.fromarray(atlases[2]).save(folder / "orm.webp", quality=88, method=6)
