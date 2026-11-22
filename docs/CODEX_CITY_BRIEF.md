# Codex City brief — current gameplay-only scope (2026-11-22)

> **Supersedes the previous movement/touch-control/camera/checkpoint brief.** Read `AGENTS.md` sections 00 and 00A and `docs/RESERVOIR_CANON.md` first. The prior plan assigning player movement, walking, input, collision and camera-follow to Codex is **revoked until the owner explicitly assigns those systems**.

**Repository:** `kalikeefbiz/Hood-Hero-Lab` only. Never modify the frozen `kalikeefbiz/Hood-Hero` repository or `src/board/**`.

## Implemented — PR #51
Codex's `codex/reservoir-gameplay-wiring` PR #51 connects **all eight existing Reservoir location IDs** in Claude's `src/strip/cityMap.ts` to actual game rules through the headless API in `src/city/LocationInteractions.ts`. Its report `docs/RESERVOIR_GAMEPLAY_WIRING.md` specifies verified actions, limits, remaining map/house assignments, Gemini contract and test results. **Review this PR before giving additional tasks; those files are on its branch until merged.** Don't duplicate this implementation.

## Current integration sequence
1. **Claude** reviews PR #51 for compatibility. If clean, merges it. Claude then creates a separate presentation PR with physical location anchors and visual display of the **existing** API outputs in `src/strip/**`; no new gameplay mechanics.
2. **Gemini** continues **independent** NPC simulation experiments; no repo write access yet. Its eventual world host supplies validated NPC co-presence (`peopleHere`) and actions through the existing engine. No parallel economy, relationship truth, save slot, renderer or invented location map.
3. **Codex** addresses confirmed defects in its gameplay API and future owner-approved gameplay-only assignments in `src/city/**`, `src/systems/**`, `src/content/**` and `src/core/**`. It should not independently start building movement or AI.

## Map and interaction contract
Claude owns `src/strip/cityMap.ts`, including `DOORS`, `HOUSES`, `NPC_SPOTS`, `WALLS`, `FENCES` and other spatial data. Codex can read this map but must not edit Claude-owned files. Established IDs include `reservoir.lil-jays`, `reservoir.pawn`, `reservoir.laundry`, `reservoir.warehouse`, `reservoir.lot-court`, `reservoir.boarded-house`, `reservoir.water-tower` and `reservoir.homes`.

The production host must pass **verified `peopleHere`** to the API for NPC-specific actions and encounters. Do **not** assume a character is present just because there is a static map spot or an earlier narrative association. Until Gemini integrates, Claude may use **explicit, isolated preview fixtures** for presence and developer-only location selection in throwaway state. Those fixtures are not authoritative world state and cannot silently modify real saves.

A visible building is only a gameplay destination when it maps to an approved `locationId` with real engine-backed actions. Other approved shops remain scenery/NPC destinations until authentic gameplay is implemented. Never add fake menu buttons or rewrite economic rules to make a storefront seem interactive.

## Strict exclusions until owner assignment
- Player walk/run/sprint movement, joystick/touch controls, collision controller or input.
- Camera-follow, camera-driven board, zoomed-out playable alternative, `src/city3d/**` revival.
- NPC schedules, autonomous decisions, pathfinding, locomotion or Three.js/GLB renderer.
- Unapproved new buildings, dialogue, businesses, player-only save keys or faction models.
- Edits to `src/strip/**`, `public/assets/**`, `art/**`, frozen `src/board/**`.

## Workflow
Continue to follow `AGENTS.md` branch, PR, code ownership, save compatibility and test requirements. Present actual command/test results. Do not claim the entire five-street world is playable because the headless location API is complete. Report remaining gaps honestly. **Do not self-merge.** Player movement and controls will receive their own assignment later.
