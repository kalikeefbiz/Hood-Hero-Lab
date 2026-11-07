# Codebase audit: clutter, dead code and touch bugs (6 Nov 2026)

**Scope:**
- Lab `main` at `b63eaab`, after GOAL 012 and the inventory UI.
- Board files were also checked on `claude/city-expansion` (the `/next/` preview), which has diverged from `main` in ways that matter for touch.

**Nothing was changed.** This is a report; each item says who should own the fix.

**How it was measured:**
- Static scan with `knip` for unused files and exports.
- Asset and CSS reference checks.
- Timing of the main per-tap computations.
- An iPhone 13 viewport scan (390 × 664) of seven screens. The scan checked every visible control for size under 44 px, for being covered by another element at its centre, and for being replaced in the DOM while idle.

## 1. Touch bugs: likely causes, ranked

### T1. Taps during a walk are silently ignored (high)
`actAt`, `act` and `goHere` in `src/ui/App.tsx` return early while `busy` is set. `busy` covers the whole walk to a place, which takes 0.8 to 2.6 s and longer on the bigger map.

Now that every action happens in the city, almost every action starts with a walk. A second tap during that time does nothing and gives no feedback. To the player, that reads as "my tap didn't register".

**Fix (Claude, UI):** while walking, show that the walk is in progress (dim the tiles, show a "walking…" line). Then either queue the tapped action to run on arrival, or say why it was ignored.

### T2. The input guard drops taps after a freeze (high, and `main` lags behind `/next/`)
`src/ui/inputGuard.ts` deliberately discards taps that were queued during a main-thread stall. That stops actions firing late, which was the original bug. The cost is that the taps are lost.

On `main`, `STALL_MS` is **700 ms**, with no escape valve and no device-timestamp check. The improved guard has a 1 s threshold, drops at most 3 taps in a row and then lets the next one through, and checks the touch's own timestamp. It **only exists on `claude/city-expansion`**. So `main` currently drops more taps than `/next/` does.

**Fix (Claude):** merge the expansion branch, or port `inputGuard.ts` from it now. Longer term, reduce the stalls themselves (T3).

### T3. Board taps fail if a frame freezes mid-tap (medium)
`BoardRenderer.bindInput` only counts a tap on the map if the finger moved under 10 px **and** lifted within **500 ms**, timed with `performance.now()`. If the board stalls during the press (shadow bake, model upload, GC), the 500 ms passes and the tap on a person or place is dropped. A slow, deliberate tap is dropped too.

**Fix (Claude, board):**
- Raise the limit to around 700 ms.
- Measure the press with the pointer events' own `timeStamp` values, which the browser stamps when the touch happens, so a frame stall can't eat into it.
- Keep the 10 px movement limit.

### T4. Tap targets under 44 px (medium)
Found on every screen:

| Control | Size | Where |
|---|---|---|
| Hide details (×) | 30 × 30 | board panel |
| Save game / Load game | 34 × 44 | HUD |
| Your character | 34 × 44 | HUD |
| People on the board ("Talk to …") | 40–42 × 45 | board markers |
| Incident marker ("The Chains") | 40 × 40 | board |
| Back to the city | 40 × 40 | menu screens |
| Profile | 55 × 34 | person card |
| Talk · lesson, Walk there → | 99 × 40, 76 × 40 | person card |
| Skill rows (expand) | 326 × 21 | People tab |

Each screen had 5 to 16 controls under 44 px. Small targets next to each other mean fat-finger misses, which players report as "it didn't work".

**Fix (Claude, UI):** give these at least 44 × 44 hit areas. The visible art can stay small if padding makes up the hit area.

### T5. Long cards put the action below the fold (medium)
Cuzzo's person card measured **1,046 px tall** inside a **332 px** panel. "Talk terms with Cuzzo" sits about three panel-heights down, below the moves, the story card, street-life notes and gear. Players scroll inside a small panel over a draggable map, and drags that start on the map pan the city instead.

**Fix (Claude, UI):** put the card's main action (the deal, gear, the safe) first. Collapse secondary sections ("Street-life encounters", the story text) behind a tap. Consider letting the panel expand to near full height on swipe-up.

### T6. Double-tap zoom on rapid taps (low)
The viewport allows pinch zoom, and buttons don't set `touch-action: manipulation`. Quick repeated taps, such as the quantity +/− buttons, End day, or skip-visitor, can trigger Safari's double-tap zoom instead of a second tap.

**Fix (Claude):** add `button, [role=button], summary { touch-action: manipulation; }` globally. Pinch zoom on the page stays available.

### T7. Session summary covers place cards (low)
After an interrupted trapping session, the "Session ended" panel sits over the place card's action tiles until it's dismissed. Taps land on the summary instead of the tile. This was found while moving actions into the city.

**Fix (Claude/Codex):** dock the summary so it doesn't overlap the inspector, or auto-dismiss it once it has been read.

### Ruled out
- **Re-render churn:** no buttons were replaced in the DOM during 3 s of idling on any screen, so taps aren't lost to elements remounting mid-press.
- **Game logic per tap:**
  - `deriveBoardView`: 4.6 ms
  - `availableActions`: under 0.1 ms
  - autosave `serialize`: 0.2 ms, for a 40 KB save
  - load: 3.7 ms
  These are cheap even at about 3× slower on a phone. **Lag comes from the board's rendering and stalls, not the game logic.** Measure it on the phone with `?perf` (currently `/next/` only, see T2).
