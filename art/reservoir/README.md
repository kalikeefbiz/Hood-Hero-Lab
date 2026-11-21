# Reservoir buildings and streets

Art for the Reservoir beyond the Lil Jay's strip (`art/strip/`). Layout and street order: `docs/RESERVOIR_LAYOUT.md`.

## Storefronts: one script, one spec per building
Every storefront comes from `scripts/storefront.py` plus an entry in `buildings.json`. The entry is measured in pixels on the owner's straight-on front view (`ref/front-*.png`):
- `L`, `R` wall edges, `T` top (or `Tl`/`Tr` for a sloped roofline), `G` ground line, `ppm` pixels per metre (set from the door, about 2.1 m tall), `depth` in metres.
- `openings` are recessed (`glass` glows at night, `door` doesn't). Optional: `panels` (protruding signs), `sills`, `canopy`, `tarp` awning, `tubes` (fluorescent lights), `lamps` (gooseneck), `poles` (barber pole wrapped with a painted pole from the art), `canopies` (several box awnings), `floods`, `dock`, `stairs`, `bollards`, `tires`, `roof` gear.
- `side` is a clean vertical strip of the front used to build the side and back walls (its paint bands times `sidedetail` brick/concrete texture).

To add a building: put its front view in `ref/`, open it with a pixel grid, measure, add an entry, run the pipeline.

## Pipeline (headless Blender via `pip install bpy`)
1. `lib3d.py` from `art/strip/scripts/` and the shared tileables in `/tmp/lj/tex`. The tileables only exist inside the shipped GLBs; extract them with the KTX-Software `ktx extract --transcode rgba8` tool (see the strip README).
2. `python scripts/prep_textures.py buildings.json ref /tmp/lj/tex` → `<id>_atlas.png`, `<id>_emissive.png`, `<id>_side.png`.
3. `python scripts/storefront.py -- buildings.json <id> /tmp/lj/out/<id>.blend`
4. `python ../strip/scripts/bake_export.py -- /tmp/lj/out/<id>.blend /tmp/lj/out/<id>.glb 1024 64` (AO bake + export)
5. Pack for phones with glTF Transform + ktx2-encoder: UASTC for the `_atlas` (keeps signs legible), UASTC normals, ETC1S everything else, meshopt geometry.
6. `scripts/preview.py` renders a 3/4 and a street-level check.

One-off landmarks have their own scripts: `water_tower.py` (cylindrical projection of the front view onto the tank), `boarded_house.py` (projected front, porch, gable, steps, yard), `lot_court.py` (floor from the top-down plan, mural and backboards from the angled view).

Streets: `scripts/avenue.py` + `streets.json` (Big Mouth Blvd, No Refund Road); `scripts/blocc_boy_street.py` (same conventions as `art/strip/scripts/street.py`). `scripts/placeholder_store.py` makes a blank stand-in for a slot whose art hasn't arrived (not currently used).

## Shipped (`public/assets/reservoir/`)
| Asset | Size | Tris | Placed |
|---|---|---|---|
| reservoir-pawn | 6.2 x 10 x 4.5 m, 2.1 MB | ~0.7k | Blocc Boy Blvd, Kirkwood corner |
| reservoir-liquor-deli | 7.0 x 11 x 5.2 m, 2.0 MB | ~0.7k | Blocc Boy Blvd |
| reservoir-laundry | 7.3 x 12 x 4.2 m, 1.9 MB | ~0.7k | not yet (Dirty Money Drive) |
| no-refund-auto | 8.7 x 12 x 4.8 m, 1.9 MB | ~1.2k | No Refund Road, Kirkwood corner |
| westside-warehouse | 12.1 x 22 x 6.8 m, 1.9 MB | ~0.7k | No Refund Road |
| reservoir-barber-shop | 6.0 x 10 x 4.3 m | ~0.4k | Blocc Boy Blvd, west end |
| reservoir-beauty-supply | 6.8 x 11 x 4.7 m, 2.4 MB | ~0.4k | Blocc Boy Blvd |
| reservoir-water-tower | 8.2 m tank, 12.2 m tall, fenced compound, 1.9 MB | ~3.1k | Big Mouth Blvd, west end |
| boarded-house | 7.9 x 9 m + porch and front yard, 4.4 MB | ~0.7k | Big Mouth Blvd |
| lot-court | 22 x 13 m fenced court, two hoops, mural, 1.0 MB | ~1.8k | No Refund Road |
| big-mouth-blvd / no-refund-road | streets from `streets.json` via `scripts/avenue.py`, ~3.8 MB each | ~2.6k | yes |
| blocc-boy-blvd | street, sidewalks, Kirkwood extension, poles, lot, 3.9 MB | ~2.8k | yes |

Known limits: window bars and wall lamps' arms are painted (real lamp heads, sills, signs, canopies and doors have depth); the street GLBs each carry their own copy of the asphalt/sidewalk textures (shared texture files would save about 3 MB).
