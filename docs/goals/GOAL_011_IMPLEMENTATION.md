# GOAL 011 implementation / Claude review

Target: **Hood-Hero-Lab main only**. Review and merge belong to Claude. This PR does not authorize deployment or changes to the original production repository.

## What is playable

Fresh runs use the complete Chains opening. Promise, decline and delay persist independently from the incident's eventual resolution. A chain resolution without a formal choice records the no-commitment route, so a closed storyline never strands onboarding. A valid physical workplace application or offer acceptance, an existing City gig, or Mr. Lewis's one-time grocery delivery completes honest-work introduction. Applying is unpaid; accepting creates the established shift schedule. Existing lawful actions remain available. Remote menu activity does not complete the new objective.

Promise routes queue Flacco's one-time Day 3 approach, even if the work introduction is unfinished. Receiving creates one six-unit, zero-cost, zero-debt Pink Magic lot. Deferring it awards nothing and leaves an explicit City resume control. Decline/no-commitment routes buy a real six-unit $90 cash starter from Mega; the initial refusal permanently excludes consignment and a late promise cannot create another starter. Broke players retain gigs and employment.

Both routes meet at the existing Southside Lot. Starting the genuine GOAL010 session costs one AP, records Mega's instruction, and uses the existing visitor RNG, demand, inventory, exposure and exact 0.50/0.20 Trapper XP awards. Nothing guarantees sales. Lesson progression opens ordinary supply and optional dangerous work.

The first later physical crew meeting in Rio plays one collective aftermath. Durable original/reduced/paid demands and clean-payment history (including requested outside support) distinguish player recovery, confirmed discount, clean full-price buyback and nonfactor outcomes. Recovery creates three personal conflicts, without faction war or automatic violence. Ordinary Danger conversations can reconcile them. Legacy incidents without reliable new payment detail fall back to nonfactor.

A member with 35 directional trust and no unresolved crew beef can introduce the ordinary `contact-angels`. That contact charges a transparent, prepaid $12 for today and the following two days. Each payment has its own persistent record, recipient, cash ledger and exchange. Standing does not bypass permission. Product access and earned reputation remain separate. Pablo requires Angels membership or Big Dog rank for direct access; authored indirect Chains leadership settlement remains available.

Supply now supports independent packs and debts. Mega ignores ordinary distrust, held stock, unpaid packs and global cooldowns, but actual serious personal enemies block supply. Other plugs evaluate their own balances, trust, recent repayment, risk and available budget. The original six-day deadlines never reset. Repayment conversations expose every agreement with full/partial choices. Wallet retains inspectable lots and opposite-direction Quanny receivables. Sessions use an explicit stock selector or earliest-deadline/stable-ID default, then stay pinned to that lot.

Optional trusted trio or earned Quanny conversations introduce stable, expiring strong-arm opportunities. Players buy gloves at Southside Food Mart and a mask at the Nawf Street market, visit the Rio courtyard, and start a one-AP session. Approach choice, a fictional color-pattern challenge and a risk/proceeds decision determine the seeded result. Pausing and reloading retain the event cursor, pattern and roll. Preparation is consumed, resolved jobs cannot be farmed, and actual failure can cause no loot, custody or hospitalization. Witness memory, exposure and real Combat/Robbery awards persist. First completed participation supplies the authored Combat certification; merely owning a firearm does not.

Three successful introductory operations supply the existing Home Invasion rank requirements and unlock the coherent Boarded-house follow-on. A qualified contact can arrange the existing Law-19 for $75 and one AP; it still must be equipped. Home invasion additionally requires a duffle and fictional pattern token, bought at the Street market and warehouse. Four preparation purchases cost four AP across real City locations. Store/bank types are defined and explicitly unavailable future content; no fake selectable scores, new weapon store or automatic firearm certifications were added.

