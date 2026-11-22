# Hood Hero Lab: handoff (read this first in a new chat)

Last updated: 2026-11-20. Update the "Where we are" and "Next" sections at the end of every task.

## Ground rules
- Work only in `kalikeefbiz/Hood-Hero-Lab`. Only the bigger map matters (official on Lab `main`; `/next/` is retired). **Never touch production `kalikeefbiz/Hood-Hero`.**
- Mobile-first. The owner usually works from a phone.
- Owners: **Claude** = board, 3D, UI, art pipeline, **the street strip and its growth into the full city** (owner decision 2026-11-20: the strip is presentation, so Claude stays responsible for it), reviews and merges Codex PRs. **Codex** = systems, movement rules, content; it supplies game data and interaction requests, Claude wires them into the strip. Claude did a cross-owner text pass (PR #29).
- Mega is "Cuzzo" to the player; everyone else says Mega.
- Player-facing text: natural Stixx City voice, NPCs never explain mechanics, no internal terms.
- Owner's PC rules: never change anything on their PC unless they say so; no downloads or wandering through folders; never run delete commands there (stop and report instead).

## Where we are
- Text and presentation pass: done (PR #29).
- Dev-only feedback tool: done. Flag `VITE_DEV_FEEDBACK=1`, code in `src/devtools/feedback/` (README there has removal steps). Known bug: the "On screen" excerpt in issues arrives empty.
- Flacco expression portraits: done (PR #33).
- Season 1 plan: `docs/design/SEASON_1.md` (Chains Days 1-7, rumor Day 8, substation Day 9, fallout Days 10-20, studio with Cuzzo Day 21 still to confirm, Flacco's push Days 22-28). Days 10-20 content needs an owner decision.
- **Street strip: done and deployed** (PR #36). Quanny now stands outside Lil Jay's with a hand-animated street idle (PR after #38). Preview: https://kalikeefbiz.github.io/Hood-Hero-Lab/strip.html. Pipeline and budgets: `art/strip/README.md`. Whole strip is ~15k tris, ~13 MB. Not yet tested on a real iPhone.
- Codex prototype `codex/immersive-city-prototype` (PR #28): walkable Reservoir on the OLD board, flow proven. **Do not merge as-is** (renames the save slot, adds street mode into BoardRenderer). Reviewed in `docs/CITY_PLAN.md`: port the flow into a new `src/city/` beside the old board.

- **Blocc Boy Boulevard built** (street 2): north side complete (Barber Shop, Liquor & Deli, Beauty Supply, Pawn); Laundry, Auto & Tires and Westside Warehouse built, not yet placed. `art/reservoir/README.md`, `docs/RESERVOIR_LAYOUT.md`.

- **Big Mouth Blvd and No Refund Road built**: water tower (west end), boarded house, Lot Court, Warehouse and Auto & Tires placed. Street grid in `docs/RESERVOIR_LAYOUT.md`.

- **Dirty Money Drive built**: all five Reservoir streets now stand (Dirty Money, Big Mouth, Lil Bit Lane, Blocc Boy, No Refund, north to south). Reservoir Laundry placed.

## Next: grow the strip into the city (Claude owns this)
Plan, architecture and the PR #28 review: **`docs/CITY_PLAN.md`** (new city beside the old board, shared engine, retire old hoods one at a time). Phase 1 = Reservoir vertical slice.
The owner's plan (2026-11-20): build the Reservoir strip up slowly, block by block, until it is a complete city. Same split as before: Claude builds and presents the strip (layout, buildings, characters, camera, movement presentation); Codex owns the rules and content behind it and requests places or people in its PRs.
1. Characters on the strip come from `STRIP_NPCS` in `src/strip/layout.ts` (`id`, model, looping `clip`). Quanny: `quanny.glb` + `quanny-idle.glb`; walk and run clips are also in `public/assets/models/characters/`.
2. Walkable movement: port the flow from PR #28 into `src/city/` per `docs/CITY_PLAN.md` (no save-slot rename, no street mode in BoardRenderer). Claude does the wiring.
3. Interaction with Quanny opens the existing encounter flow (Codex supplies it as data); no dialogue that explains mechanics.
4. Next blocks: owner draws front + angled views per building, Claude builds them in Blender (`art/strip/scripts/`). Hold the budgets in `art/strip/README.md`.

## Workflow reference
- PR flow: worktree from `origin/main`, branch, `gh api` to open the PR, merge with `merge_method=merge`. Use explicit refspec fetch. I cannot delete branches; the owner deletes old ones (`claude/city-expansion`, `claude/official-city`) on github.com.
- Deploy: only from `main` via `deploy-lab.yml`; dispatch with `gh api -X POST repos/kalikeefbiz/Hood-Hero-Lab/actions/workflows/deploy-lab.yml/dispatches -f ref=main`.
- Tests: Vitest (453 passing), Playwright chromium-mobile (WebKit not available in the sandbox). 18 browser tests fail identically on unmodified `main`; they need their own cleanup pass.
- Art pipeline: headless Blender (`pip install bpy`), scripts in `art/strip/scripts/`, texture generation was inline Python and is not saved as a script yet.
- Art workflow going forward: owner draws a straight-on front view plus one angled view for each building, Claude builds it in Blender. Meshy is for organic things (characters, trees, trash bags, cars).

## After the wiring
1. ~~One rigged, animated character so the street has life~~ (Quanny, done).
2. More strips with the same pipeline.
3. Optional cleanup: feedback-tool bug, the 18 old browser tests, a scheduled task that turns feedback issues into PRs (no auto-merge).
