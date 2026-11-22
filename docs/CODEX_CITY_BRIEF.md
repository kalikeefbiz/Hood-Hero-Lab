# Codex brief: make the Reservoir playable

Read `AGENTS.md` section 00 first. The old board is frozen; the game is now played in the walkable Reservoir (`strip.html`, code in `src/strip/`). Claude owns how it looks and where things are. You own making it play.

## What exists
- Five walkable streets, north to south: Dirty Money Dr, Big Mouth Blvd, Lil Bit Lane (Lil Jay's), Blocc Boy Blvd, No Refund Rd, linked by Kirkwood St. Layout: `docs/RESERVOIR_LAYOUT.md`.
- `src/strip/cityMap.ts` — **your contract**: `WALLS` (building footprints), `FENCES`, `WALK_BOUNDS`, `DOORS` (game locations with `locationId`), `STOREFRONTS` and `HOUSES` (scenery, `locationId: null`), `NPC_SPOTS` (Quanny at Lil Jay's), `PLAYER_START`. Open `strip.html?map` to see it drawn over the city.
- `window.__strip` exposes `scene`, `camera`, `controls`, `setMode`. Quanny is rigged with walk/run/idle clips (`public/assets/models/characters/quanny*.glb`).
- Your prototype on `codex/immersive-city-prototype` (PR #28) proved the flow: touch pad, collision, follow camera, Quanny's conversation, buying at Lil Jay's, run-in escalation, retreat, save/reload.

## The task
Port that flow onto this city in a new module `src/city/` that `src/strip/main.ts` starts (one small hook; ask Claude or keep the hook to a single import + call).
1. **Player**: spawn at `PLAYER_START`, move with the touch pad, collide with `WALLS`/`FENCES`, stay in `WALK_BOUNDS`. Follow camera (Claude can tune the look after).
2. **Places**: entering a `DOORS` radius offers that location's actions from the engine (`placeActions` / `LocationDef.links` data), the same rules the board used. No menu shortcuts (AGENTS.md section 0).
3. **People**: Quanny at his `NPC_SPOTS` entry runs his existing conversation and the `approachQuannyAtMarket` flow.
4. **Purchases, the run-in, retreat** as in PR #28.
5. **Saves**: use the existing save slot and engine state. Do **not** rename the save slot (PR #28 did; don't carry that over). Position in the city may be saved as nearest door / street.
6. **Tests**: Playwright on 390x844 (Chromium + WebKit): start, walk to Lil Jay's, buy, talk to Quanny, run-in, save/reload. `npm test`, `npm run build` green.

## Rules
- Don't edit `src/strip/**`, `public/assets/**`, `art/**`, `src/board/**`. If you need a door moved, a wall fixed, a storefront made a place, or an NPC spot, say so in the PR by id and Claude updates `cityMap.ts`.
- `reservoir.homes` is not assigned to a house yet; propose which in the PR.
- Performance: no per-frame allocation; collision against ~25 rects is fine as a plain loop.
- PR to Lab main, "ready for Claude review/merge", don't self-merge.
