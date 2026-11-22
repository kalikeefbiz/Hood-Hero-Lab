# Reservoir map (for Codex and Gemini)

Picture: `docs/maps/reservoir-map.png` (also `.svg`, readable as text). North is up. One grid square is 20 m.
Data: `src/strip/cityMap.ts` (import it, never copy coordinates). Regenerate the picture after any map change:
`node art/reservoir/scripts/map_svg.mjs`. Open `strip.html?map` for a live overlay on the 3D city.

Coordinates are metres in three.js world space: x east, z south, y up. `facing` 0 means the door faces +z (south); `Math.PI` faces north.

## Streets, north to south
| Street | z span | What's on it |
|---|---|---|
| Dirty Money Dr | -92 to -82.6 | Laundry (corner at Kirkwood), six houses, two duplex units |
| Big Mouth Blvd | -40.6 to -31.2 | Water tower (west end), boarded house, two houses |
| Lil Bit Lane | 3 to 12.6 | Lil Jay's Market (east, Kirkwood corner), 7 houses, player start, Quanny |
| Blocc Boy Blvd | 48 to 57.4 | Pawn, barber, liquor & deli, beauty supply |
| No Refund Road | 92 to 101.4 | Warehouse, fenced Lot Court, No Refund Auto & Tires |
| Kirkwood St | x 6.6 to 14 | N-S connector across all five streets |

The water tower is the west end of the Reservoir and the Stixx. West of it is the edge of the map.

## Places (have a game `locationId`)
`reservoir.lil-jays`, `reservoir.pawn`, `reservoir.warehouse`, `reservoir.lot-court`, `reservoir.laundry`, `reservoir.boarded-house`, `reservoir.water-tower`. Standing spots and radii are in `DOORS`.

## Reservoir Homes (home-invasion properties)
Owner rule: **every hood has a Homes section, a set of properties that can be cased and broken into.** In the Reservoir that is all 16 entries in `HOUSES`. Each has the same `locationId` (`reservoir.homes`) and its own stable `id` (`res-home-01` to `res-home-16`). The id is what saves and jobs must point at.

- `targetId` links a property to an engine robbery target in `src/content/robberyCareer.ts`.
  Attached now: `res-home-02` (tan house by Lil Jay's) = `home.reservoir.1` Weathered porch; `res-home-12` (tan bungalow, Dirty Money) = `home.reservoir.2` Green bungalow; `res-home-08` (dark two-story, Big Mouth) = `home.reservoir.3` Old collector's house.
- `targetId: null` means a real house with no job yet. Content can attach one by editing only the data, no map changes.
- `res-home-13` and `res-home-14` are the two sides of one duplex (721, 723).
- The boarded house is NOT a home here. It's its own place (`reservoir.boarded-house`).
- Other hoods follow the same shape later: `southside.homes` with ids `south-home-NN`, and so on.

## Solid things
`WALLS` (building footprints) and `FENCES` (Lot Court perimeter, with a gate gap at x -18.8 to -15.1) can't be walked through. `WALK_BOUNDS` is the outer edge. Everything else is walkable, including empty lots (the west side is meant to look empty and run down).