Twelve focused conditional scenes cover the gift, collective aftermath, Mega's lesson/family/debt/pressure, Flacco's loyalty/follow-up, Rio terms, Quanny continuity and Lewis's community work. Quiet optional conversations are once per run, rather than daily forced scenes. Generic corner-objection selection excludes Mega and Flacco; credible witnesses retain it.

## Persistence and integration

Schema 10 accepts v8/v9 envelopes and preserves old wallets, lots, commitments, presence, AP, Quanny state and skill/equipment records. Historical runs receive an explicit grandfathered onboarding state: no restart and no retroactive gift. The sole added ordinary contact is additive. Existing manual/auto keys and `/next/` suffix isolation stay unchanged.

New records validate event/location/stock references, preparation accounting, robbery settlements and cursor input. APIs reject stale cursors, duplicate scene responses, resolved opportunities, unavailable stock, off-site starts, early criminal work and competing activities. Travel, day end, custody and hospital transitions cancel unresolved activity. Hidden tabs and other screens pause robbery; no rendering callback awards loot.

Historical economy tests now deliberately load migrated v9 fixtures to retain their original AP/stock/relationship preconditions. Fresh onboarding has separate direct-API, migration and real-browser coverage. Assertions changed only where GOAL011 deliberately changes a rule: multi-pack Mega credit, Pablo access, Rio permission and the current save version. No tests were skipped or silenced.

## Claude-owned surfaces requiring review

- `src/board/ui/BoardPanels.tsx`: narrowly inserts shared City person/place controls and exposes all existing person moves; Pablo direct moves are filtered.
- `src/ui/App.tsx`: robbery playback, resuming queued scenes, physical reload focus, tutorial navigation and the existing transient visitor descriptor. Existing renderer, input guard and hidden-board pause are preserved.
- `src/ui/StreetLife.tsx`: shared physical person/place controls, tutorial routes and accessible robbery input/playback.
- `src/ui/StreetSession.tsx`, `InventoryWallet.tsx`, `PlugEntry.tsx`, `exchanges.ts`: real lot selection, preparation/permission/loot exchanges and persistent summaries.

No board geometry, 3D assets, camera architecture or permanent renderer was added. Robbery reuses the existing procedural visitor adapter and its reduced-motion handling. Please review these UI adapters on the owner's iPhone before merge/deployment.

## iPhone playtest path

1. New Southside run → promise → City Food Mart → Go here → submit application. Cash must stay $125. Accept if desired, then attend the Day 2 shift at the same physical workplace.
2. Reach Day 3 safely, receive Flacco's six, and verify Wallet has no supplier debt. Defer/reopen before receiving and reload afterward: there must still be only one gift.
3. City → Southside Lot → Go here → Start trapping. Watch actual visitors; pause, background Safari and reload. Continue retains stock, cursor and paid AP. Sales may fail.
4. Settle the Chains while still active. Visit a trio member physically in Rio and acknowledge the shared reaction. Earn 35 trust through ordinary interactions; ask for the Rio introduction.
5. Visit the introduced contact. Read the $12/three-day terms, agree/pay once, and verify ledger, recipient and expiry. Merely raising local standing must not open outsider trapping.
6. Ask a trusted trio member for optional work (or earn Quanny's independent route). Read the job and preparation requirements. Buy gloves and mask at their City shops, visit the courtyard and play all three robbery beats. Reload midway and after settlement; there must be no reroll or duplicate loot/XP.
7. Repeat newly offered introductory jobs on later days. After three actual successes, obtain/equip the contact-arranged Law-19, prepare all four items and play the gated home follow-on. Store/bank scores stay unavailable.
8. Separate run: decline, finish the work introduction, physically buy Mega's cash six and play the same Lot lesson. Friendship and a later promise must not convert this route into credit or a free gift.

Automated results and exact environment/baseline qualifications are in `GOAL_011_VALIDATION.md`. Browser emulation is not a claim of a physical iPhone test or deployment.