- **Stylesheet conflicts:** `style.css`, `art-direction.css` and `board.css` share only 8 selectors. They're not fighting.
- **Overlays:** the exchange feed and other overlays correctly use `pointer-events: none`. An apparent "button under the nav" turned out to be content scrolled out of the panel, so nothing actually overlaps.

## 2. Divergence: the biggest structural risk

`claude/city-expansion` has run beside `main` for days. It holds the bigger city, the El, the river, the place-lookup speed-up, context-loss recovery, the `?perf` readout, shadow batching **and the better input guard**. Every `main` merge has to be carried across by hand, and touch fixes made on one branch don't reach the other.

**Recommendation:** approve and merge the expansion as soon as the iPhone check allows. Until then, port `inputGuard.ts` to `main`.

## 3. Dead code (safe to delete)

| What | Where | Note |
|---|---|---|
| `partnerContribution` | `src/core/ActionEngine.ts` | never called |
| `drillEligible` | `src/systems/Skills.ts` | never called |
| `CHAIN_EVIDENCE`, `ANGELS_TRIO` | `src/ui/characterArt.ts` | never used |
| `zoneDescription` | `src/city3d/viewModel.ts` | never used |
| Connects-tab jump after a targeted action | `App.tsx`, `if (a.target && actionGroup === "Connects")` | unreachable since the Actions tab became information-only |
| `supportsWebGL` defined twice | `BoardRenderer.ts` and `ui/Board.tsx` | keep one |
| `runner-job-boost.webp` | `public/assets/actions/` | no action art points to it |
| `mega-pleased.webp`, `mega-upset.webp` | `public/assets/characters/mega/` | superseded by the chain/no-chain set |
| `el-underpass.glb` (144 KB) | `public/assets/models/` | unused on `/next/`; delete when the expansion merges |
| `prettier` | `package.json` devDependencies | no script uses it |
| `scripts/simulate-*.mjs`, `scripts/verify-*-live.mjs`, `rasterize-ui-texture.mjs` | `scripts/` | not wired to any npm script. Keep only if Codex still runs them by hand; otherwise delete or move to `scripts/archive/` |

`knip` also lists 28 exports and 18 types that are only used inside their own file. That's harmless and not worth churn. `basis_transcoder.js` is a false positive, because the board loads it at runtime.

**Owner:** the gameplay items (`partnerContribution`, `drillEligible`) are Codex's; the UI, art and board items are Claude's.

## 4. Clutter that slows everyone down

1. **Screenshots in the repo:**
   - `docs/` is 76 MB of a roughly 107 MB repository: `docs/screenshots` is 59 MB and `docs/review` 15 MB.
   - **6 of 23 browser specs rewrite files in `docs/` on every run**, so every local test run leaves dozens of modified PNGs that must be reverted by hand before committing. That's a constant source of noise and accidental commits.
   - **Fix:** tests write screenshots to `test-results/`, which Git ignores. Keep only a small, curated set of reference images in `docs/`, refreshed on purpose.
2. **Old reports in the top-level docs:**
   - 14 GOAL/milestone reports sit loose in `docs/` (`GOAL_002…008`, `M1_STATUS.md`, `CITY_MENU_RESTRUCTURE.md`), mixed with live references such as `STRATEGY_BOARD.md` and `ACTIONS_TO_CITY.md`.
   - **Fix:** move finished GOAL reports to `docs/archive/` and keep `docs/goals/` for current briefs.
3. **`src/ui/App.tsx` is 1,941 lines.** It holds every screen, the board wiring and the action flow, and it's where most merge conflicts between Codex and Claude land. Splitting it doesn't change behaviour, but it would help both agents:
   - one file per screen (City, People, Set, Wallet, Journal, Actions)
   - the board/inspector wiring in its own component
   This is low urgency; do it between GOALs, not during one.
4. **Unused CSS:**
   - About 30 class names in the three stylesheets are never referenced: `style.css` 12, `art-direction.css` 10, `board.css` 11. A few are false positives built at runtime (`kind-*`, `tile-*`).
   - Examples: `hub-layout`, `map-panel`, `map-key`, `screen-heading`, `today-moves`, `action-plate`, `map-legend`, `screen-city`, `day-start`.
   - Low priority; delete with the App split.
5. **Test retries hide taps that didn't work.** The `tapUntil` helper retries taps, and specs call it 51 times. It exists because taps were being dropped (T1–T3). Once those are fixed, new tests should use plain taps, so a dropped tap shows up as a test failure instead of being retried away.

## 5. Suggested order

1. **Now, small (Claude):**
   - T6 (`touch-action: manipulation`)
   - T4 (44 px hit areas)
   - T3 (board tap timing)
   - port the input guard to `main` (T2)
2. **Next (Claude):** T1 (feedback and queueing while walking), then T5 (card layout: main action first).
3. **When the owner approves `/next/`:** merge the expansion (section 2), then delete `el-underpass.glb`.
4. **Between GOALs:**
   - delete the dead code (section 3)
   - stop tests writing into `docs/` and archive old reports (section 4.1–4.2)
   - then the App split (section 4.3)

Real-device confirmation of T1–T3 is still needed: open `/next/?perf` on the iPhone, reproduce a missed tap, and screenshot the readout. It shows the worst stall and the number of dropped taps.
