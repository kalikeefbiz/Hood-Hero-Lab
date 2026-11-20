# Reservoir strip (street-level art)

Lil Jay's Market, three houses and the street around them, built for the
walkable city. Preview: `strip.html` on the Lab site.

## Pipeline

1. **Textures** (Python + OpenCV, not checked in as a script yet): the Lil Jay's
   facade atlas comes straight from `ref/storefront.png` (projected 1:1 at
   171 px/m, window bars painted out and rebuilt as geometry), plus generated
   tileable brick, concrete, asphalt, sidewalk, siding, shingles, window and
   door atlases and a night emissive map. Working copies live in `/tmp/lj/tex`
   during a session.
2. **Models** (headless Blender 5.3 via `pip install bpy`):
   `build_store.py`, `houses.py -- dark|tan|abandoned`, `street.py`.
   Everything is real geometry at metre scale: bars, sills, awning scallops,
   porches, railings, poles, wires, fences.
3. **Bake + export**: `bake_export.py` unwraps a second UV set, bakes ambient
   occlusion in Cycles and exports GLB with an occlusion map.
4. **Pack for phones**: `pack.sh` → meshopt geometry, KTX2 textures (UASTC for
   the sign atlas and normal maps, ETC1S for the rest).

## Budgets

| Asset | Triangles | Download |
|---|---|---|
| Lil Jay's Market | ~2.2k | 4.0 MB |
| Each house | 1–2.3k | ~1.5–1.7 MB |
| Street + props + foliage | ~5.8k | 4.0 MB |

The whole strip is about 15k triangles and 13 MB.
