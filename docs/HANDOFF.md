# Hood Hero Lab: handoff (read this first in a new chat)

Last updated: 2026-11-20. Update the "Where we are" and "Next" sections at the end of every task.

## Ground rules
- Work only in `kalikeefbiz/Hood-Hero-Lab`. Only the bigger map matters (official on Lab `main`; `/next/` is retired). **Never touch production `kalikeefbiz/Hood-Hero`.**
- Mobile-first. The owner usually works from a phone.
- Owners: **Claude** = board, 3D, UI, art pipeline, reviews and merges Codex PRs. **Codex** = systems, movement, content. Claude did a cross-owner text pass (PR #29).
- Mega is "Cuzzo" to the player; everyone else says Mega.
- Player-facing text: natural Stixx City voice, NPCs never explain mechanics, no internal terms.
- Owner's PC rules: never change anything on their PC unless they say so; no downloads or wandering through folders; never run delete commands there (stop and report instead).

## Where we are
- Text and presentation pass: done (PR #29).
- Dev-only feedback tool: done. Flag `VITE_DEV_FEEDBACK=1`, code in `src/devtools/feedback/` (README there has removal steps). Known bug: the "On screen" excerpt in issues arrives empty.
- Flacco expression portraits: done (PR #33).
- Season 1 plan: `docs/design/SEASON_1.md` (Chains Days 1-7, rumor Day 8, substation Day 9, fallout Days 10-20, studio with Cuzzo Day 21 still to confirm, Flacco's push Days 22-28). Days 10-20 content needs an owner decision.
- **Street strip: done and deployed** (PR #36). Preview: https://kalikeefbiz.github.io/Hood-Hero-Lab/strip.html. Pipeline and budgets: `art/strip/README.md`. Whole strip is ~15k tris, ~13 MB. Not yet tested on a real iPhone.
- Codex prototype `codex/immersive-city-prototype` (PR #28): has walkable movement/controls. **Do not merge as-is**: it renames the save slot.

## Next: wire the strip into the walkable prototype (Codex owns this)
Brief for Codex:
1. Start from `origin/main`, not from PR #28's branch wholesale. Reuse its movement and controls; leave out the save-slot rename.
2. Load the strip from `src/strip/layout.ts` (`STRIP_ASSETS`, `START`, `BOUNDS`, `STREET_LAMPS`). Keep the KTX2 + meshopt loaders from `src/strip/main.ts` (transcoder path `basis/`). Do not re-export or recompress the GLBs.
3. Collision: use the street bounds and simple building footprints; no mesh-accurate collision needed.
4. Keep Quanny as the NPC at x 2.7, z 1.5. Interaction opens the existing encounter flow; do not add dialogue that explains mechanics.
5. Keep the Street level / Overview toggle and Dusk / Night modes working.
6. Performance: hold the budgets above; no extra real-time shadows beyond what the strip preview uses; test with Playwright chromium-mobile.
7. Open a PR to `main`. Claude reviews (3D and visuals) and merges. Include before/after screenshots.

## Workflow reference
- PR flow: worktree from `origin/main`, branch, `gh api` to open the PR, merge with `merge_method=merge`. Use explicit refspec fetch. I cannot delete branches; the owner deletes old ones (`claude/city-expansion`, `claude/official-city`) on github.com.
- Deploy: only from `main` via `deploy-lab.yml`; dispatch with `gh api -X POST repos/kalikeefbiz/Hood-Hero-Lab/actions/workflows/deploy-lab.yml/dispatches -f ref=main`.
- Tests: Vitest (453 passing), Playwright chromium-mobile (WebKit not available in the sandbox). 18 browser tests fail identically on unmodified `main`; they need their own cleanup pass.
- Art pipeline: headless Blender (`pip install bpy`), scripts in `art/strip/scripts/`, texture generation was inline Python and is not saved as a script yet.
- Art workflow going forward: owner draws a straight-on front view plus one angled view for each building, Claude builds it in Blender. Meshy is for organic things (characters, trees, trash bags, cars).

## After the wiring
1. One rigged, animated character (player or Quanny) so the street has life.
2. More strips with the same pipeline.
3. Optional cleanup: feedback-tool bug, the 18 old browser tests, a scheduled task that turns feedback issues into PRs (no auto-merge).
