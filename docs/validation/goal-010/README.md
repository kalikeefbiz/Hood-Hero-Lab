# GOAL 010 validation

This report distinguishes the complete suite from focused verification. Archived runner logs retain their output with trailing whitespace and line endings normalized for the repository. No test is disabled to produce a green result. Physical iPhone hardware is still an owner playtest after Claude review; these are iPhone 13 browser emulations.

## Environment and commands

- Debian 13 managed workspace, Node 24, two CPU cores of quota, local Vite production preview.
- Playwright Chromium and WebKit, iPhone 13 viewport/touch profiles. WebKit uses the repository-supported `WEBKIT_SOFTWARE_SCALE=1` option for software rendering.
- Missing WebKit shared libraries were downloaded/extracted into the workspace and linked into the local browser bundle. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` bypasses the library discovery check after actual browser launch was verified. It does not skip browser tests or assertions.
- `npm test`; `npm run build`; `npm run test:e2e -- --workers=2`; focused session, street journey, board/input-guard checks with one worker.
- Lab main baseline checkout: `/workspace/lab-baseline`, detached at `ac5c75435f885d5be2092ab477c7959c7257320f`, with its unchanged source and tests. The feature and baseline use separate preview ports and build directories.

## Unit and production validation

The final `npm test` run passed **302/302 tests across 17 files** in 64.15 seconds on code commit `87ddd704b42662403c1e0938e68905966a9e5859`, after fetching and integrating latest Lab main. See [the unit log](unit-tests.log). The complete unit/integration suite has 302 tests across 17 files. It includes eight-track boundaries, milestone locks, NPC seeds, integer buyer XP, genuine failures/successes, no cross-skill crime/sale awards, equipment ownership/equip/bonuses, real buyer economy, zero-sale sessions, location/AP/capacity gates, stop/pause/reload/stale cursors, grounded risk, migration and existing gameplay regressions.

The final `npm run build` passed TypeScript, Vite and build metadata generation; see [the build log](production-build.log). Vite reports the existing large-chunk notice; the goal does not change deployment configuration or split the board into another app.

## Focused simulation trajectories

One deterministic player strategy (seed 42) prioritizes real debt repayment and available supply, traps while eligible, uses lawful gigs/rest as fallback and advances the actual city. It retains market pressure, stress, custody, NPC changes and daily expenses. These are observations of this policy, not a promised income/progression curve or an optimal strategy.

| Horizon | Trapper XP | Rank | Actual buyer attempts | Campaign ended |
| --- | ---: | --- | ---: | --- |
| 30 days | 20.40 | Peon | 63 | No |
| 60 days | 20.40 | Peon | 63 | No |
| 180 days | 22.40 | Peon | 70 | No |
| 365 days | 25.10 | Peon | 76 | No |

Supply and risk constrain sustained trapping. Additional tests isolate high-rank economics from buyer probability and check future tier XP hooks without adding new merchandise.

## Browser validation and independent baseline

The complete in-progress diagnostic run (`npm run test:e2e -- --workers=2`) finished all **168 cases: 82 passed, 86 failed**, with no skipped cases. It preceded the final internal corrections and is not a claim about a clean full-suite run at the final commit. HTML report generation then exhausted disk space; the test runner had already printed all results. [Raw diagnostic log](candidate-full-suite.log), [exact 86 failure records](candidate-failures.json).

Untouched main was independently checked at `ac5c75435f885d5be2092ab477c7959c7257320f` with its own production build (schema 8). Source/tests/configuration remained unchanged (`git diff --exit-code -- src tests package.json package-lock.json playwright.config.ts`). The initial full-main attempt was interrupted after 10 passes, 9 failures and 2 interrupted cases; 139 were not run. The two interrupted cases are **not** baseline failures. [Initial raw log](main-initial-suite.log), [nine confirmed keys](main-initial-confirmed.json). Three of those confirmed failures overlap the candidate's original failures.

All remaining 71 original failing engine/case pairs were selected by exact test title and run on untouched main with two workers, separate ports, `--project=<engine> --grep=<exact title alternation> --reporter=list,json`:

| Main selection | Passed | Failed/timed out | Total |
| --- | ---: | ---: | ---: |
| Chromium iPhone 13 | 9 | 13 | 22 |
| WebKit iPhone 13 | 8 | 41 | 49 |

[Chromium cases/errors](main-chromium-mobile.json) · [Chromium raw log](main-chromium-mobile.log) · [WebKit cases/errors](main-webkit-mobile.json) · [WebKit raw log](main-webkit-mobile.log). This independently covers every one of the 74 original-case failures. New skill/session cases and the eight old street cases whose fixtures had to change for physical sessions are verified on the feature branch instead of claiming an unchanged-main counterpart. A case failing on both branches is case-level baseline evidence; the exact failing step can differ under rejected software-renderer taps, and both error records are retained. Earlier candidate failures were investigated rather than hidden: mid-session checkpoints now pause explicitly before asserting cursor equality; pause tests use a non-arrest buyer seed; older street fixtures finish real arrival conversations; custody uses an actual seeded arrest; navigation helpers assert destinations and retap when the existing input guard intentionally rejects stale input. The freeze regression still deliberately queues taps and requires them to be dropped.

See [implementation and iPhone playtest instructions](../../goals/GOAL_010_IMPLEMENTATION.md) for save behavior, integration details and the four Claude-owned board files.


## Final selected browser results

The latest completed result for each selected engine/case is **45 passed, 0 unresolved**. Only failed or unfinished cases were retried; completed passing checks, the unit suite, the production build and the main baseline were retained.

| Final selection | Chromium iPhone 13 | WebKit iPhone 13 | Total |
| --- | ---: | ---: | ---: |
| Skill/session, street journey and frozen-input checks | 14 passed | 14 passed | 28 passed |
| Original cases that passed on main and needed branch verification | 9 passed | 8 passed | 17 passed |

[Latest result per case with source-log references](final-browser-results.json). The focused command selected `tests/skills-sessions.spec.ts tests/input-guard.spec.ts tests/street.spec.ts --workers=1 --reporter=list,json`; subsequent commands selected only failed cases by exact title, one engine at a time. The original-case checks were selected by the titles in the independent main result manifests. [Initial focused batch](release-target.log), [Chromium regression verification](recheck-chromium-mobile.log), [completed Chromium supplier journey](finish-chromium-mobile.log), [WebKit regression and supplier verification](finish-webkit-mobile.log), [last layout check](last-webkit-mobile.log), [completed native-touch City flow](touch-webkit-mobile.log).

The City flow verifies physical travel, off-site prevention, one paid AP, real rendered interacting/leaving phases, real settlement totals, a paused mid-session reload with the same queue/cursor, and a second paid session. The real arrest test checks custody visibility, reload, release, cancelled unresolved buyers and Loco's independent status on both engines. Both supplier journeys sold all six held units for $278 gross, recorded an $18 loss, repaid the actual $102 obligation, and preserved the resulting state on reload.

Internal corrections retained every gameplay assertion: acknowledged navigation/category/City controls respect the existing stale-input guard; bounded locator probes handle buttons disappearing after arrival; genuine session completion can race a manual skip; multi-session journeys have enough time for real playback; iPhone gestures use the configured touch-enabled profile. A real custody-inspector bug was fixed so ended sessions cannot hide custody/recovery controls. The input-freeze regression itself was not changed.

[Every diagnostic failure compared](failure-comparison.csv): **29 earlier failed cases now pass on the feature branch; the other 57 cases independently failed on untouched main**. No original diagnostic failure is left without final passing verification or exact engine/case baseline evidence. This does not claim a new full-suite run is green; the complete diagnostic run remains the 82/86 record above.

The application source and build scripts are unchanged from the successful unit/build code commit `87ddd704b42662403c1e0938e68905966a9e5859`; subsequent changes harden browser-test acknowledgements and add evidence/documentation. No repeat of completed unit/build work was needed. Latest Lab main remains `ac5c75435f885d5be2092ab477c7959c7257320f` and is integrated.

[Captured iPhone frames](../../screenshots/goal-010) include real City visitors, session totals, inventory and reloaded custody in both engines. Physical iPhone hardware remains the owner's follow-up playtest. Future authored combat certification, higher robbery missions, drills and equipment reward routes remain explicit unavailable-content hooks as required by this foundation goal; no new missions/vendors/catalog were invented. Nothing has been merged or deployed by Codex.
