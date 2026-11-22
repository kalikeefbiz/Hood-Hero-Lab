# Codex brief: make the Reservoir playable

Read `AGENTS.md` section 00, then `docs/RESERVOIR_MAP.md` (picture + data). The old board is frozen. The game is played in the walkable Reservoir (`strip.html`, code in `src/strip/`). Claude owns how it looks and where things are. You own making it play. Claude oversees: reviews at the checkpoints below so nothing gets built twice.

## Outcome (what must be true when you're done)
A player on an iPhone-size screen can: spawn outside Lil Jay's, walk the five streets with a touch pad without passing through buildings or fences, reach each place and use its real engine actions, talk to Quanny, buy at Lil Jay's, trigger the run-in and retreat, case and break into a Reservoir home, save, close, reload and continue. All of it on the existing save slot.

## Contract you read (don't edit)
`src/strip/cityMap.ts`: `WALLS`, `FENCES`, `WALK_BOUNDS`, `DOORS` (places), `HOUSES` (Reservoir Homes, each has `id`, `targetId`), `STOREFRONTS` (scenery for now), `NPC_SPOTS`, `PLAYER_START`. `window.__strip` gives you `scene`, `camera`, `controls`, `setMode`. Quanny has walk/run/idle clips in `public/assets/models/characters/`.

## How to get it right once (tips, not orders; keep your creativity)
1. **Build it data-driven, for five hoods.** Take a map object (`{walls, fences, doors, homes, npcs, bounds, start}`) rather than importing Reservoir constants all over `src/city/`. Southside, Eastside, Northside and Downtown arrive with the same shape, so adding a hood should need no new code in `src/city/`.
2. **One interaction path.** A single "what's the nearest interactable" function over doors, homes and NPCs feeds one prompt/tap UI. Places and homes both resolve to the engine's existing `placeActions` / robbery system. Don't write a second robbery or shop engine; `src/content/robberyCareer.ts` already has the targets.
3. **Save ids, not coordinates.** Save position as `{hood, doorId or homeId}`. Claude will move doors and fix walls, and coordinates will change. Home state (cased, hit, cooldown) is keyed by the property `id` in engine state, with a short migration note and a test that an old save still loads. Don't rename the save slot (PR #28 did; don't carry that over).
4. **Collision:** circle-vs-rectangle with sliding along walls, and segment collision for fences. Test at run speed so the player can't tunnel through a thin fence on a slow frame.
5. **Frame budget:** no allocation per frame, no React re-render per frame. The HUD updates only when its value changes. Put camera distance/height/lerp in one small constants file so Claude can tune the look without touching your logic.
6. **Testing without flaky walking:** expose a debug hook such as `window.__city.teleport(doorId)` and use it in most Playwright tests. Keep one real "walk with the pad" test. 390x844, Chromium + WebKit. `npm test` and `npm run build` green.
7. **Wiring to the strip:** `src/strip/main.ts` gets one import + one call that starts `src/city/`. Ask Claude to change anything else in `src/strip/`.
8. **Respect section 0:** things happen at places and with people, not in menus.

## Checkpoints (open each as a draft PR to Lab main, say which is ready for Claude)
- **A. Move:** spawn, touch pad, collision, follow camera, a text-free test that you can't enter buildings. Claude reviews feel and collision against `?map`.
- **B. Places and people:** door prompts, real actions, Quanny conversation + `approachQuannyAtMarket`, buying at Lil Jay's, run-in and retreat.
- **C. Homes and saves:** Reservoir Homes with the three attached targets, save/reload with ids, migration note.
Earlier review means fewer rewrites. Don't start C before A is reviewed.

## Ask Claude (in the PR, by id) when you need
A door moved, a wall fixed, a storefront turned into a place (`locationId`), a new NPC spot, another house attached/detached, or a visual change. Don't edit `src/strip/**`, `public/assets/**`, `art/**`, `src/board/**`.

## Definition of done
Outcome above holds on a phone-size browser; tests green with real command output in the PR; save impact stated; "ready for Claude review/merge"; no self-merge.
