#!/usr/bin/env bash
set -euo pipefail
pilot=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repo=$(git -C "$pilot" rev-parse --show-toplevel)
: "${PILOT_TOOLS:?Set PILOT_TOOLS to a workspace outside the Git repository.}"
: "${BLENDER_EXE:?Set BLENDER_EXE to the absolute Blender 5.3.0 executable.}"
mkdir -p "$PILOT_TOOLS"
tools=$(cd "$PILOT_TOOLS" && pwd)
case "$tools/" in "$repo/"*) echo "PILOT_TOOLS must be outside Git" >&2; exit 1;; esac
cd "$tools"
export BLENDER_USER_RESOURCES="$tools/blender-user" PYTHONDONTWRITEBYTECODE=1
mkdir -p motion stage
python3 "$pilot/pipeline/download.py" "$pilot/licensing/provenance.json"
unzip -qo system.zip -d system
if [[ ! -d "$BLENDER_USER_RESOURCES/extensions/user_default/mpfb" ]]; then
  "$BLENDER_EXE" --command extension install-file -r user_default -e "$tools/mpfb.zip"
fi
wardrobe=b113b4233325d5573b33a7ab805e77abb5e7b397
wardrobe_file=art/incoming/protagonist-male-wardrobe/source/male-starter-outfit.blend
if ! git -C "$repo" cat-file -e "$wardrobe"; then
  git -C "$repo" fetch origin codex/male-wardrobe-catalog
fi
git -C "$repo" show "$wardrobe:$wardrobe_file" > stage/starter.blend
base="$pilot/../protagonist-male"
printf '%s  %s\n' eb7cd60d1d3568824747ceca2579d753d2d926833b805f71d06502fdaadd7f0a "$base/protagonist-male.glb" | sha256sum -c -
npm install --no-fund --no-audit @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 ktx2-encoder@0.6.0 meshoptimizer@1.3.0 sharp@0.35.5 gltf-validator@2.0.0-dev.3.10
cp "$pilot/pipeline/"{compress,qa-glb}.mjs .
for kind in a b; do
  "$BLENDER_EXE" -b -t 4 --python-exit-code 1 --python "$pilot/pipeline/build.py" -- "$kind" "$tools" "$tools/stage"
done
"$BLENDER_EXE" -b -t 4 --python-exit-code 1 --python "$pilot/pipeline/outfit.py" -- "$base/source/protagonist-male_source.blend" "$tools/stage/starter.blend" "$tools/stage"
python3 "$pilot/pipeline/splice.py" "$base/protagonist-male.glb" stage/a.glb stage/protagonist-mocap.glb
node compress.mjs stage/b.glb stage/mpfb-protagonist.glb
node compress.mjs stage/c.glb stage/mpfb-outfit.glb
node qa-glb.mjs "$base/protagonist-male.glb" stage/protagonist-mocap.glb stage/mpfb-protagonist.glb stage/mpfb-outfit.glb > stage/glb-qa.json
printf 'Build outputs are in %s/stage\n' "$tools"
