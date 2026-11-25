# Round 5 wardrobe visual review

Each comparison uses the frozen Round 5 body, face-01 and complexion-01 in
Three.js. The first row uses PR #77 garment GLBs with their inverse binds and
body masks remapped onto Round 5. Round 5 reorders and splits some runtime
vertices. The geometric triangle mapping recovers the baseline masks except
for 10 triangle ordinals on each T-shirt. The second row uses the refreshed
GLBs, Round 5 inverse binds and masks.

Recordings show the refit in front and rear views. Each contains the full
authored Idle, Walk and Run clip, in that order. The starter uses 30 poses
per second. Catalog gait recordings sample at 24 poses per second, with eight
poses per second for the slower Idle. The capture includes both endpoints.
The clips are the frozen body GLB tracks.

| Wearable | Before and after | Idle, Walk and Run | Remaining observations |
| --- | --- | --- | --- |
| Starter outfit | [PNG](../../previews/round5/starter-comparison.png) | [MP4](../../previews/round5/starter-cycles.mp4) | Sleeves still crease sharply under the arms. The denim pinches on the inside of the bent knee in Run. |
| tee-white | [PNG](../../previews/round5/tee-white-comparison.png) | [MP4](../../previews/round5/tee-white-cycles.mp4) | The shoulders still read slightly boxy. The inner sleeve crease is sharp when the arm falls against the torso. |
| jeans-denim-standard | [PNG](../../previews/round5/jeans-denim-standard-comparison.png) | [MP4](../../previews/round5/jeans-denim-standard-cycles.mp4) | The front crotch has a sharp shaded gusset, and the back of the knee can pinch during Run. |
| court-sneakers-white | [PNG](../../previews/round5/court-sneakers-white-comparison.png) | [MP4](../../previews/round5/court-sneakers-white-cycles.mp4) | The low sole stays aligned in bind pose. Some jeans combinations show a narrow skin ring above the shoe collar in stride. |
| tee-stixx-black | [PNG](../../previews/round5/tee-stixx-black-comparison.png) | [MP4](../../previews/round5/tee-stixx-black-cycles.mp4) | The same inner sleeve crease reads as a dark notch, especially under rear lighting. |
| tank-white | [PNG](../../previews/round5/tank-white-comparison.png) | [MP4](../../previews/round5/tank-white-cycles.mp4) | Small jagged spots remain at the side hem over the denim waistband, and the armhole binding deforms tightly in Run. |
| flannel-long-sleeve | [PNG](../../previews/round5/flannel-long-sleeve-comparison.png) | [MP4](../../previews/round5/flannel-long-sleeve-cycles.mp4) | The rear collar still has a small angular fold. Bent elbows produce a sharp crease in the plaid. |
| hoodie-gray-down | [PNG](../../previews/round5/hoodie-gray-down-comparison.png) | [MP4](../../previews/round5/hoodie-gray-down-cycles.mp4) | The lowered hood has a sharp lower fold. The kangaroo pocket lower lip and elbow folds still read stiff. |
| hoodie-gray-up | [PNG](../../previews/round5/hoodie-gray-up-comparison.png) | [MP4](../../previews/round5/hoodie-gray-up-cycles.mp4) | The hood opening sits wide near the cheeks. The kangaroo pocket lower lip reads stiff and Run compresses the inner elbows. |
| windbreaker-black-open | [PNG](../../previews/round5/windbreaker-black-open-comparison.png) | [MP4](../../previews/round5/windbreaker-black-open-cycles.mp4) | A small undershirt fleck remains near one placket edge. The lower-back shading and elbow folds are angular in motion. |
| puffer-black-closed | [PNG](../../previews/round5/puffer-black-closed-comparison.png) | [MP4](../../previews/round5/puffer-black-closed-cycles.mp4) | Bright angular shading remains on the lower back even with the body hidden. The hand grazes or enters the side hem at peak Run flex. |
| jeans-black-skinny | [PNG](../../previews/round5/jeans-black-skinny-comparison.png) | [MP4](../../previews/round5/jeans-black-skinny-cycles.mp4) | The tight fit amplifies folds around the inner knee and calf. A small ankle ring shows in stride. |
| jeans-denim-baggy | [PNG](../../previews/round5/jeans-denim-baggy-comparison.png) | [MP4](../../previews/round5/jeans-denim-baggy-cycles.mp4) | The stacked cuffs have some angular folds and can touch the shoe collars at large ankle angles. |
| cargo-black | [PNG](../../previews/round5/cargo-black-comparison.png) | [MP4](../../previews/round5/cargo-black-cycles.mp4) | The inner leg pinches in Run. A small ankle ring shows between the cuff and court shoe. |
| sweats-gray | [PNG](../../previews/round5/sweats-gray-comparison.png) | [MP4](../../previews/round5/sweats-gray-cycles.mp4) | The softer cuff still shows polygonal gathers in close-up. Some ankle remains visible above the shoes. |
| shorts-athletic | [PNG](../../previews/round5/shorts-athletic-comparison.png) | [MP4](../../previews/round5/shorts-athletic-cycles.mp4) | The turned cuff is angular at high knee lift, and the front gusset reads as a dark wedge from some angles. |
| flip-flops | [PNG](../../previews/round5/flip-flops-comparison.png) | [MP4](../../previews/round5/flip-flops-cycles.mp4) | The toe post and straps follow the foot and have limited flex. The heel stays attached to the sole in Run. |
| slides-black | [PNG](../../previews/round5/slides-black-comparison.png) | [MP4](../../previews/round5/slides-black-cycles.mp4) | The molded band remains stiff in forefoot flex. The heel stays with the sole through Run. |
| court-sneakers-black | [PNG](../../previews/round5/court-sneakers-black-comparison.png) | [MP4](../../previews/round5/court-sneakers-black-cycles.mp4) | The same collar clearance applies as with the white shoe. The outsole and toe flex remain visibly rigid during the fastest stride. |

## Validation

The [GLB checks](exports.json) verify the Round 5 rest transforms, inverse-bind
quantization frame, joint names and hierarchy, tangents and textures.
[Blender asset QA](blender-qa.json) and the [rig checks](rig-skin.json) cover all
18 garments. Open cuffs and hems, stacked footwear UVs and trim UV overlaps
are intentional. Blender's asymmetry sample reflects the transferred body
weights, loose details and asymmetric patterns. The measured ground offset
for each footwear option is in the manifest.

The [Three.js report](threejs-cycles.json) records the outfit in each capture,
KTX2 base-color and normal decoding, scalar roughness, normalized exported
weights, mask counts, and full clip timing. The open windbreaker keeps the
shirt panel visible and restores the full tee when removed. The closed
jackets suppress the tee and restore it when removed. The white tee and both
court colorways use independently swappable GLBs. The [variant check](geometry-variants.json)
verifies shared tee and court geometry with distinct base colors.

The Blender QA and runtime structural checks pass. The observations above
remain open for visual review. The showcased layering uses the listed
outfits and one head. Other combinations, hair under the raised hood,
city lighting and physical iPhone playback remain unverified.
