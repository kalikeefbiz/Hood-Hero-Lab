# GOAL 012 validation

Gameplay commit: `74df0bf079152a1ce112d61b59d6de3eb2341695` (on top of `828acbc04a881fb9c792b917f9ee91738d857bca`).
Latest main checked/included: `cdb4cd3c70fdee5ac83133c99ff35deb432d6bca`. The final documentation commit only records these results.

| Check | Result |
| --- | --- |
| `npm run build` | Passed: TypeScript and Vite production build. Existing dependency annotation, mixed import and bundle-size warnings remain. |
| `npm test` | **369 passed, 21 files; no failures or unhandled errors.** Final run after all gameplay/save compatibility fixes. |
| Inventory/Quanny/street-life focused tests | **93 passed**; the final full suite also includes these. |
| `npm run test:e2e -- tests/inventory.spec.ts tests/street-life.spec.ts` | **8 passed** across Chromium mobile and WebKit mobile (21.4 minutes). |
| Additional `city-menu.spec.ts:31` baseline check on untouched main | **2 failed**, independently reproduced in both mobile engines; details below. |
| `git diff --check` | Passed. |

The eight browser checks cover, in each engine:

1. City residence purchase, deposit, in-person Law-19 transfer, member equipment bonuses, full-load recipient refusal, and full-load safe refusal without item loss.
2. Fresh promise, physical application, queued Day 3 gift, real Lot session and reload.
3. Decline, paid cash starter, and one-AP trapping.
4. Earned contact, physical preparation shops, actual robbery puzzle, persisted outcome at 360 CSS pixels.

Unit coverage includes 12/20, 8/15 and 24/40 boundaries; stack caps, splitting/merging/swapping; capacity rejection before resources; same-place Set exchanges; consignment-only stock, sales, debt, returns and collections; weapon eligibility and crew bonuses; per-property safes and travel; discard/loss accounting; v8-v10 migration including slot/load/prep overflow and exact retrieval; save round trips; stable request-ID replays; retryable story rewards; and starter replacement after voluntary discard. Old pre-Set Quanny agreements retain agreed prices, cash reserves and historical refusal records when stock is recovered after recruitment.

The 30/60/180-day bounded storage probe reports 19/23/40 packs admitted, 11/37/140 capacity refusals, and 24/48/150 voluntarily discarded units. Two independent safes reach 36 load each; a six-unit pack requires splitting to use the remaining space. The probe uses pre-funded properties and replenishing supplier budget; full-world progression simulations remain separate tests.

## Existing baseline failure

Case: `tests/city-menu.spec.ts:31`, **“City centers the five state-backed neighborhoods and keeps actions in Actions.”**

Reproduction used an untouched detached worktree of main at `cdb4cd3c70fdee5ac83133c99ff35deb432d6bca`, built separately and served on port 4183:

```sh
PLAYWRIGHT_PORT=4183 npm run test:e2e -- tests/city-menu.spec.ts \
  --grep 'City centers the five state-backed' --output=/tmp/goal012-main-browser-results
```

Both Chromium mobile and WebKit mobile fail at line 64: a zone chip's `aria-pressed` attribute stays `false` after the test's direct click. The test also contains expectations for retired Actions-menu controls, but those later assertions were not reached. This case was not disabled, edited or counted as passing. See `main-baseline.log`. The complete browser suite was not run; the selected eight relevant cases passed.

## Browser environment

Both projects use the repository's iPhone profiles; WebKit used `WEBKIT_SOFTWARE_SCALE=1` (same CSS viewport, lower raster scale). Missing Debian browser libraries were extracted locally and linked into the local WebKit cache because root package installation is unavailable. The host detector reads the system `ldconfig` cache and cannot see these local libraries, so runs used:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
LD_LIBRARY_PATH=/tmp/pw-libs/usr/lib/x86_64-linux-gnu \
WEBKIT_SOFTWARE_SCALE=1 npm run test:e2e -- tests/inventory.spec.ts tests/street-life.spec.ts
```

Only installation detection was skipped; browser assertions ran unchanged. No repository browser configuration or deployment workflow was changed. Earlier attempts interrupted by the workspace restart or resource contention were superseded by the clean final unit/build and eight-case browser runs recorded here.

## Claude integration

See [the handoff](../../GOAL_012_CLAUDE_HANDOFF.md). Final grids and City/person/property presentation remain Claude-owned and must be integrated before release. Temporary test controls require `?inventory-review=1` and should be replaced. Law-19, Law-19 Switch and ARP still need icons. The branch is unmerged and no deployment was performed.
