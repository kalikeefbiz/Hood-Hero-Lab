# Reservoir layout (draft lock, 2026-11-21)

Source: Vesper's street plans and building shots in `art/reservoir/ref/`, approved by the owner ("pictures answer every question"). Orientation decision from the owner: **the water tower is the westernmost point of the Reservoir and of the whole Stixx.** North is up on every plan.

## Streets (from the plans)
| Street | Direction | Notes from its plan |
|---|---|---|
| Big Mouth Boulevard | east-west | Water tower at the far west end of the north side, then three houses (blue, boarded/vacant, grey) and Lil Jay's. Five houses on the south side. |
| No Refund Road | east-west | North: Westside Warehouse (docks L1-L3, back lot) and the vacant-lot basketball court. South: a shed/garage, Lil Jay's, a service garage. ~192 m x 96 m block. |
| Dirty Money Drive | east-west | North: three houses, Reservoir Laundry, Lil Jay's. South: six houses. Parallel street parking, back-lot alleys both sides. |
| Blocc Boy Boulevard | east-west, main boulevard | Commercial row: Barbershop, Liquors, Lil Jay's, Pawn Shop, vacant brick. South: Laundromat, Beauty Supply, parking lot, mixed-use. Houses behind. |
| Lil Bit Lane | east-west | North: 4 houses then Lil Jay's at the east corner; rear alley. Cross streets labelled **Baylor Ave** (west) and **Kirkwood St** (east). |

## Decision (owner, 2026-11-21)
**Lil Jay's Market stays exactly as already built** (the strip from PR #36 and #39). It is Lil Bit Lane, north side, east corner at Kirkwood St, with its houses to the west and houses across the street. The other plans only reuse the store as a style landmark. Each other location lives on one street only:

| Street | Storefronts and landmarks (one each) | Build order |
|---|---|---|
| Lil Bit Lane | Lil Jay's Market (built), houses | 1 (finish what exists) |
| Blocc Boy Boulevard | Pawn Shop, Reservoir Liquor & Deli, Barbershop, Beauty Supply, vacant brick, parking lot. The main commercial street; most game locations connect here | 2 |
| No Refund Road | Westside Warehouse, vacant-lot court, No Refund Auto & Tires | 3 |
| Dirty Money Drive | Reservoir Laundry, houses, street parking, back-lot alleys | 4 |
| Big Mouth Boulevard | Water tower (westernmost point), boarded house, Reservoir homes | 5 |

The second laundry on Blocc Boy's plan becomes another storefront. North-south order of the streets is not fixed by the art; Claude proposes it when laying the grid.

## Address numbers seen on the art
Lil Jay's 1428, Reservoir Laundry 716, Pawn 412, Liquor & Deli 218, No Refund Auto & Tires 318.

## Not yet in the game (do not add to game data without the owner)
Reservoir Liquor & Deli, No Refund Auto & Tires, Barbershop, Liquors, Beauty Supply, Laundromat. Treated as scenery until Codex/owner make them places. Known game ids: `reservoir.lil-jays`, `.laundry`, `.pawn`, `.warehouse`, `.lot-court`, `.boarded-house`, `.homes`, `.water-tower`.

## Art status
- Have: five street plans, plus angled shots of Liquor & Deli, Auto & Tires, Westside Warehouse, Pawn, Laundry.
- Front elevations received 2026-11-21 (`front-*.png`): Laundry, Westside Warehouse, No Refund Auto & Tires, Pawn & Resale, Liquor & Deli. Front + angled pair is complete for all five.
- Barber Shop and Beauty Supply received 2026-11-21 (fronts are canon; the angled shots differ in details and were used only for side-wall reference).
- Still need: lot court, water tower, house types, props.

## Built (2026-11-21)
- **Blocc Boy Boulevard** (street 2) is one block south of Lil Bit Lane, reached down Kirkwood St. North side, west to east: parking lot, Reservoir Barber Shop, Reservoir Liquor & Deli, Reservoir Beauty Supply, Reservoir Pawn & Resale on the Kirkwood corner. South side is fenced empty lots for now. Coordinates in `src/strip/layout.ts`.
- Laundry, Auto & Tires and Westside Warehouse are built and waiting for their streets.
- The plans are concept art, not survey drawings. Claude sets one metric grid when building.

## Street grid as built (2026-11-21)
Owner: Vesper's plans are references, not authority; Claude lays out the city. North to south along Kirkwood St (x 6.6..14):

| Street | Road (three.js z) | What's on it |
|---|---|---|
| Big Mouth Blvd | -40.6..-31.2 | Water tower closes the west end (x -68, the westernmost point of the Stixx). North side: boarded house (327), two houses. South side: the back fences of Lil Bit Lane's houses. |
| Lil Bit Lane | ~3..12.6 | Lil Jay's Market and its houses (unchanged). |
| Blocc Boy Blvd | 48..57.4 | Barber Shop, Liquor & Deli, Beauty Supply, Pawn. South side open. |
| No Refund Road | 92..101.4 | Westside Warehouse, Lot Court, No Refund Auto & Tires (court mural on its west wall). South side open. |
| Dirty Money Drive | -92..-82.6 | North of Big Mouth, the northern edge. Reservoir Laundry on the Kirkwood corner, three houses each side, fenced empty lots between. |

Game locations now standing in the city: `reservoir.lil-jays`, `.pawn`, `.warehouse`, `.lot-court`, `.boarded-house`, `.water-tower`. `.laundry` is on Dirty Money Drive. Still to decide: which houses are `.homes` (for Codex/owner).

## Design intent (owner, 2026-11-21)
The Reservoir's west side is meant to feel thin: empty lots, run-down and abandoned houses, a handful of family-owned businesses. A fantasy Detroit or Flint. Not every lot gets filled; open lots and fenced yards are part of the look.

## Loading (2026-11-21)
Streets load as groups, nearest to the start first, four files at a time; the start street (Lil Bit Lane) is playable after ~8 MB, the rest streams in behind it. Repeated files (houses) download once and are cloned. Tiling textures are shared from `public/assets/tex/`. Whole Reservoir: ~25 MB (was ~45 MB).
