# Reservoir anchors, households and the presence seam

Claude's physical contract for the five Reservoir streets. Geometry lives in `src/strip/cityMap.ts`; `src/strip/anchors.ts` turns it into one list of destinations with stable ids. Nothing here is NPC behaviour. Who goes where, and when, belongs to the NPC simulation (Gemini). What happens there belongs to the engine (Codex).

## Anchors (`CITY_ANCHORS`)

Every anchor has `id`, `kind`, `locationId`, a standing point `x, z` (metres, three.js: x east, z south), an arrival `radius`, and the `facing` of its door. Anchors never sit inside a building footprint (`WALLS`); a test checks this.

| kind | id form | count | What it is |
| --- | --- | --- | --- |
| `place` | the game location id, e.g. `reservoir.lil-jays` | 7 | A business or landmark door with gameplay |
| `home` | `res-home-01` … `res-home-16` | 16 | A house front door; `locationId` is `reservoir.homes`, `propertyId` is the house id |
| `storefront` | `res-store-barber`, `res-store-liquor-deli`, `res-store-beauty-supply`, `res-store-auto` | 4 | Scenery storefronts; `locationId` stays `null` until a mechanic is approved (canon F) |
| `gathering` | `res-court-sideline`, `res-lil-jays-stoop` | 2 | Where people gather at a place, not tied to one person |
| `npc` | `npc:<characterId>` | 2 | A character's usual standing spot at a place (`NPC_SPOTS`) |

`anchorsAt(x, z, kinds?)` returns the anchors whose radius contains a point, nearest first. The player controller and the NPC simulation should both use it, so "arrived" means the same thing for everyone.

## Households (`HOUSEHOLDS`, canon section E)

| Household id | House | Kind | Residents (engine ids) | Canon residents (suggested ids, no engine record yet) |
| --- | --- | --- | --- | --- |
| `household.lewis` | `res-home-04` Lil Bit Lane, tan house (south) | owner-occupied | `mr-lewis` | |
| `household.splash-gang` | `res-home-03` Lil Bit Lane, abandoned house | bando | `quanny` | `baby-reek`, `tay-savage`, `lil-deuce`, `k3` |
| `household.bb-dirty-money` | `res-home-15` Dirty Money Dr, abandoned house | bando | | (other Blocc Boys, unassigned) |
| `household.duplex-721` | `res-home-13` duplex 721 | family | | `shay-reservoir` |
| `household.duplex-723` | `res-home-14` duplex 723 | family | | `keisha-reservoir` |
| `household.pat` | `res-home-16` Dirty Money Dr, tan bungalow (south) | owner-occupied | | `miss-pat` |

Why these houses:
- **Mr. Lewis** lives across Lil Bit Lane from his own market, in a kept-up house with no robbery target attached, which fits the canon's "Blocc Boys respect him".
- **Splash Gang's bando** is the abandoned house at the west end of Lil Bit Lane, the Blocc Boys' link-up street where Quanny is usually seen. It is deliberately **not** the 327 boarded house on Big Mouth Blvd (`reservoir.boarded-house`), which stays a street-work location.
- The three robbery targets (`res-home-02`, `-08`, `-12`) have no household, so nobody canon-named is on a robbery list by accident.
- Houses without a household are lived in by unnamed residents or stand empty. A household never makes a house buyable.

Codex: these ids are proposals for household records. If the engine stores households, keep these ids or tell me the engine's ids and I'll match them. Canon residents become `residents` once their character records exist.

## NPC spots and gathering spots

- `quanny` at `reservoir.lil-jays` (existing), outside the market.
- `mr-lewis` at `reservoir.lil-jays`, by his door (Codex map request 3).
- `res-court-sideline` inside the Lot Court gate (Codex map request 3).
- `res-lil-jays-stoop`, where the Blocc Boys link up outside the market without involving Mr. Lewis.

## Presence seam

Codex's API needs `peopleHere`: the people verifiably at a location. The strip gets it from a `PresenceSource` (`src/strip/previewSession.ts`):

```ts
interface PresenceSource { peopleAt(locationId: string): string[] }
```

Since the living-Reservoir integration this comes from Gemini's simulation (`src/strip/living.ts`, `sim.peopleHere`), filtered to engine characters. The old static fixtures are gone.

## Integration preview

`strip.html` (built to `dist/strip.html`) shows a marker over every anchor:
- gold: a place
- teal: a house with a known household
- red: a robbery lead
- white: other houses
- grey: scenery

Tap a marker, or use **Places**, to stand there. The card lists what the engine offers, with costs and refusal reasons, and shows the engine's own result text after an action.

It runs on a throwaway campaign in memory (`newGame`, never saved). "Next day" advances that test campaign only. `tests/strip-preview.spec.ts` checks that localStorage is untouched.
