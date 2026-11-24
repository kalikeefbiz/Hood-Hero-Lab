# Hood Hero character pipeline V2 pilot

This draft compares the merged protagonist, the same protagonist with 100STYLE motion capture, and a 1.78 m MPFB alternative on the same capture. It includes three starter wardrobe pieces on both foundations. See the [evaluation](validation/REPORT.md) for the results and the [workflow recommendation](recommendations/WORKFLOW.md) for what to validate next.

## Open the preview

From the repository root with Node 24 and Python 3 available:

```sh
npm ci
python3 -m http.server 4176 --bind 0.0.0.0
```

Open [the local comparison](http://localhost:4176/art/incoming/character-pipeline-pilot/preview/). For a phone on the same local network, use the serving computer’s LAN address in place of localhost. The standalone viewer uses Three.js 0.170 and the repository Basis transcoder. It compares all three models at equal scale, with a smaller single-model mode for close inspection on a phone. Playback begins at a shared time on a clip change. Loop durations remain native to the models. Use **Bind pose** and **Skeleton** to inspect pivots, or turn off **Outfit** to inspect anatomy. Live motion changes blend for 200 ms.

The Lab Pages workflow publishes main. Review the recorded comparisons or run the local preview above.

## Review assets

| Comparison | Runtime | Editable Blender |
| --- | --- | --- |
| Current geometry and current motion | [Original baseline files](baseline/README.md) | [Original project](../protagonist-male/source/protagonist-male_source.blend) |
| Current geometry and mocap | [Canonical body with replacement clips](test-a/protagonist-mocap.glb) | [Test A](source/test-a.blend) |
| MPFB geometry and mocap | [Two-material MPFB avatar](test-b/mpfb-protagonist.glb) | [Test B](source/test-b.blend) |
| Existing outfit on both foundations | [MPFB fitting with visibility variants](test-c/mpfb-outfit.glb) · [Canonical mask](test-c/canonical-masks.json) | [MPFB fitting](source/test-c.blend) |

[Idle](renders/idle.mp4) · [Walk](renders/walk.mp4) · [Run](renders/run.mp4)

[Front](renders/front.png) · [Side](renders/side.png) · [Rear](renders/rear.png) · [Close-up](renders/close-up.png) · [Bind pose](renders/bind.png) · [Night at gameplay distance](renders/night-gameplay.png) · [Phone-sized layout](renders/phone-sized.png)

In Blender, select the armature in the source scene and load Idle, Walk or Run in the Action Editor. The MPFB source also keeps the authoring targets and helper groups.

## Reproduce the builds

Use Blender 5.3.0, Node 24, Python 3.11+, Git, curl and unzip. Give the script a writable tool and output directory outside the checkout.

```sh
PILOT_TOOLS=/absolute/path/to/pilot-tools \
BLENDER_EXE=/absolute/path/to/blender \
bash art/incoming/character-pipeline-pilot/pipeline/rebuild.sh
```

Input archive URLs and SHA-256 hashes are pinned in the [provenance manifest](licensing/provenance.json). Browser captures can be recreated with the server running. Set PILOT_RECORD=1 to also collect 15 FPS comparison PNG frames, then encode them to H.264 MP4 with FFmpeg.

```sh
PILOT_RECORD=1 node art/incoming/character-pipeline-pilot/pipeline/review.mjs /tmp/hood-hero-comparison
ffmpeg -framerate 15 -i /tmp/hood-hero-comparison/Idle/%04d.png \
  -vf 'pad=ceil(iw/2)*2:ceil(ih/2)*2' -c:v libx264 -pix_fmt yuv420p /tmp/hood-hero-idle.mp4
```

[Motion and asset credits](licensing/ATTRIBUTION.md)
