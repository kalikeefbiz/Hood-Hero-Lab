# Early-game Chains buyback regression

## Diagnosis

Investigated from Lab main `753798999cac1f9ddf428aa5368077c1e8a58184` on
`codex/early-game-buyback-loop`. PR #22 (`9d9b327`) stays separate and unmerged.

This is a gameplay race exposed by a test assumption predating City travel.
`actAt` waits for `walkTo`, then calls `act` from the render that started the
walk. Previously, End day remained enabled during that wait. Advancing the day
and then completing the walk let `performActionAt` overwrite the new day with
its captured old state. The gig's daily limit correctly disabled the next gig,
but on the wrong day. Removing that limit or relaxing AP/progression requirements
would conceal the corruption.

On untouched main, the original Chromium mobile case failed at line 93 on the
disabled gig, with `DAY 01` and “Today's local gig is complete. More opportunities
tomorrow.” A separate real-browser probe recorded this sequence:

| Step | Day | AP | Clean cash | Last gig | Location |
| --- | --- | --- | --- | --- | --- |
| Before gig | 1 | 2 | $125 | none | home fallback |
| Immediately after gig tap (walking) | 1 | 2 | $125 | none | home fallback |
| Immediately after End day | 2 | 2 | $107 | none | home fallback |
| Walk completion | **1** | **1** | **$163** | **1** | downtown.docks |

An initial baseline attempt during concurrent unit work failed earlier in the
input-guard-aware opening-dialog helper. With unit work finished, the original
case reproduced the reported line-93 failure. The state probe independently
identifies the rollback, rather than inferring it from a timeout.

## Correction and boundaries

- Both City and ledger End day controls respect the existing travel `busy`
  state; the handler also rejects day advancement until the walk resolves.
- `act` reads the current game state when a delayed City command resolves and
  uses existing transactional validation, including revalidation after arrival.
- Mobile helpers wait for acknowledged action/day changes. The buyback case
  explicitly chooses the no-promise opening route, records real work at the
  docks, tests the daily gig limit, pays the actual demand with valid AP, reloads,
  earns again and retains its existing Flacco paid-work/compensation checks.
- Fresh and migrated-v9 unit campaigns exercise insufficient funds, AP limits,
  the shared daily gig limit at two locations, clean income, property return,
  progression and save/reload continuity through existing APIs.

No balance, formal-employment gate, progression requirement, persistent ID,
schema, save key, migration, narrative outcome, renderer, asset, layout, production
repository or deployment configuration changes. Lawful gigs do not require the
criminal trapping lesson. No menu action shortcuts are added. Cross-owner
changes are limited to application action timing and the `BoardControls.busy`
prop/disabled condition; Claude review is required before integration.

## Validation

Browser runs use
the lockfile Playwright 1.64.1, Chromium 156.0.8078.4 (1248) and WebKit 27.2 (2370),
the repository's iPhone 13 profiles and default DPR 3. No input guard or gameplay
assertion is disabled. WebKit's missing host libraries were downloaded from the
configured official Debian snapshot and extracted locally; their dependencies
were linked into the user-owned browser bundles. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`
only bypasses the host library-cache probe; the actual browser and assertions run.

### Browser results on this branch

- `npm run test:e2e -- tests/mobile.spec.ts --project=chromium-mobile --workers=1 --reporter=list`: **3/3 passed** (2.2 min).
- `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run test:e2e -- tests/mobile.spec.ts tests/board.spec.ts tests/mobile-baseline.spec.ts --project=webkit-mobile --grep 'buyback resolves|phone gameplay|mobile city and new game|the player lives on the board|lab saves never|leaving the city mid-walk' --workers=1 --reporter=list`: **all 6 current mobile/board cases passed**, plus 2/3 historical-copy probes (8 passed, 1 failed overall; 5.9 min).

For that exploratory comparison only, `git show origin/main:tests/mobile.spec.ts > tests/mobile-baseline.spec.ts` created a temporary unchanged copy of main's mobile tests; it was removed after the run. Its old buyback case passed the formerly blocked second gig, reached day 3, and then timed out in `storyAction`: it opens the storyline before the preceding asynchronous Reach out finishes. Contact completion returns to Actions and detaches the conversation. This independently confirms the second outdated synchronous assumption addressed by the revised action helper. The other two historical-copy cases passed. The temporary failed test is not a claim of a baseline failure on main or a green exploratory batch.

The committed buyback case passed in both engines at the original 90-second timeout, including exact day/AP/cash, physical gig location, work introduction, daily limit, property return, reload, post-buyback wages and the existing Flacco compensation checks. The three board cases passed in WebKit, including the interrupted-walk regression. No test is skipped or weakened. The full browser suite and physical iPhone Safari were not run.

### Unit, build and compatibility results

- `npm test -- --maxWorkers=2`: **406/406 passed**, 24 files, on the final branch (58.97 s).
- `npm run build`: **passed** (TypeScript and Vite); existing bundle-size advisory remains.
- `git diff origin/main..HEAD --check` and the final worktree diff check: **passed**.
- Fetched and integrated `origin/main` again before submission: already current at `7537989`.
- PR #22 compatibility: temporary detached worktree at source commit `37db0f3`, then `git merge --no-commit --no-ff origin/codex/player-information` (`9d9b327`). **Clean merge, no conflicts**; neither remote branch nor PR #22 was changed. The feature PR contains no PR #22 changes.
- On that combined tree, `npm test -- src/tests/playerInformation.test.ts src/tests/earlyGameBuyback.test.ts --maxWorkers=2`: **15/15 passed**; `npm run build`: **passed**.
- On the combined tree, `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 PLAYWRIGHT_PORT=4175 npm run test:e2e -- tests/player-information.spec.ts tests/mobile.spec.ts --grep 'City disclosure|all navigation paths|buyback resolves' --workers=1 --reporter=list`: **8/8 passed** (4.4 min): buyback plus all three PR #22 disclosure cases in each engine, including 390px and 320px discovery/reload and navigation checks.

Ready for Claude review/merge. No further board wiring is needed. This work and
PR #22 remain unmerged; no public deployment is claimed.
