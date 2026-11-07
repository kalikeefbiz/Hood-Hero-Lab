# GOAL 013 validation and balance

Implementation branch: `codex/goal-013-robbery-career`. PR target: Lab main. Latest integrated main: `6bf845f` (Claude's report-only audit PR #17). Production repository, deployment workflow, save keys and Lab main are untouched by this implementation. See [Claude handoff](GOAL_013_CLAUDE_HANDOFF.md) for ownership and integration dependencies.

## Deterministic economy evidence

`src/tests/robberyBalance.test.ts` runs actual 30/60/180-day campaigns, seed 101, starting player cash $125. It uses the real day simulation, physically visited shops, paid/AP-costed multi-unit supplies, actual robbery rolls without overriding outcomes, persistent neighborhood/target limits, actual pawn sales, partner cash cuts and goods claims, residence purchase/storage when affordable, lawful gig fallback, consignment/trapping, and patrol/arrest recovery. Each day round-trips the complete save. An established trained/equipped Set companion is a declared starting condition for this career-economy scenario; **player ranks/XP are earned**, not injected. The separate fresh onboarding tests verify the ordinary start.

| Days | Attempts | Home attempts | Genuine successes | Robbery rank | Cash gross (before crew cuts) | Valuables pawned | Gloves/masks spending | Lawful gigs | Trap sessions | Ending wallet | Living-cost arrears | Supplier balances |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 13 | 1 | 10 | 3 | $944 | 3 | $300 | 6 | 0 | $180 | $0 | $102 |
| 60 | 19 | 1 | 13 | 3 | $1,140 | 4 | $420 | 11 | 1 | $20 | $51 | $306 |
| 180 | 56 | 4 | 33 | 3 | $2,732 | 14 | $1,200 | 53 | 3 | $176 | $322 | $714 |

“Gloves/masks spending” is explicitly the bulk-supply subtotal, not every economic cost. Other supplies, gun/contact costs, partner transfers/cuts/buyouts, optional residence and living costs are actual wallet expenses in the simulation. Pawn quantities count sold physical finds, not money. Natural arrests can precede the scenario's planned mid-campaign patrol; all seizure records, debts and physical stock reconciliation are checked. No ending/killing or negative wallet occurs in these runs, but this strategy can incur arrears; legal work remains available. These are reproducible scenario measurements, not a statistical estimate of every play style or a guarantee of survival.

Findings: Rank 3 is reachable (10 genuine successes by day 30 with earned invitations and XP); repeat civilian-only progression remains possible through distinct daily targets. At 180 days the mix succeeds 33/56 times and carries $1,036 of unpaid living/supplier obligations despite fallback gigs. It is a risky career, not guaranteed wealth or a replacement for careful lawful work. Existing independent long-running lawful employment, trapping and inventory capacity simulations remain in the full unit suite.

## Payout interpretation and tuning

All new payout/risk bands are in `src/content/robberyCareer.ts`; existing preparation prices and inventory capacity stay in their established registries.

- Ordinary full cash $25–75, plus a 30% incidental-item roll (only 2% absolute chance of a plain chain). $20 gloves/mask per attempt, 1 AP plus real supply shopping, heat, failure/arrest/injury. Approximate cash-only expected net at a patient low-risk exit: .71 × $50 − $20 = **$15.50/attempt before bonus goods and all consequence costs**; shop AP lowers the per-AP return further. This is an analytic illustration, not a guaranteed win rate.
- Home cash $60–140 plus physically selected goods. At base pawn ratio, typical first-two-room gross centers around **$270** (console/phone), **$450** (PC/console), **$560** (jewelry/PC), depending on rolls and capacity. Rare third-room locked art/jewelry appears only 12% of visits; it can exceed the ordinary $200–600 target band and is never required. Carrier capacity can force leaving loot. $42 player prep plus actual partner gloves/mask, 25% partner cash and a disclosed 25% base-pawn-value goods buyout; shared D+5 home lock prevents repeated same-zone visits.
- Liquor full cash $125–225, optional small smokes/booze stacks, no same-location repeat that day, Rank 2 and actual equipped firearm, higher exposure than street targets.
- Commercial cash $400–750 plus carried merchandise/jewelry, trained equipped real partner, Rank 3 coordination, Downtown pressure and 25% crew terms. Low-thousands exceptional total proceeds remain far below future bank content.
- Pawn applies 63% once to seeded retail estimates, modestly adjusted and clamped at 55–70%. PC retail $280–440 ⇒ base pawn $176–277; console $170–260 ⇒ $107–163; jewelry $240–500 ⇒ $151–315; art $550–1,250 ⇒ $346–787. These are offers, not a second discount on nominal pawn bands. Named high-chain retail $650–950 is finite per owner, not canonical MEGA property.
- Original-owner sell-back is 72% retail with real NPC funds and receiving capacity, +8 notoriety and guaranteed durable personal beef. It cannot be combined with pawn sale on the same physical item.

Balance follow-up for Claude/owner: review the collector-house upper tail, actual iPhone pacing of preparation/partner handovers and the strain of goods-buyout obligations after later losses. Constants are intentionally editable. No bank payouts, enterprise/endgame economy or new gangs were introduced.

## Test evidence

Final command results are recorded below after validation completes. Interim harness issues were diagnosed rather than labelled baseline: WebKit lacked runtime libraries; test navigation needed to acknowledge real City news/close encounters; a hidden inspector needed reopening before selecting the original owner. The trapping sale-selection regression caused by the new central seizure boundary was fixed in production code and covered by the existing session/crew assertions. No test is disabled or skipped to make the suite pass.

Browser runtime: official Playwright Chromium and WebKit downloaded. The executor has no sudo/package helper, so missing official Debian runtime libraries were downloaded/extracted in user-owned scratch and copied into the user-owned Playwright bundle. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` skips only host library probing (which cannot see these bundle libraries); the tests launch and exercise real engines. Browser tests use real touch-enabled iPhone projects and real City controls; no input guard bypass.

### Final code / commands

Validated implementation: `de725b6` (subsequent report/screenshots do not change gameplay code).

| Check | Result |
|---|---|
| `npm test` | **403 passed**, 23 files; no failures/errors (101.14 s) |
| `npx tsc -b` | Passed |
| `npm run build` | Passed (3.65 s Vite build; standard inherited large-chunk warning) |
| Final feature/recovery/custody browser batch | **10 passed**, 0 failed (10.0 min), Chromium + WebKit |

The final browser command is:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 WEBKIT_SOFTWARE_SCALE=1 npm run test:e2e -- tests/robbery-career.spec.ts tests/robbery-recovery.spec.ts tests/skills-sessions.spec.ts --grep 'City home loot|City named victim|career encounter survives|a real session arrest' --workers=1
```

It checks City home loot and pawn sale at 390 and 360 px, saved optional session state, exact owner-return inventory and beef, real freeze/hidden-board/reduced-motion/reload recovery without duplicate AP/prep/XP, and actual custody/seizure/release in both touch-enabled iPhone 13 engine projects. Chromium uses the default device DPR; WebKit uses the repository's software-scale override at DPR 1, keeping the same CSS layout and touch profile.

The broader regression command was:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 WEBKIT_SOFTWARE_SCALE=1 npm run test:e2e -- tests/robbery-career.spec.ts tests/street-life.spec.ts tests/inventory.spec.ts tests/skills-sessions.spec.ts tests/input-guard.spec.ts tests/danger.spec.ts --grep 'City home loot|City named victim|fresh promise|decline cash|earned contact|City residence|background, menu|a real session arrest|terminal conflict|a tap right' --workers=1
```

That initial 22-case batch completed **18 passed / 4 failed**. Both fresh promise and decline starts, physical work, Flacco's six, Mega's lesson, Chains, earned contact/preparation/robbery at 360 px, home/pawn/sell-back, background/unmount/reduced-motion/End Day, and terminal death/manual restore passed in both engines. Two custody failures used the old cached expectation of one transaction: correct state contains one sale AND one new confiscation loss. The current test explicitly expects both plus one seizure and no carried Pink Magic; the final batch reruns those checks. The remaining two failures are independently confirmed baseline WebKit touch failures below. The entire legacy browser library was not run; do not describe it as fully green.

### Confirmed baseline failures — unchanged latest main

Detached checkout: `/workspace/Hood-Hero-Lab-baseline`, commit **`6bf845fdd3e6c7ac946e35b6a7d34f97cbfd3c49`**. `git diff --exit-code 6bf845f` passed before/after reproduction; only the local dependency symlink/build output were added outside tracked source.

After an independent baseline production build, the exact command was:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 WEBKIT_SOFTWARE_SCALE=1 PLAYWRIGHT_PORT=4174 npm run test:e2e -- tests/input-guard.spec.ts tests/inventory.spec.ts --project=webkit-mobile --workers=1
```

**2 failed / 0 passed**, with the same errors as the implementation branch:

1. `[webkit-mobile] tests/input-guard.spec.ts:18` — **a tap right after a freeze ends, once the page has drawn, goes through once**. At line 52, expected AP **1**, received **2**: the single post-freeze click was dropped. Baseline duration 23.4 s (feature branch 22.9 s).
2. `[webkit-mobile] tests/inventory.spec.ts:69` — **City residence and member cards enforce slot/load rules and real equipment bonuses**. At line 115 (`tapUntil` → `tests/helpers.ts:59`), timed out awaiting the Give action after the unretired single Law-19 slot click; selected-slot state was not applied. Baseline duration 58.5 s (feature branch 58.4 s, corresponding line 113 due to narrower district selector formatting).

These tests remain enabled. Chromium passed both. This is a **Claude UI/input-guard review dependency**, consistent with the existing [main audit](../CODEBASE_AUDIT_2026-11-06.md), particularly T2/T3/T5. It is not a new stock, payout, equipment, AP or save failure, and it is not hidden by changing game rules or weakening the assertions. The new robbery recovery case uses the repository's native-touch acknowledgement helper and separately verifies no duplicate outcome after a freeze/menu/reload.

### Performance / artifact size

Independent builds on main and the final implementation measured:

| Artifact | Main `6bf845f` | Implementation `de725b6` |
|---|---:|---:|
| Main JS | 720.04 kB / 227.40 kB gzip | 757.63 kB / 239.02 kB gzip |
| BoardStage JS | 639.41 kB / 171.09 kB gzip | 639.41 kB / 171.09 kB gzip |
| Main CSS | 101.27 kB / 20.72 kB gzip | 101.27 kB / 20.72 kB gzip |

The expansion adds about **11.62 kB gzip** of rules, schemas, content and functional UI. No model assets, renderer loops, per-frame rule work or robbery timers were added. Real software-rendered Chromium/WebKit flows, stall recovery checks and 180-day persistence simulations were exercised; this is not a real-device FPS certification. Final 3D placement and iPhone presentation remain Claude's work.

### Delivery state

The final 10-case batch passed **5/5 Chromium and 5/5 WebKit**, including both corrected custody cases and the exact original-owner item-return assertion. Across the selected flows, all GOAL013-specific checks and both full fresh-start routes pass. The two broader WebKit tap failures above remain enabled and confirmed on main; the overall browser library is not claimed green.

Curated review artifacts: [Chromium home loot](../screenshots/goal-013/chromium-home-loot.png) and [WebKit pawn sale with actual quantity](../screenshots/goal-013/webkit-pawn-sold.png). Detailed integration contract and remaining Claude presentation work: [GOAL_013_CLAUDE_HANDOFF.md](GOAL_013_CLAUDE_HANDOFF.md).
