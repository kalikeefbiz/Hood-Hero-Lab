#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
wardrobe=art/incoming/protagonist-male-wardrobe
canonical=${1:-art/incoming/protagonist-male}
canonical_source=${2:-art/incoming/protagonist-male/source/protagonist-male_source.blend}
staging=${3:-$(mktemp -d)}
mkdir -p "$staging"
staging=$(realpath "$staging")
skills=${BLENDER_SKILLS:-"$HOME/.agents/skills"}
runner="$skills/blender-core/scripts/run_in_blender.py"
export PYTHONDONTWRITEBYTECODE=1

tops=(tee-stixx-black tank-white flannel-long-sleeve)
outerwear=(hoodie-gray-down hoodie-gray-up windbreaker-black-open puffer-black-closed)
bottoms=(jeans-black-skinny jeans-denim-baggy cargo-black sweats-gray shorts-athletic)
footwear=(flip-flops slides-black court-sneakers-black)
items=("${tops[@]}" "${outerwear[@]}" "${bottoms[@]}" "${footwear[@]}")
python "$wardrobe/pipeline/textures.py"

previous="$canonical_source"
for item in "${items[@]}"; do
  python "$runner" --blend "$previous" "$wardrobe/pipeline/build.py" -- "$item" "$staging" > "$staging/$item.build.jsonl"
  previous="$staging/$item.blend"
done
python "$runner" --blend "$previous" "$wardrobe/pipeline/catalog-qa.py" -- "${items[@]}" > "$wardrobe/validation/catalog-qa.json"
python -c 'import json,sys; failures=[(name,data["errors"]) for name,data in json.load(open(sys.argv[1])).items() if not data["pass"]]; assert not failures,failures' "$wardrobe/validation/catalog-qa.json"
python "$runner" --blend "$previous" "$wardrobe/pipeline/export.py" -- \
  "$wardrobe/source/male-wardrobe-catalog.blend" "$staging" "${items[@]}" > "$staging/blender-exports.jsonl"

compress=art/source/hood-hero/quanny/pipeline/compress.mjs
files=()
compress_batch() {
  local folder=$1
  shift
  mkdir -p "$wardrobe/models/$folder"
  for item in "$@"; do
    local size=256
    case "$item" in tee-stixx-black|flannel-long-sleeve|jeans-denim-baggy|jeans-black-skinny) size=512 ;; esac
    local file="$wardrobe/models/$folder/$item.glb"
    node "$compress" "$staging/$item.glb" "$file" "$size" 1 > "$staging/$item.compress.log" 2>&1
    files+=("$file")
  done
}
compress_batch tops "${tops[@]}"
compress_batch outerwear "${outerwear[@]}"
compress_batch bottoms "${bottoms[@]}"
compress_batch footwear "${footwear[@]}"
node "$wardrobe/pipeline/check-exports.mjs" "$canonical/protagonist-male.glb" "${files[@]}" \
  > "$wardrobe/validation/catalog-exports.json"
node "$wardrobe/pipeline/body-reference.mjs" "$canonical/protagonist-male.glb" "$staging/canonical-runtime.json"
python "$runner" --blend "$previous" "$wardrobe/pipeline/masks.py" -- \
  "$staging/canonical-runtime.json" "$staging" "${items[@]}"
python "$wardrobe/pipeline/manifest-catalog.py" "$staging"
printf 'Catalog render staging is at %s\n' "$staging"
