# Codex City brief — current gameplay-only scope (2026-11-22)

> **Supersedes the previous movement/touch-control/camera/checkpoint brief.** Read `AGENTS.md` sections 00 and 00A and `docs/RESERVOIR_CANON.md` first. The prior plan assigning player movement, walking, input, collision and camera-follow to Codex is **revoked because the owner assigned those systems to Claude on 2026-11-22**.

**Repository:** `kalikeefbiz/Hood-Hero-Lab` only. Never modify the frozen `kalikeefbiz/Hood-Hero` repository or `src/board/**`.

## Implemented — PR #51
Codex's PR #51 merged into `main` as `dd54394`. It connects **all eight existing Reservoir location IDs** in Claude's `src/strip/cityMap.ts` to game rules through the headless API in `src/city/LocationInteractions.ts`. Its report `docs/RESERVOIR_GAMEPLAY_WIRING.md` specifies verified actions, limits, remaining map/house assignments, the Gemini contract and test results. Use the merged API and report for integration.

## Current integration sequence
1. **Claude** completed PR #51 review and merge. Claude owns the separate presentation work in `src/strip/**`, including physical location anchors and display of the existing API outputs.
2. **Gemini** works through PRs in `src/sim/**` and `src/render/AvatarAdapter.ts`, with approved character deliveries in `art/incoming/<id>/` under `AGENTS.md` 00C. Gemini does not self-merge. The simulation determines NPC co-presence, and the walkable host passes verified `peopleHere` to the location API. The existing engine owns time, economy, relationship outcomes and saves. Claude owns the renderer and authored map.
3. **Claude** owns the future separate player-controller implementation in `src/strip/**` (touch movement, collisions, camera follow and spatial interaction range) with a temporary avatar. This does not change Codex's headless gameplay API or require protagonist integration.
4. **Codex** addresses confirmed defects in its gameplay API and future owner-approved gameplay-only assignments in `src/city/**`, `src/systems/**`, `src/content/**` and `src/core/**`. It should not independently start building movement or AI.

## Map and interaction contract
Claude owns `src/strip/cityMap.ts`, including `DOORS`, `HOUSES`, `NPC_SPOTS`, `WALLS`, `FENCES` and other spatial data. Codex can read this map but must not edit Claude-owned files. Established IDs include `reservoir.lil-jays`, `reservoir.pawn`, `reservoir.laundry`, `reservoir.warehouse`, `reservoir.lot-court`, `reservoir.boarded-house`, `reservoir.water-tower` and `reservoir.homes`.

The production host must pass **verified `peopleHere`** to the API for NPC-specific actions and encounters. Do **not** assume a character is present just because there is a static map spot or an earlier narrative association. Until Gemini integrates, Claude may use **explicit, isolated preview fixtures** for presence and developer-only location selection in throwaway state. Those fixtures are not authoritative world state and cannot silently modify real saves.

A visible building is only a gameplay destination when it maps to an approved `locationId` with real engine-backed actions. Other approved shops remain scenery/NPC destinations until authentic gameplay is implemented. Never add fake menu buttons or rewrite economic rules to make a storefront seem interactive.

## Strict Codex exclusions
- Player walk/run/sprint movement, joystick/touch controls, collision controller or input (**Claude-owned**).
- Camera-follow (**Claude-owned**), camera-driven board, zoomed-out playable alternative, `src/city3d/**` revival.
- NPC schedules, autonomous decisions, pathfinding, locomotion or Three.js/GLB renderer.
- Unapproved new buildings, dialogue, businesses, player-only save keys or faction models.
- Edits to `src/strip/**`, `public/assets/**`, `art/**`, frozen `src/board/**`.

## Workflow
Follow `AGENTS.md` for branch, PR, code ownership and test requirements. Follow 00B for disposable Lab saves, report any reset and keep the start-past-the-opening flow available. Present actual command and test results and report remaining integration gaps. **Do not self-merge.** Player movement and controls belong to Claude.
