# Gemini brief: the living-block simulation

Read `AGENTS.md` section 00, `docs/AI_WORKFLOW.md`, `docs/RESERVOIR_MAP.md`. Your One Living Block design is the right shape (headless sim first, rigs second). Your code is not in the repo yet. Step one is getting it reviewable.

## Step 1: open a draft PR (branch `gemini/living-block`, target Lab main)
Only `src/sim/**`, `src/render/AvatarAdapter.ts`, tests for them, and a short doc. No edits to other folders. Say how to run its self-tests on a phone-size screen.

## Fix before it can merge
1. **Use the real map.** Generate nodes from `src/strip/cityMap.ts` by import or script. Do not hard-code coordinates. Homes use the ids `res-home-01..16` (not `house_dark_n_*`); places use `locationId`.
2. **Use the real ids.** Factions are `angels | backstreet | blocks | blips | muds` (`src/core/GameState.ts`), not `blocc_boys`. Characters use canonical ids (`quanny`). Mr. Lewis and every other canonical person come from the engine's character records.
3. **One clock.** The engine counts days. Your sim owns only time of day within the engine's current day, and takes the day from the engine. Don't keep a second `dayCount`.
4. **Relationships stay in the engine** (`src/systems/Relationships.ts`, `NPCDecisionAI.ts`, `StreetLife.ts`, `src/board/presence.ts`). Read them through a small adapter and write changes back through it. Your matrix may exist only as a cache of those values. If two systems disagree about who likes whom, the game breaks; one source of truth.
5. **Saves:** put your snapshot inside the existing save slot via the persistence layer (ask Codex for the hook), versioned, with a test that an old save loads with no sim data.
6. **Determinism:** seeded random only, no `Date.now()` or `Math.random()` in `src/sim/**`.
7. **Smooth on a phone:** if the sim ticks at 20 Hz, interpolate positions in the render at the screen's frame rate. Off-view districts at 1 Hz is good. Budget: sim plus rigs under ~3 ms/frame on an iPhone.
8. **Dev inspector** loads only with `?dev`, never in the normal bundle, and never sits under the HUD or bottom nav.

## What Claude will give you
`src/strip/navMap.ts`: sidewalk spine nodes, crosswalks, door/porch nodes and portals for all five streets plus Kirkwood, generated from the map and checked on the overlay. You consume it; you don't author geometry. Tell me what shape you want it in (one paragraph) and I'll produce it.

## What Codex will give you
The player's position/faction/disturbance flags from `src/city/**`, and the save hook. Don't wire these into `src/strip/main.ts` yourself; Codex has the single hook.

## Done means
Headless tests green in Node (no WebGL), a phone-size run with 5 NPCs on Lil Bit Lane holding frame rate, and a note of what you measured and on what device.
