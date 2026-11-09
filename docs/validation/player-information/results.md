# Validation results

Base: freshly fetched Lab main `753798999cac1f9ddf428aa5368077c1e8a58184`. Feature: `codex/player-information`. Production Hood-Hero remains clean and unchanged. Node 24.22.1, npm 11.9.0, Debian 13. No test was disabled or skipped to obtain a pass.

## Unit and build

- `npm test -- --maxWorkers=2`: **417 tests passed across 24 files** ([log](full-unit.log)). This includes the original simulation suites, long seeded campaigns, robbery/economy balance, AI/relationships, inventory/consignment, employment, danger, Quanny, skills, persistence and 13 new disclosure tests.
- `npm test -- src/tests/playerInformation.test.ts --maxWorkers=2`: **13 passed** after the final presentation refinements ([log](disclosure-unit.log)). These use the real robbery search/safe and supplier APIs, actual serialization, server-rendered UI surfaces, and an architectural guard against direct UI reads of seeds, pools and probability functions.
- `npm run build`: strict TypeScript and production build **passed**. Vite still emits advisory bundle-size warnings. See [build log](build.log).
- `git diff --check`: passed.

## Browser execution

Current policy blocks the Playwright CDN, so these executions used the image's `/usr/bin/chromium` (156.0.8078.79), with the repository's `chromium-mobile` iPhone 13 profile. It is a close system-browser fallback, not the lockfile-pinned Chromium (156.0.8078.4). The local config at `/workspace/cloud-setup/Hood-Hero-Lab.playwright.config.ts` imports the repo config, changes only the test/output/server directories and Chromium executable, and selects that engine. Worker count was one per run for software WebGL. The initial baseline reproduction used a separately built, untouched `git archive origin/main` under `/tmp/hood-hero-lab-main-check`, with the same dependencies and browser, on port 4175; it did not reset or change the feature checkout.

1. `PLAYWRIGHT_PORT=4173 npm run test:e2e -- --config=/workspace/cloud-setup/Hood-Hero-Lab.playwright.config.ts tests/player-information.spec.ts tests/board.spec.ts tests/mobile.spec.ts --workers=1 --reporter=list`: **8 passed, 1 failed** ([log](initial-browser.log)). Passing cases: all three existing board tests, mobile phone gameplay/save/load, 320px readability, both new discovery/pause/reload widths, and the all-navigation disclosure test.
2. `PLAYWRIGHT_PORT=4173 npm run test:e2e -- --config=/workspace/cloud-setup/Hood-Hero-Lab.playwright.config.ts tests/player-information.spec.ts tests/inventory.spec.ts tests/skills-sessions.spec.ts --grep 'City disclosure|all navigation|City residence|Actions gives' --workers=1 --reporter=list`: **4 passed, 1 failed** ([log](inventory-browser.log)). The existing City residence/member test passed, including capacity, real item transfers and equipment bonuses. The then-unupdated skills assertion failed as described below.
3. `PLAYWRIGHT_PORT=4173 npm run test:e2e -- --config=/workspace/cloud-setup/Hood-Hero-Lab.playwright.config.ts tests/player-information.spec.ts tests/skills-sessions.spec.ts --grep 'City disclosure|all navigation|Actions gives' --workers=1 --reporter=list`: **4 passed** after the wording assertion was updated ([log](focused-browser.log)). These are the latest results for those cases; repeated passes are not additional distinct cases.

Across those selected cases, **10 distinct Chromium cases pass; one unchanged case remains red**. The entire browser suite was not run. No result is claimed for unexecuted cases.

### Confirmed unchanged buyback failure

`chromium-mobile`, `tests/mobile.spec.ts:85`, “buyback resolves the incident and the ordinary loop remains playable”: waits on a disabled “Pick up a gig” action at test line 93 and times out at 90 seconds. This exact engine/case/step reproduces on untouched latest main with:

`PLAYWRIGHT_PORT=4175 npm run test:e2e -- --config=/workspace/cloud-setup/baseline.playwright.config.ts tests/mobile.spec.ts --grep 'buyback resolves' --workers=1 --reporter=list`

See [independent main result](confirmed-main-buyback.log) and the corresponding candidate failure in the initial browser log. The information correction leaves gig eligibility and gameplay unchanged; it does not claim this journey passes.

### Superseded skills-copy assertion

`chromium-mobile`, `tests/skills-sessions.spec.ts:203`, originally expected `Story certification`, while latest main actually rendered `Complete an optional authored violent-operation introduction`. The same assertion failed on untouched main ([log](confirmed-main-skills.log)). This PR replaces the technical requirement copy with `Complete training with an experienced contact`, and updates that single browser assertion to require the full new explicit requirement. The assertion is retained, not removed or weakened. The case now passes on the feature build.

## Mobile evidence

The new tests start in City, visit a real courtyard target, assert that all three houses omit loot-table items and debug IDs, begin an actual robbery, verify real first-room discovery, pause/reload without rerolling or extra AP, and check horizontal overflow at 390px and 320px. The navigation test checks People, Actions, Set, Wallet, Journal and City for private scores/thresholds, hidden-event canaries, IDs and seed text. Images:

- [390px before discovery](before-discovery-390.png)
- [320px before discovery](before-discovery-320.png)
- [Set relationship information](set-390.png)

## Remaining environment and review requirements

- **Mobile WebKit is unrun.** The actual `playwright install chromium webkit` request returned `403 Domain forbidden` for `cdn.playwright.dev`. That domain is saved in the environment draft but is not in the enforced running policy. After the user applies the domain change, install the pinned engines with `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx --no-install playwright install chromium webkit`, diagnose any system-library/redirect prerequisites, and run `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run test:e2e -- tests/player-information.spec.ts --workers=1` with the original configuration. Physical iPhone/Safari validation is also unrun.
- **GitHub API is blocked.** Native Git reads work, but `gh pr list` against `api.github.com/graphql` returned Forbidden. `api.github.com` is also saved in the draft; applying it is required for CLI PR operations. The environment draft save is not proof that access is active.
- Claude must review the small board presentation adapters and shared UI, as described in the [surface inventory](README.md). Renderer, board architecture and visual assets are unchanged. No missing board location/person/action wiring is being deferred.
- Do not merge or deploy this branch from Codex. The feature is not live. These results do not assert a clean full browser suite or completed WebKit acceptance.
