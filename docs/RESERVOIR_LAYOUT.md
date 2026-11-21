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
- Still need: Barbershop and Beauty Supply (Blocc Boy Blvd), lot court, water tower, house types, props.

## Built (2026-11-21)
- **Blocc Boy Boulevard** (street 2) is one block south of Lil Bit Lane, reached down Kirkwood St. North side, west to east: parking lot, barbershop (placeholder), Reservoir Liquor & Deli, beauty supply (placeholder), Reservoir Pawn & Resale on the Kirkwood corner. South side is fenced empty lots for now. Coordinates in `src/strip/layout.ts`.
- Laundry, Auto & Tires and Westside Warehouse are built and waiting for their streets.
- The plans are concept art, not survey drawings. Claude sets one metric grid when building.
