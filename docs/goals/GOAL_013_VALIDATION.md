# GOAL 013 validation and balance

Implementation branch: `codex/goal-013-robbery-career`. PR target: Lab main. Latest integrated main: `a5aeecef5c8c240dc14f50cd4494c3e2665fb9b6` (Claude's input-guard/renderer lifecycle PR #18, after audit PR #17). Production repository, deployment workflow, save keys and Lab main are untouched by this implementation. See [Claude handoff](GOAL_013_CLAUDE_HANDOFF.md) for ownership and integration dependencies.

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

Validated source: `ab37972e53355ea091f9476c971ea663e809de25`, integrating Lab main `a5aeecef5c8c240dc14f50cd4494c3e2665fb9b6` before this run. Subsequent documentation/screenshots do not change gameplay code.

| Check | Result |
|---|---|
| `npm test` | **404 passed**, 23 files; no failures/errors (107.67 s) |
| `npx tsc -b` | Passed |
| `npm run build` | Passed (3.63 s Vite build; standard inherited large-chunk warning) |
| Final integrated Chromium + WebKit browser batch | **25 passed / 1 failed** (32.7 min): Chromium **13/13**, WebKit **12/13**; the one failure is independently reproduced on unchanged current main below |

Exact browser command:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 WEBKIT_SOFTWARE_SCALE=1 npm run test:e2e -- tests/robbery-career.spec.ts tests/robbery-recovery.spec.ts tests/street-life.spec.ts tests/inventory.spec.ts tests/skills-sessions.spec.ts tests/input-guard.spec.ts tests/danger.spec.ts tests/board-memory.spec.ts --grep 'City home loot|City named victim|career encounter survives|fresh promise|decline cash|earned contact|City residence|background, menu|a real session arrest|terminal conflict|a tap right|board GPU memory' --workers=1
```

Coverage includes actual City home loot/pawn at 390 and 360 px, original-owner property return and guaranteed active beef, saved seed/optional-session state, freeze/background/menu/reduced-motion/reload recovery without duplicate AP/prep/XP, real custody/seizure/release, inventory/equipment/capacity, both fresh-start routes (Chains/work/Flacco/Mega/real trapping), earned contact/preparation/contextual robbery at 360 px, terminal death/manual restore, and GPU memory across actions/tab switches. The entire legacy browser library was not run; this report does not claim it fully green.

Browser runtime: official Playwright Chromium and WebKit. The executor has no sudo/package helper, so missing official Debian runtime libraries were downloaded/extracted in user-owned scratch and copied into the user-owned Playwright bundle. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` skips only host library probing, which cannot see those bundle libraries. Real engines launch with the existing 3D board; no mocked engine or input-guard bypass. Chromium uses the default touch-enabled iPhone 13 DPR; WebKit uses the repository's software-scale override at DPR 1 with the same CSS layout and touch profile.

### Confirmed current-main failure

The only failed final-batch case is `[webkit-mobile] tests/inventory.spec.ts` — **City residence and member cards enforce slot/load rules and real equipment bonuses**. At feature line 160, `Your residence` → `Put in safe 1` is absent after the preceding single ARP-slot `.click()`: `toBeDisabled()` times out with “element(s) not found”. The snapshot shows the correct full safe (40/40 load) and physically carried ARP, but no selected slot. Chromium passes this case. This is a UI/input-selection review dependency, not a capacity or stock conservation failure.

Independently reproduced **the same case and same final safe-slot error** on unchanged current Lab main **`a5aeecef5c8c240dc14f50cd4494c3e2665fb9b6`** in detached `/workspace/Hood-Hero-Lab-baseline`, after its own production build. `git diff --exit-code a5aeecef5c8c240dc14f50cd4494c3e2665fb9b6` passed before and after; only the local dependency symlink/build output were added outside tracked source. Exact command:

```sh
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 WEBKIT_SOFTWARE_SCALE=1 PLAYWRIGHT_PORT=4174 npm run test:e2e -- tests/inventory.spec.ts --project=webkit-mobile --workers=1
```

Result: **1 failed / 0 passed**, 1.3 min, baseline line 162 (two-line selector formatting difference), same missing `Put in safe 1` control following ARP-slot selection. This case remains enabled and unchanged in its assertions. Claude should review native slot-selection/input-guard handling; the feature does not broaden into a replacement input system.

Earlier validation on prior main `6bf845f` also reproduced WebKit touch failures, including the post-freeze AP tap. After merging Claude’s PR #18, the dedicated post-freeze case **passes in both engines** in the final integrated run. It is no longer listed as an outstanding failure.

The central seizure boundary initially exposed an existing trapping assumption that the last street transaction was always the sale. Production code now selects the actual sale by session/cursor, preserving XP/cuts when arrest also writes a confiscation. The custody regression explicitly verifies one sale plus one seizure loss and no carried Pink Magic. Physical pawn/return receipts snapshot quantities before inventory removal. No tests were disabled, skipped or weakened to hide failures.

## Performance / artifact size

Independent production builds on unchanged main and the integrated implementation measured:

| Artifact | Main `a5aeece` | Implementation `ab37972` |
|---|---:|---:|
| Main JS | 720.15 kB / 227.46 kB gzip | 757.73 kB / 239.06 kB gzip |
| BoardStage JS | 640.28 kB / 171.42 kB gzip | 640.28 kB / 171.42 kB gzip |
| Main CSS | 101.27 kB / 20.72 kB gzip | 101.27 kB / 20.72 kB gzip |

The expansion adds about **11.60 kB gzip** of rules, schemas, content and functional UI. No model assets, renderer loops, per-frame rule work or robbery timers were added. Real software-rendered mobile engines, stall recovery and 180-day persistence simulations were exercised; this is not a real-device FPS certification. Final 3D placement and iPhone presentation remain Claude's work.

## Delivery state

All new GOAL013 flows pass in both touch-enabled engines, at 390/360 px where specified, including exact original-owner return, real pawn receipt quantity, persistence and no duplicate spending. Both fresh-start routes, earned progression, custody, terminal restore and memory checks also pass. The selected broader browser batch is **not fully green** because of the independently confirmed current-main WebKit inventory selection failure above.

Gameplay scope is implemented and ready for Claude review. Individual residential 3D blocks, final City cards/loot/lock presentation and iPhone polish remain the explicit Claude integration dependency. This implementation is unmerged and has not deployed.

Curated review artifacts: [Chromium home loot](../screenshots/goal-013/chromium-home-loot.png) and [WebKit pawn sale with actual quantity](../screenshots/goal-013/webkit-pawn-sold.png). Detailed integration contract and remaining Claude presentation work: [GOAL_013_CLAUDE_HANDOFF.md](GOAL_013_CLAUDE_HANDOFF.md).
