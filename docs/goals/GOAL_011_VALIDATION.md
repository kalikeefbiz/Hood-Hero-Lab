# GOAL 011 validation

Validation date: 2026-11-06. Lab main comparison: `59d9b8109a99c9efd773c28be4d3e99cc9d5fcf3`. Latest Lab main was fetched and merged into the feature branch before delivery validation; it was already up to date, with no conflicts.

## Required checks

- `npx tsc --noEmit`: passed.
- `npx vitest run`: 346 tests passed across 20 files.
- `npm run build`: passed; build metadata identifies GOAL 011 / schema 10. Vite reports its existing large-chunk advisory; the baseline build reports the same advisory.
- `git diff --check`: passed.

The new `streetLife.test.ts` covers all three decisions, physical application/gig/offer completion, queued six-unit gifts, permanent refusal cash terms, no-commitment cash starters, resolution without a formal choice, all four collective outcomes, clean payment versus negotiation/support drama, closing the confrontation without escaping beef, Rio introductions/paid access, Pablo gates, same/different plug packs, selected-lot settlement, independent repayment, v8/v9 migration, corrupt records, genuine robbery success/failure, actual certification, and the home follow-on after three actual successful operations. Dedicated Danger probes exclude Mega and Flacco from corner objections while retaining the existing credible-witness test. Existing 30/60/180/365-day skill, employment, danger, economy and Quanny tests remain enabled.

## Mobile browser results

### GOAL 011

`tests/street-life.spec.ts`, iPhone 13 emulation:

- Chromium: the complete fresh promise route and decline/cash route passed; the isolated 360px robbery/reload scenario passed on recheck. Three distinct required scenarios passed. The initial robbery assertion was corrected to distinguish preserved AP from genuine hospitalization/custody setting AP to zero; no outcome or danger rule was weakened.
- WebKit: **3/3 passed in one final run** (`goal011-webkit-touch-final`, 13.7 minutes). This includes the full fresh-game route through paid work, Flacco, trapping/reload, Chains payment, collective aftermath, earned trust, Rio introduction/tribute, shopping and robbery; the separate refusal route; and the 360px robbery/reload/consequence route.
- Pattern inputs use the repository's native-touch acknowledgement helper. Earlier synthetic mouse clicks were correctly rejected by the post-freeze guard on software WebKit. No guard bypass, forced click, disabled gameplay assertion, fabricated browser reward or rerolled session was used.

Screenshots are committed in `docs/screenshots/goal-011/`: Chromium lesson/first robbery and WebKit first/reloaded robbery. The new sessions reuse the existing transient procedural visitor adapter, including reduced-motion support; accessible place lists use the same physical core validation.

### Preserved behavior

A focused Chromium run passed **4/4**:

- the post-freeze tap goes through once;
- find a City plug, accept a pack and repay with real exchange feedback;
- Quanny's intentional physical introduction, stock front and reload persistence;
- trapping background/menu pause, stale/double touches, reduced motion and End Day invariants.

The updated historical inventory layout probes passed **4/4** at 320, 375, 390 and 430 pixels. The corrected historical Pablo scenario subsequently passed: friendship alone cannot introduce him, actual Angels standing and membership open the legitimate introduction, and the resulting stock/debt survives reload. The active-Chains completion/history scenario and crew layout at 320px also passed on recheck.

## Best-effort full suite and baseline comparison

Ran `npm run test:e2e -- --workers=1 --max-failures=4 ...`, selecting all **182** Chromium/WebKit tests. The broad run stopped at four failures after **12 passed**; **166 did not run**. It is **not** reported as a green full suite.

The failures were:

1. Historical Pablo/introduction scenario: its old assertion expected a disabled introduction button, whereas the existing Actions view hides an introduction when all candidates are gated. Corrected the assertion to require its absence, retained the negative Pablo-access assertion, and added a real standing/membership/positive-introduction path. It passed on recheck.
2. Active Chains history: an unacknowledged synthetic promise click left the conversation open. Used the existing native-touch helper and asserted that the actual commitment was created before navigating. It passed on recheck.
3. `tests/crew.spec.ts:130`, independent offer: remains an existing broad-suite limitation. On the feature broad run it timed out waiting for End day; unchanged main reproduced that same End day timeout. An additional feature recheck failed earlier when a synthetic “Tell me more” click was not acknowledged. This test was left enabled and unchanged.
4. Crew layout at 320px: timed out in the broad run, then passed in the isolated feature recheck and on unchanged main.

Separately reproduced the AGENTS.md-listed City-menu and mobile-buyback timeouts on unchanged main using a detached Lab-main worktree. Their failure is not used to excuse any new GOAL gameplay failure. Baseline and feature used the same installed toolchain/browser versions. No production repository or branch was involved.

## Environment and genuine limits

The environment lacks privileged package installation. Browser binaries were installed with Playwright; missing Debian WebKit libraries were downloaded and extracted into the workspace and its browser bundle. A direct WebKit launch was verified. WebKit used `WEBKIT_SOFTWARE_SCALE=1` and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` after satisfying the actual runtime libraries, because Playwright's host probe still searched the system linker cache. This bypasses a package-location probe, not any game test, browser input guard or outcome validation.

Physical iPhone hardware review remains for Claude/the owner. Store and bank scores are deliberately unavailable future content; the authored home follow-on is playable and its genuine progression/session flow is unit-tested. The broad 182-test suite remains incomplete/non-green as qualified above. No merge or deployment was performed.
