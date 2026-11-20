#!/bin/bash
# optimize + KTX2: UASTC for the sign atlas and normal maps, ETC1S for the rest
set -e
export PATH=/tmp/ktx/KTX-Software-4.4.0-Linux-x86_64/bin:$PATH
export LD_LIBRARY_PATH=/tmp/ktx/KTX-Software-4.4.0-Linux-x86_64/lib
cd /tmp/gtt
for f in "$@"; do
  in=/tmp/lj/out/$f.glb; tmp=/tmp/lj/out/$f.tmp.glb; out=/tmp/strip/public/assets/strip/$f.glb
  npx gltf-transform dedup $in $tmp >/dev/null
  npx gltf-transform prune $tmp $tmp >/dev/null
  npx gltf-transform resize $tmp $tmp --width 2048 --height 2048 >/dev/null
  npx gltf-transform uastc $tmp $tmp --pattern "*atlas_albedo*" --level 2 --rdo --rdo-lambda 1.0 --zstd 18 >/dev/null
  npx gltf-transform uastc $tmp $tmp --pattern "*normal*" --level 1 --rdo --rdo-lambda 2.0 --zstd 18 >/dev/null
  npx gltf-transform etc1s $tmp $tmp --quality 200 >/dev/null
  npx gltf-transform meshopt $tmp $out >/dev/null
  rm -f $tmp
  ls -la $out
done
