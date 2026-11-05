# GOAL 010 — Eight-Skill RPG Progression + Playable Board Trapping Sessions

**Repository:** `kalikeefbiz/Hood-Hero-Lab`
**Implementation branch:** `codex/goal-010-skill-sessions`
**Target PR:** `main` (Claude reviews and merges, NEVER Codex)
**Starting Lab main:** `ac5c75435f885d5be2092ab477c7959c7257320f`
**Priority:** One complete, thoroughly tested foundational milestone. NO intermediate user decisions, partial handoffs, scope reduction, or premature PRs. Work autonomously and make coherent engineering decisions where the specification is silent.

## 0. Project and governance contracts

Read this GOAL completely, inspect the current code, and follow the collaboration policy in root `AGENTS.md`. If `AGENTS.md` has not been merged to main yet, read the policy from `codex/collaboration-rules:AGENTS.md` (PR #2) and follow it anyway. Claude owns the board/3D and reviews/merges all Codex PRs. **For THIS single user-authorized integration GOAL only**, minimal surgical board adapter changes are permitted when necessary to make a *real playable City-based trapping session*; clearly isolate and document them for Claude's ownership review. No board rework, new rendering architecture, art restyling, or separate application. Never push directly to main or touch the original `kalikeefbiz/Hood-Hero` repository. Preserve Lab local-storage save namespace, input-freeze safeguards from Claude's PR #3, and main's automatic Pages deployment behavior.

This is a foundation+game-loop GOAL, **not the content sprint**. Do not invent new robberies, violent-crime story missions, named narcotic products, canonical characters, locations, faction lore, buildings, or firearm vendors. Build complete generic progression, equipment and activity-session mechanics with real current gameplay integration; future content should plug into data definitions. High-level placeholder ability unlocks may be visible as `Not yet available in the game`; don't fake playable missions.

**Definition of success:** Start/resume on iPhone; view all eight RPG skills and their XP/ranks; progress them from qualifying existing actions; reach a designated City street spot, physically stand there, spend exactly 1 AP to trap, watch buyer figures approach/interact/leave in short sequence, see independent buyer successes/failures/suspicion and real cash/inventory/heat/XP changes, safely interrupt/resume, and either spend another AP at the same/different spot or pursue another action. Menus cannot bypass physical presence. All existing Quanny/Mega/Chains/crew/business systems and saves still work.

## 1. Eight persistent character skills

Implement for **player AND all NPCs/Set members**, with independent persistent XP, current rank, qualifying milestones and transparent next-rank criteria. Numerical proficiency or legacy ability compatibility must never be shown as `% of mastery`; show exact rank, earned XP, next threshold and missing milestones.

Existing `Character.skills.social`, `work`, `recovery` are currently 0–100 scores used in old formulas. Keep old saves and effects compatible; `recovery` becomes *Survival* in the new UI/semantics, and **stop using it as a universal proxy for gunfighting, robbery, and trapping**. A single canonical progression store should drive new rules, with documented safe compatibility mapping for old numeric attributes. GameState is currently v8; add migration/defaults to existing and historical saves, and validate in `SaveSystem`. Never reset a player's wallet, inventories, progress, Quanny state, obligations, relationships, physical position, or crew.

### Skills, tiers and milestone gates

| Skill | Rank 1 | Rank 2 | Rank 3 | Rank 4 | XP gates for ranks 2/3/4 (cumulative) |
| --- | --- | --- | --- | --- | --- |
| Combat | Uncertified | Certified | Stepper | Gravedigger | Story certification / 15 / 60 |
| Robbery | Strong-Arm | Home Invasion | Armed Stickup | Major Score | 9 / 35 / 90 |
| Trapper | Peon | Corner Boy | Local Plug | Big Dog | 35 / 130 / 400 |
| Survival | Green | Alert | Hardened | Survivor | 12 / 45 / 110 |
| Social | Familiar | Connected | Influential | Power Broker | 20 / 65 / 160 |
| Leadership | Unproven | Reliable | Organizer | Shot Caller | 12 / 42 / 105 |
| Work | Entry-Level | Reliable | Skilled | Professional | 25 / 80 / 190 |
| Business | Beginner | Operator | Proprietor | Entrepreneur | 20 / 70 / 180 |

These numerical gates are **starting balance, not a command to generate grind content**. Make all data definitions centralized/testable rather than buried in components. XP rewards and milestones must both pass for promotions. Skill gains award **real outcomes**; no passive XP for opening interfaces, repeated spam, money transfer loops, cancelled actions, idle animation, or save/reload. Deterministic award records/event IDs prevent duplicate awards.

**Combat:** Uncertified self-defense allowed, no ability to initiate organized lethal crimes. Certified is unlocked by a future authored violent-crime introductory story flag, not by buying a weapon and not by a made-up placeholder mission. Once Certified: Law-19 eligibility and early dangerous operations (when their content exists); Stepper requires at least 15 Combat XP and **3 qualifying successful violent operations**; Gravedigger requires 60 Combat XP and **12 cumulative qualifying successful operations**. Qualifying successful violent operations +5 Combat XP, actual failed participation +1, serious successful defensive response +2 (do not count defensive responses as criminal-operation successes). No XP for being attacked without performing a defensive action; no requirement to kill. A few serious operations, not 100 drills. Certified can make dangerous early home-invasion attempts under future content even before Robbery rank 2, but with bad outcomes. Set-directed drills require Gravedigger AND suitably skilled/willing members, plus existing crew constraints; don't expose fake drill buttons if mission activity not authored.

**Robbery:** Successful strong-arm +3, home invasion +5, store +7, bank +12; genuine failed attempts +0.5/+1/+1/+2. Ranks 2/3/4 require respectively **3/9/18 cumulative successful robberies**, XP gates above, eligible combat rank, and appropriate actual activity/story access. Bank robbery also requires Gravedigger and equipped ARP. Count only actual robberies, not illicit merchandise sales or generic `crime` sales. If content to reach a rank is not yet implemented, show that missing requirement, do not invent it. Existing Quanny-specific robbery retaliation should count only if the current action is explicitly a real qualifying robbery.

**Trapper:** *Per real buyer interaction*, not per session and not per individual unit/bag. For Pink Magic: actual successful purchase **+0.50 XP**; attempted-but-failed transaction with real exposure/outcome **+0.20 XP**; walking past/no offer/no buyer **0 XP**. Future fictional product tier definitions: Tier 2 success +0.75, Tier 3 +1.00, Tier 4 +1.25; meaningful failed attempt +0.20, with category-based anti-farming caps if needed. Store XP as integer hundredths to avoid rounding drift. Ranks at **35, 130, 400 cumulative XP**; Local Plug additionally needs verified credible supplier relationship and completed obligation; Big Dog requires reliable meaningful supply history and cross-zone commercial experience. Do NOT require unavailable higher-tier narcotics to reach a rank; the future product catalog is a content sprint. Rank controls merchandise access, margins, achievable volume, future supplier offerings and contractual opportunities, **NOT individual buyer success probability**. Avoid instant max in 60 days; test 30/60/180/365-day focused simulations. Real skill growth for NPC dealers where valid. Preserve **Quanny's existing special early consignment** independent of Local Plug gating; who owes whom, six-day due dates, reserves, market location, nonpayment and notoriety logic unchanged. Existing merchandise ID `nightgoods` may remain internally for old save compatibility; change **every player-facing `Night goods` string to `Pink Magic`**, including journal, wallet, promises, events and accessible summaries. Keep current merchandise quantity/prices until deliberately balanced; **do not interpret the word nickel as an automatic $5 sale price**. Product represented as fictional clear nickel-bag Pink Magic. No real-world chemistry or processing details.

**Survival:** defensive awareness, escaping danger, mitigating injuries and recovery; 12/45/110 gates, award reasonable low XP for actual escape/defense and real completed recovery, with anti-farming safeguards. Not invulnerability, and not an offensive combat substitute.

**Social:** actual negotiated outcomes, meaningful trust gains, introductions, reconciliation and mediation; 20/65/160. Prevent contact/spam farming. Directional relationship values are separate from Social skill.

**Leadership:** completing Set commitments, coordinating and delegating with outcome-based experience; 12/42/105. Faction `authority` is independent; a neutral player can be a strong Set leader. NPC members keep their own skill capability.

**Work:** gig/shift success, attendance/performance, job advancement; 25/80/190, no gains from application-clicking or simple day passing. Preserve existing employment schedule, salaries, warnings and performance.

**Business:** legitimate, actually managed and profitable business operation; 20/70/180, use active operational outcomes and sensible per-day caps, not buying/selling same asset repeatedly. Keep current existing businesses accessible under present legitimacy/cost rules, do not retroactively gate prior purchases.

Award meaningful partial XP for genuine failures where specified, but **never advance successful-operation milestones on failure**. Reuse existing `EventLog`, RNG and relationship/reputation/heat systems; transparent XP/achievement records for tests and UI. Ensure old `Progression.ts` influence→crew capacity continues to work.

### Equipment / rank eligibility

Implement persistent equipment inventory/equip state, visible in inventory with strong validation and backwards-compatible saves. These are fictional in-game tools, not retail goods, and not available via the existing stores.

| Item | Type | Attack bonus | Defense bonus | Minimum Combat rank |
| --- | --- | --- | --- | --- |
| **Law-19** | Semi-automatic handgun | +2 | +1 | Certified |
| **Law-19 Switch** | Fully automatic handgun | +5 | +5 | Stepper |
| **ARP** | Semi-automatic AR | +5 | +6 | Gravedigger |

Equipped modifiers enter applicable simulated criminal/self-defense checks; ownership alone grants no bonus, ranks/skill/relationship/risk still matter, and neither weapon ownership nor purchases grant Combat XP. No made-up open-store firearm vendor. Future story/contact rewards can grant these; existing legal routes remain playable without equipping a gun. Test invalid equip, rank changes, save/load and multiple gear handling. No combat animations or weapon meshes required in this GOAL.

### Existing systems integration

Audit all uses of `.skills.recovery` in `ActionEngine`, `Danger`, `StreetEconomy`, `CrewAgency`, existing NPC AI and characterization. Right now `Danger.initiateConflict` counts merchandise transactions as fighting experience — **remove that crossover** and replace with correct Combat/Robbery/Survival context without trivializing Quanny. Use Social in mediation, Work in employment, Trapper for deal economics and distribution, Survival for defensive outcomes, Leadership for assignments, Business for legitimate operations. Initialize existing named NPC ranks to their actual established competence conservatively (Quanny is a dangerous experienced Blocc Boys member; Mega is formidable; Flacco inexperienced). Do not assign every NPC identical novice competence. Preserve nonlethal initial Quanny shooting and existing lethal retaliation rules.

## 2. One-AP board-based trapping sessions: real feature, not a mock-up

### Physical access and UX

Street trapping is **only initiated while player is actually physically standing at an active street-work location on the 3D City board**. Current locations with `links.street = true` include `rio.angels-mural`, `south.the-lot`, `reservoir.boarded-house`, `nawf.el-station`. Use these first; do not add new locations solely to pad count. Travel via existing board movement is currently free, but arrival danger hooks still run. Clicking another location remotely may path the player there first, but do not start trapping remotely/in a different zone/by picking a dropdown.

**Actions > Streets / StreetWork menu must no longer directly sell goods or select remote transaction markets.** Replace direct buttons with stock, supply, financial/risk summary and navigation instructions to eligible City places. Non-street board locations likewise cannot trap. Keep Connects, Wallet, Jobs, related activity management available. Other gameplay actions remain operational until they are converted in future GOALs. Do NOT move every action to the board in this one assignment.

### Session structure

- Player visits a street spot and taps **Start trapping — 1 AP**. Validate physical presence, active player, no current encounter/hospital/lock, possession of an actual positive inventory lot, local access/territory restrictions, daily market capacity and 1 AP. Start is a transactional state transition charging exactly 1 AP **once**; no other AP per prospective buyer.
- A session has **4–6 potential visitor beats** chosen/persisted deterministically, generally **30–45 seconds** visual playback on iPhone, tunable data values. These include passing strangers, real prospective buyers, sale, failed sale, and occasional suspicious/witness beat (e.g. `Word's getting around that you're working this block`). Not every person buys, and some are not buyers.
- Player visibly remains at their location. **3D figures actually approach, pause near the player, and leave**, reusing the existing lightweight procedural character/crowd figure and scene/motion APIs (no new paid assets, no heavy city redraw loop). Show concise floating, skippable/reduced-motion status and session outcome feedback. Subtle timing variation; no repetitive modal per buyer. This is a City activity, NOT a series of menu button pop-ups.
- Each qualifying buyer purchase changes real held lot units, cash, market usage/activity, transaction ledger, relevant exposure/heat, crew/supplier obligations if applicable, and Trapper XP. A genuine attempted failed transaction may cause no sale, cash loss, inventory loss, suspicion, or other existing abstract consequence; failed XP +0.2 only for real attempt. Pure passers-by and cosmetic motion alter nothing. Sum results accurately (cash, units sold/lost, XP, heat, pending obligations); no phantom units, duplicated revenue or inventing cash.
- Buyer success **is random independently of Trapper rank**, weighted by real location demand, competition, pressure, time/state, presence/affiliation, and current danger. Skill only increases economic outcomes/access/capacity/margins. No guaranteed minimum sales; a full 1-AP session can produce zero revenue.
- Police patrol, witness/snitch report and rival threat are rare **contextual** risks grounded in existing CriminalExposure and Danger/territory logic. A witness-warning increases local exposure appropriately; possible police arrival and hostile encounter use real existing arrest/injury/war logic, not random guaranteed death and not simply narrative text with zero effect. Render warning/patrol/rival arriving when feasible using same lightweight actor system. Do not make citywide turf warnings interchangeable with immediate guaranteed combat.
- The player can **leave/end session early** (forfeits spent AP) and keep already resolved effects; unresolved later visitor beats never execute. Serious interruptions stop or pause the session and open the existing relevant encounter/action flow, not continue while hospitalized/arrested/dead. On normal end the player remains on spot with AP left (if any), can start a second session same spot, move to another street spot, or do something else.
- Respect existing 2 AP/day, local daily market capacity and at most appropriate daily street opportunities; an active session cannot be duplicated or run concurrently. Never grant a free 3rd session through repeated clicks, UI remounting or reloading. Do not allow sell-spam through any legacy route. NPC autonomous street decisions still work under normal simulation without having to physically watch every NPC session.

### Implementation contract / persistence / determinism

Keep the mechanics in `src/systems/` (e.g. `StreetSessions.ts`) with a pure/snapshot, testable state machine. Persist an `activeSession` with unique ID, location, zone, lot ID, start day, paid AP marker, queued durable visitor outcomes or determinate RNG seed, current beat/cursor, settled event IDs, resolved totals and pause/stop state. A separate UI/board presentation layer renders already-grounded events; **visual animation timing must never be the authority for money, inventory, AP, arrests or XP**.

Use explicit functions such as `validateStartStreetSession`, `startStreetSession`, `advanceStreetSession`, `endStreetSession`. Each state transition validates session ID and cursor, atomically commits once, and persists. Save/resume mid-session must resume at the next unprocessed beat without changing or rerolling outcomes. iOS background/tab change pauses animation/timing; return can continue or exit. Don't auto-resolve events while hidden. Reload cannot farm outcomes or XP; stale/repeated taps do not double-run a beat. Existing PR #3's input guard and hidden-board pause must survive. Deal with ending a turn, incarceration and encounter overlap correctly; no soft locks.

Reuse `StreetEconomy` underlying calculations via an extracted shared per-buyer resolution function rather than creating an independent second economy. Preserve existing lots, pricing, supplier debt, `Consignment` directional receivables and Quanny's 6-day commitments. Existing generic `crime` action currently does street selling for both player and NPC: prevent PLAYER from invoking that as an off-board shortcut while retaining legitimate NPC simulated activity and existing test intentions. Integrate with `GameState` and `SaveSystem` schema safely.

**Claude-owned board integration**: Prefer implementing a narrow event-to-scene adapter and transient rendered visitor actors with existing procedural meshes, instead of editing architecture/camera/viewport systems. If touching `src/board/**`, keep files and diff minimal, add dedicated tests, explicitly explain in PR for Claude review. Any board art/camera optimization belongs to Claude. Session mechanics must work even if WebGL is unavailable: provide a basic non-3D accessible fallback **with exactly same simulated persisted outcomes**, not off-board instant selling.

## 3. Skill interface, inventory and records

- Add a responsive, readable **Skills** view within an existing player/People/profile panel (avoid bloating the top-level City nav) showing eight tracks, four ranks, real XP, next gate, missing milestones, modifiers, and locks for future story content. For Set members, show known capabilities and their own progressing skill ranks; do not leak unknown NPC private information.
- Current inventory/Wallet must show Pink Magic lots, real supplier/consignment obligations, equipment item inventory, equipped state and bonuses; retain provenance and currency accounting.
- City location sheet must clearly show eligibility, risk, available Pink Magic on hand and Start Session control. Display unobtrusive current session beats and end-summary. Actions menu is overview/route guidance only.
- Avoid misleading guaranteed sale percentage, unlimited progress bar `0–100%`, decorative useless controls, or generic story choices. Location-specific conditions and actual inventory matter.

## 4. Validation — non-negotiable

Implement substantive unit, integration and iPhone 13 (Chromium AND WebKit) browser tests. Minimum explicit coverage:

1. All eight skill rank/XP schemas, seeded player/NPC ranks, promotion gates, rank boundaries, current XP targets and no fake content unlocks.
2. Pink Magic XP: +0.50 real sale / +0.20 real failed deal / 0 no offer, fractional integer accounting, product-tier based rewards without tier-name inventions, max and anti-spam; 30/60/180/365-day simulation trajectories (no easy 60-day mastery).
3. Combat/robbery awards for genuine attempted outcomes, partial failures, success milestones, equipped Law-19/Switch/ARP rank requirements and exact +2/+1, +5/+5, +5/+6 modifiers; nonviolent careers intact.
4. No combat skill from selling merchandise, and no Trapper skill from fighting; genuine survival, social, work, leadership and business gains correctly attributed.
5. Full physical street gate: board presence, off-site prevention, transit to spot, rival access, lack of inventory/AP, daily capacity, no old Actions-menu remote sell.
6. Exactly one AP/session, 4–6 stored beats, correct per-beat inventory/cash/XP/heat/outcomes, legitimate no-sale session, local vs cross-zone markets, return for second session, cancelled session forfeits AP and doesn't execute future beats.
7. Snitch warning, police encounter, rival interruption and consequences use grounded existing systems and are not arbitrary guaranteed fatalities; abort/encounter/pause behavior.
8. Save/reload **mid-session**, deterministic no-rerolls, double-click defense, stale touch rejection, background/unmount/remount safety, End Day and confinement handling, negative cash/stock prevention.
9. Existing Chains, Mega, Quanny first contact, Lil Jay's Market, Quanny directional consignment and debts, danger, employment, factions, crews, current board controls and recent input-freeze regression all stay valid.
10. City session visuals show real approaching/leaving figures on iPhone emulators, responsive touch & reduced motion, WebGL-fallback accessible. Capture browser screenshots/video or machine-verifiable test artifacts.

Run `npm test`, `npm run build`, targeted Playwright specs, and the full `npm run test:e2e` if environment permits. **Baseline any full-suite failures against untouched current Lab main** (not anecdotes or historical lists), list exact failures, do not mute/drop tests to force green. Unit and build must pass. Full known flaky failures may be documented only when independently reproduced on main; new failures must be fixed. Test real browser flow on iPhone emulation; physical iPhone still requires owner later.

## 5. Execution and handoff

Implement every section of this GOAL, not a sequence of separate feature pitches. You may iterate and run tests internally as many times as necessary. Don't stop and ask the owner to make routine technical choices, provide small interim prompts, or use multiple PRs. Keep technical decisions and balance tables in repo docs; do not spend days polishing cosmetic details or generating new assets.

Before PR: fetch/latest Lab main, merge/rebase into **this feature branch**, resolve all conflicts there, rerun unit/build and relevant browser checks. Keep any Claude board changes and input-guard protections. Only when the whole feature is ready, push branch and open **one** PR to Lab main. Label every Claude-owned file edited and request review/board compatibility check. **Do NOT merge the PR, push main or deploy.** Claude integrates it. Report commit SHA, PR, test counts/failures, gameplay examples, files, migration compatibility, any truly unimplemented future *content* hooks, and exact iPhone playtest instructions. No claims of delivery until merge/deploy confirmed by Claude.

**Guardrail:** if genuinely blocked by an unresolvable environmental dependency, report that specific blocker and the committed state. Do not silently downgrade the visual session to a menu, or describe missing features as implemented.
