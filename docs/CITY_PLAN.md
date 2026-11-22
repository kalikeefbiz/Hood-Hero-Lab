# Building the city block by block: plan and review of PR #28

> **CURRENT OWNERSHIP UPDATE — 2026-11-22:** `AGENTS.md` section **00A** is authoritative. Claude owns world/map/render presentation; Codex owns gameplay engine and headless location APIs; Gemini owns independently developed NPC world simulation/navigation/presence (no repo write access yet). **Player controls, movement and camera-follow ownership remain unassigned.** Earlier tables or proposals assigning `src/city/**` or movement to Claude/Codex are historical and superseded. `docs/CODEX_CITY_BRIEF.md` has been rewritten accordingly. The five-street Reservoir direction and save-compatibility rules remain active.

Decided 2026-11-20 with the owner. Claude owns this plan and the world it builds. Codex owns rules, movement rules, content and the data behind them.

## The decision
Grow the new city **beside** the old strategy board and share the same game engine. Do not merge new on top of old, and do not restart the game. Retire the old board one hood at a time, only after the new city covers that hood.

```
        game engine (rules, saves, characters, location ids)  <- Codex, unchanged
             /                                   \
   old board (src/board)                   new city (src/city)  <- Claude
   stays playable until replaced           built block by block
```

## What the prototype (PR #28) proved
It walks the **old board's** Reservoir strip, not the new one. It proves the *flow* works end to end on phones: touch pad, collision, following camera, Quanny's conversation, buying at Lil Jay's, the staged run-in, retreat, save and reload. That flow is the valuable part. The geometry it walks on is not.

## Compatibility review
**Keep (move into the new city):**
- The flow in `src/ui/App.tsx`: City entry, `moveTo` on arrival, `performActionAt` for purchases, `respondEncounter` for replies, spatial range checks.
- `approachQuannyAtMarket` in `src/systems/Danger.ts`. It is an ordinary engine command using the normal scene lifecycle. Codex's file, review and merge it on its own.
- Collision as plain data (`reservoirWalk.ts` idea), but authored per block instead of derived from old lots.
- `StreetControls.tsx` touch pad, and the Playwright acceptance specs and unit tests.
- The strip-only render settings (short far plane, 1x pixel ratio) as the starting performance budget.

**Do not merge:**
- The save-slot rename in `SaveSystem.ts` (it would orphan every existing Lab save). Playtest builds must use `VITE_SAVE_SUFFIX` instead.
- The `street` mode threaded through `BoardRenderer.ts`. The renderer is already ~3,000 lines, and the new city gets its own small controller instead of more flags in it.
- The camera and bounds tuned to the old board's proportions and exaggerated footprints.

**Gaps the prototype itself lists** (these are my work in the new city): authored walkable surfaces, camera occlusion, building scale vs characters, stable NPC placement, device profiling.

## Architecture rules for the new city
1. **Engine stays presentation-free.** No camera, renderer or coordinates in game state. Position is `placeId` (+ optional slot), as today. Both views read the same state, so saves keep working.
2. **A block is data**: building list, props, lamps, spawn points, NPC slots, walkable polygons, and one interaction point per door that carries a location id. The Reservoir strip becomes block 1 (`src/strip/layout.ts` is the seed).
3. **Stream by block.** Only the block you stand on plus neighbours are loaded. Budgets from `art/strip/README.md` apply per block.
4. **One hood at a time.** A hood switches to the new city when it matches the old board's content and passes the mobile checks.
5. **Stable location ids** are the contract between Claude and Codex.

## Owner decisions (2026-11-20, supersede anything below)
- The Reservoir is **4 to 6 streets**, not one. The strip is only the proof of quality. Hood order: **Reservoir, Southside, Eastside, Northside, Downtown**.
- **The old board is frozen.** No fixes, features or content go into it. It keeps holding the game: engine, saves, characters, rules. Only bug fixes that stop saves or the game from working are allowed.
- A hood is done when **everything in the game is playable there**: locations, NPCs, player interactions, crime locations, shops, encounters. Then the next hood starts.
- Roles are being restructured around this (proposal below, pending owner approval before `AGENTS.md` changes).

## Phases
1. **Reservoir vertical slice** (next): walkable strip in the new city, Quanny, Lil Jay's, purchase, conversation, run-in, retreat, save/reload. Port the flow from PR #28 on the new strip. Gate: iPhone test.
2. **Finish the Reservoir**: street by street (4 to 6), each with authored collision, camera occlusion, NPCs, shops, crime locations and every player interaction the game has. Done when all of it is playable.
3. **Southside, Eastside, Northside, Downtown**, in that order, same method.
4. **Retire the old board's map view** when all five hoods are covered. The engine and saves stay.

## Who does what
| Claude | Codex |
|---|---|
| `src/city/`, blocks, buildings, characters, camera, controls UI, collision data, perf | Engine rules, commands like `approachQuannyAtMarket`, content, tests of rules |
| Reviews and ports the PR #28 flow | Requests places/people by location id; does not edit `src/city/**` or `public/assets/**` |

## Proposed role restructure (not yet in AGENTS.md)
- **Claude owns `src/city/**`**: streets, buildings, props, characters, camera, controls UI, collision, location doors and NPC placement, streaming and performance. Also decides where each game feature physically happens in the city.
- **Codex owns the engine and content**: rules, commands, encounters, dialogue, economy, tests of rules. For each new street Codex hands Claude data (location ids, NPCs, actions at each place); Claude puts it on the street.
- **Old board (`src/board/**`) is frozen** for both.
- **Per-street loop**: owner supplies art and intent, Claude builds the street, Codex supplies the game data, Claude wires it, both test it on a phone, owner plays it, merge.
- `AGENTS.md` rule 0 ("decide where it happens on the board") would be rewritten to point at the city, once approved.

## Open items
- Physical iPhone performance is unverified for both the strip and the prototype. First gate of phase 1.

## Split update (owner, 2026-11-22; supersedes "Who does what" above)
Claude: the look and the map (`src/strip/**`, `cityMap.ts`, assets, art). Codex: all gameplay wiring in the city (`src/city/**`) plus engine and content. The map file is the handshake. Brief for Codex: `docs/CODEX_CITY_BRIEF.md`.
