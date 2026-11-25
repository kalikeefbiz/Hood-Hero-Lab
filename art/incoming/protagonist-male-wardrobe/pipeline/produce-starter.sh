#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
cd "$repo"
wardrobe=art/incoming/protagonist-male-wardrobe
canonical=${1:-art/incoming/protagonist-male}
canonical_source=${2:-art/incoming/protagonist-male/source/protagonist-male_source.blend}
staging=${3:-$(mktemp -d)}
mkdir -p "$staging"
staging=$(realpath "$staging")
skills=${BLENDER_SKILLS:-"$HOME/.agents/skills"}
runner="$skills/blender-core/scripts/run_in_blender.py"
items=(tee-white jeans-denim-standard court-sneakers-white)

python "$wardrobe/pipeline/textures.py"
previous="$canonical_source"
for item in "${items[@]}"; do
  python "$runner" --blend "$previous" "$wardrobe/pipeline/build.py" -- "$item" "$staging"
  previous="$staging/$item.blend"
done
python "$runner" --blend "$previous" "$skills/blender-asset-qa/scripts/qa_check.py" --   --objects "${items[@]}" --profile game --eps .0003 --tol .001 > "$wardrobe/validation/blender-qa.json"
python -c 'import json,sys; assert json.load(open(sys.argv[1]))["pass"]' "$wardrobe/validation/blender-qa.json"
python "$runner" --blend "$previous" "$skills/blender-game-optimization/scripts/mesh_stats.py" --   --objects Body Head_face_01 "${items[@]}" --budget web > "$wardrobe/validation/blender-budget.json"
python "$runner" --blend "$previous" "$wardrobe/pipeline/export.py" --   "$wardrobe/source/male-starter-outfit.blend" "$staging" "${items[@]}" > "$wardrobe/validation/blender-exports.jsonl"

compress=art/source/hood-hero/quanny/pipeline/compress.mjs
tops="$wardrobe/models/tops/tee-white.glb"
bottoms="$wardrobe/models/bottoms/jeans-denim-standard.glb"
footwear="$wardrobe/models/footwear/court-sneakers-white.glb"
node "$compress" "$staging/tee-white.glb" "$tops" 256 1
node "$compress" "$staging/jeans-denim-standard.glb" "$bottoms" 512 1
node "$compress" "$staging/court-sneakers-white.glb" "$footwear" 256 1
node "$wardrobe/pipeline/check-exports.mjs" "$canonical/protagonist-male.glb"   "$tops" "$bottoms" "$footwear" > "$wardrobe/validation/exports.json"
node "$wardrobe/pipeline/body-reference.mjs" "$canonical/protagonist-male.glb" "$staging/canonical-runtime.json"
python "$runner" --blend "$previous" "$wardrobe/pipeline/masks.py" --   "$staging/canonical-runtime.json" "$staging" "${items[@]}"
cp "$staging/body-masks.json" "$wardrobe/body-masks.json"
printf 'Render staging is at %s\n' "$staging"
