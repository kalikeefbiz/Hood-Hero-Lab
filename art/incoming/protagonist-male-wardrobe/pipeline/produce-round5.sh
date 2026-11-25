#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
wardrobe=art/incoming/protagonist-male-wardrobe
previous=art/incoming/protagonist-male
round5=art/incoming/protagonist-male-rework
stage=${1:?Pass a staging directory}
phase=${2:?Pass starter, tops, outerwear, bottoms, or footwear}
: "${BLENDER_SKILLS:?Set BLENDER_SKILLS to the pinned Blender Skills checkout's skills directory}"
blender=${BLENDER_EXE:-blender}
catalog=${WARDROBE_BASELINE_REF:-b113b4233325d5573b33a7ab805e77abb5e7b397}
mkdir -p "$stage"
stage=$(realpath "$stage")
scratch="$stage/$phase"
mkdir -p "$scratch"

case "$phase" in
  starter)
    source=male-starter-outfit.blend
    items=(tee-white jeans-denim-standard court-sneakers-white)
    mkdir -p "$stage/baseline"
    git archive "$catalog:$wardrobe" models | tar -x -C "$stage/baseline"
    git show "$catalog:$wardrobe/body-masks.json" > "$stage/original-masks.json"
    node "$wardrobe/pipeline/body-reference.mjs" "$previous/protagonist-male.glb" "$stage/protagonist-male.json"
    node "$wardrobe/pipeline/body-reference.mjs" "$round5/protagonist-male-rework.glb" "$stage/protagonist-male-rework.json"
    ;;
  tops) items=(tee-stixx-black tank-white flannel-long-sleeve) ;;
  outerwear) items=(hoodie-gray-down hoodie-gray-up windbreaker-black-open puffer-black-closed) ;;
  bottoms) items=(jeans-black-skinny jeans-denim-baggy cargo-black sweats-gray shorts-athletic) ;;
  footwear) items=(flip-flops slides-black court-sneakers-black) ;;
  *) echo "Unknown production phase $phase" >&2; exit 1 ;;
esac
source=${source:-male-wardrobe-catalog.blend}

# Always use the PR 77 source patterns and maps, including during re-runs.
git show "$catalog:$wardrobe/source/$source" > "$scratch/original-$source"
git archive "$catalog:$wardrobe" materials | tar -x -C "$scratch"
python "$wardrobe/pipeline/round5-textures.py" "$scratch/materials" "$scratch/baked" "${items[@]}"
"$blender" -b "$round5/source/protagonist-male-rework_source.blend" -t 2 --python-exit-code 1 \
  -P "$wardrobe/pipeline/refit-round5.py" -- "$previous/source/protagonist-male_source.blend" \
  "$scratch/original-$source" "$scratch/baked" "$scratch" "${items[@]}"
files=()
for id in "${items[@]}"; do
  read -r path size < <(node -e 'const v=require("./"+process.argv[1]+"/manifest.json").modular.wearables[process.argv[2]]; console.log(v.file,v.textureResolution[0])' "$wardrobe" "$id")
  node art/source/hood-hero/quanny/pipeline/compress.mjs "$scratch/$id.glb" "$wardrobe/$path" "$size" 1
  node "$wardrobe/pipeline/restore-roughness.mjs" "$scratch/$id.glb" "$wardrobe/$path"
  files+=("$wardrobe/$path")
done
node "$wardrobe/pipeline/check-exports.mjs" "$round5/protagonist-male-rework.glb" "${files[@]}" > "$scratch/exports.json"
