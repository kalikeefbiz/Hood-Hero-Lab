# Reservoir buildings and streets

Art for the Reservoir beyond the Lil Jay's strip (`art/strip/`). Layout and street order: `docs/RESERVOIR_LAYOUT.md`.

## Storefronts: one script, one spec per building
Every storefront comes from `scripts/storefront.py` plus an entry in `buildings.json`. The entry is measured in pixels on the owner's straight-on front view (`ref/front-*.png`):
- `L`, `R` wall edges, `T` top (or `Tl`/`Tr` for a sloped roofline), `G` ground line, `ppm` pixels per metre (set from the door, about 2.1 m tall), `depth` in metres.
- `openings` are recessed (`glass` glows at night, `door` doesn't). Optional: `panels` (protruding signs), `sills`, `canopy`, `tarp` awning, `tubes` (fluorescent lights), `lamps` (gooseneck), `floods`, `dock`, `stairs`, `bollards`, `tires`, `roof` gear.
- `side` is a clean vertical strip of the front used to build the side and back walls (its paint bands times `sidedetail` brick/concrete texture).

To add a building: put its front view in `ref/`, open it with a pixel grid, measure, add an entry, run the pipeline.

## Pipeline (headless Blender via `pip install bpy`)
1. `lib3d.py` from `art/strip/scripts/` and the shared tileables in `/tmp/lj/tex`. The tileables only exist inside the shipped GLBs; extract them with the KTX-Software `ktx extract --transcode rgba8` tool (see the strip README).
2. `python scripts/prep_textures.py buildings.json ref /tmp/lj/tex` → `<id>_atlas.png`, `<id>_emissive.png`, `<id>_side.png`.
3. `python scripts/storefront.py -- buildings.json <id> /tmp/lj/out/<id>.blend`
4. `python ../strip/scripts/bake_export.py -- /tmp/lj/out/<id>.blend /tmp/lj/out/<id>.glb 1024 64` (AO bake + export)
5. Pack for phones with glTF Transform + ktx2-encoder: UASTC for the `_atlas` (keeps signs legible), UASTC normals, ETC1S everything else, meshopt geometry.
6. `scripts/preview.py` renders a 3/4 and a street-level check.

Streets: `scripts/blocc_boy_street.py` (same conventions as `art/strip/scripts/street.py`). `scripts/placeholder_store.py` makes the blank stand-in used until a building's art arrives.

## Shipped (`public/assets/reservoir/`)
| Asset | Size | Tris | Placed |
|---|---|---|---|
| reservoir-pawn | 6.2 x 10 x 4.5 m, 2.1 MB | ~0.7k | Blocc Boy Blvd, Kirkwood corner |
| reservoir-liquor-deli | 7.0 x 11 x 5.2 m, 2.0 MB | ~0.7k | Blocc Boy Blvd |
| reservoir-laundry | 7.3 x 12 x 4.2 m, 1.9 MB | ~0.7k | not yet (Dirty Money Drive) |
| no-refund-auto | 8.7 x 12 x 4.8 m, 1.9 MB | ~1.2k | not yet (No Refund Road) |
| westside-warehouse | 12.1 x 22 x 6.8 m, 1.9 MB | ~0.7k | not yet (No Refund Road) |
| blocc-boy-blvd | street, sidewalks, Kirkwood extension, poles, lot, 3.9 MB | ~2.8k | yes |
| placeholder-store | blank storefront, 0.9 MB | 72 | barbershop and beauty supply slots |

Known limits: window bars and wall lamps' arms are painted (real lamp heads, sills, signs, canopies and doors have depth); the street GLBs each carry their own copy of the asphalt/sidewalk textures (shared texture files would save about 3 MB).
