# Round 5 starter outfit review

This hero-profile candidate contains the white jersey tee, standard indigo jeans and white court sneakers. The established IDs are `tee-white`, `jeans-denim-standard` and `court-sneakers-white`, in the independent `top`, `bottom` and `footwear` slots. The body mask is tied to the frozen Round 5 body GLB by SHA-256. The clothes bind to the 36 live body joints and use the body's clips.

## Three.js captures

All garment stills and the garment-free face detail are 1440 × 1440. The phone-size examples use a 390 × 844 browser viewport. The fixture uses the game's GLTFLoader, Basis transcoder, Meshopt decoder and dusk/night directional, hemisphere and RoomEnvironment lighting. It uses the Round 5 body with face-01 and complexion-01. Comparison images pair the previous Round 5 version on the left with the candidate on the right, under the same light and at the same pose.

| Garment | Views | Construction and materials | Before and after |
| --- | --- | --- | --- |
| White tee | [Front](previews/tee-white-front.jpg) · [Back](previews/tee-white-back.jpg) · [Side](previews/tee-white-side.jpg) · [Three-quarter](previews/tee-white-three-quarter.jpg) | [Neckline](previews/tee-white-neckline.jpg) · [Shoulders](previews/tee-white-shoulders.jpg) · [Hem](previews/tee-white-hem.jpg) · [Jersey](previews/tee-white-jersey.jpg) | [Comparison](previews/tee-white-comparison.jpg) |
| Standard blue jeans | [Front](previews/jeans-denim-standard-front.jpg) · [Back](previews/jeans-denim-standard-back.jpg) · [Side](previews/jeans-denim-standard-side.jpg) · [Three-quarter](previews/jeans-denim-standard-three-quarter.jpg) | [Waist and hem](previews/jeans-denim-standard-waist.jpg) · [Waistband and loops](previews/jeans-denim-standard-waistband.jpg) · [Back pockets](previews/jeans-denim-standard-back-pockets.jpg) · [Knees](previews/jeans-denim-standard-knees.jpg) · [Ankles](previews/jeans-denim-standard-ankles.jpg) · [Twill and stitches](previews/jeans-denim-standard-twill.jpg) | [Comparison](previews/jeans-denim-standard-comparison.jpg) |
| White court sneakers | [Front](previews/court-sneakers-white-front.jpg) · [Back](previews/court-sneakers-white-back.jpg) · [Side](previews/court-sneakers-white-side.jpg) · [Three-quarter](previews/court-sneakers-white-three-quarter.jpg) | [Leather, laces and sole](previews/court-sneakers-white-leather-laces.jpg) · [Collar](previews/court-sneakers-white-collar.jpg) | [Comparison](previews/court-sneakers-white-comparison.jpg) |

[Complete outfit](previews/starter-full-outfit.jpg) · [City night](previews/starter-city-night.jpg) · [390 px dusk](previews/starter-phone-dusk.jpg) · [390 px night](previews/starter-phone-night.jpg)

[Idle MP4](previews/idle.mp4) · [Walk MP4](previews/walk.mp4) · [Run MP4](previews/run.mp4)

Each MP4 shows front and rear three-quarter views over the entire clip, including both endpoints. Idle spans 6.035 seconds (146 sampled poses), Walk 1.033 seconds (26 poses), and Run 0.700 seconds (18 poses).

## Source and validation

The [Blender 5.3 source](source/protagonist-male-wardrobe_source.blend) packs nine 2K textures. The runtime GLBs use 1K per map, down from about 25 MB combined on the initial 2K trial to 5.93 MB combined here. Keep 1K for this review. The tee and shoes are the first candidates for a 512 px test at gameplay distance. Keep the denim at 1K until a phone review confirms how the seams and topstitching read.

The first pass reused the Round 5 pattern and skin weights. Local changes eased the shoulder and front crotch, added subtle hem, knee and cuff shaping, and lifted the lace spans at their centers. The base, tangent normal and packed AO/roughness/metallic atlas combines the previous construction details with the sourced surface maps. The packed blue channel holds zero metalness for these dielectric materials. The new rubber and lace regions have a higher roughness than the leather upper.

- [Blender QA](validation/blender-qa.json) passed mesh and rig checks. The tee and jeans sit above the origin by design. The sneaker pair shares stacked left/right UVs.
- [Export checks](validation/exports.json) passed for joint names, joint transforms, inverse bind matrices, tangents and compression. The [compressor output](validation/compression.log) confirms the four authored slots. Blender's shared-texture sampler warning is recorded here because both AO and roughness/metallic reference one atlas and the exported slots survived.
- [Three.js slot checks](validation/threejs-stills.json) exercised the full outfit and each garment independently, and verified compressed base colour, normal, roughness/metallic and occlusion on the actual assets. [Cycle measurements](validation/threejs-video.json) record full clip durations and sample counts.
- The [character checker](validation/check-character.log) fails its full-character file preflight. The three wearables have their own GLBs and use the frozen body's separate head and animation fixtures. Physical-phone capture is pending.

[Sources, licences and Meshy spend](CREDITS.md)

## Remaining visual defects

- **Tee.** The cap of the sleeve is still boxy in front view. The armhole pinches on the inside, the rear hem sticks out in profile and the edge of the collar reads thin. The weave direction changes abruptly near the shoulder.
- **Jeans.** The front crotch still makes a sharp shaded wedge. The inseam and knee folds read angular in close-up. The back pockets and belt loops read flatter than the topstitching suggests.
- **Sneakers.** The lace ends and several baked eyelets do not line up. The edge of the leather quarters and the rubber skirt read smooth, and the outsole has little visible relief. The laces are clearer in a close-up than at gameplay distance.

In the cycle review, the tee still creases sharply inside the swinging sleeve and the hand grazes the hip during the counter-swing. The denim pinches behind the lifted knee in Run. The cuff rides above the collar and lets some ankle show, and the shoe flex looks rigid at toe-off. The two full-body views expose the large deformation defects. Small skin intersections may need closer inspection on a phone.

The frozen face shows patchy shading around the near eye, nose and mouth, and visible breaks in tone along the jaw and neck. These are visible in the [garment-free face and neck capture](previews/frozen-body-face-neck.jpg).
