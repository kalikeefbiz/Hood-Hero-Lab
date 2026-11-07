# BLACKHOUSE — GOAL 013: ROBBERY CAREER, PHYSICAL LOOT, CREW JOBS & NEIGHBORHOOD CONSEQUENCES

Project: Hood Hero / The Stixx
Repository: kalikeefbiz/Hood-Hero-Lab
Assigned feature branch: codex/goal-013-robbery-career
PR target: Lab main; Claude reviews and merges. Do not self-merge or deploy.
Baseline before assignment: b63eaab48be436f19b3671b5dadf6d8d7f9eb5ba
Status: owner-approved implementation specification, 7 Nov 2026.

## A. AUTHORITATIVE DECISIONS AND EXECUTION RULES

Implement ONE integrated GOAL 013 as an actual playable expansion to the GOAL 011 robbery engine and GOAL 012 physical inventory. The owner has approved the design below. Work autonomously, build and test the complete gameplay rules and narrowly necessary integration, then deliver a PR for Claude's City/visual review. Do not replace the existing game or make multiple fragmented GOALs. Do not spend implementation time redesigning unrelated gameplay.

Read AGENTS.md, docs/ACTIONS_TO_CITY.md, GOAL 011/012 documentation and tests, src/systems/Robbery.ts, Inventory.ts, InventoryExchanges.ts, Incarceration.ts, Danger.ts, CrewAgency.ts, Skills.ts, StreetEconomy.ts, StreetTypes.ts, StreetLife.ts, StreetAccess.ts, src/content/inventory.ts, src/board/locations.ts and board presence/people APIs, src/core/GameState.ts, src/persistence/SaveSystem.ts, src/ui/exchanges.ts, and all applicable browser tests BEFORE coding. Confirm current Lab main and pending PRs again at start, then work from latest main on assigned Codex branch.

Respect ownership:
- Codex: content definitions, rules, NPC agency, loot registry, robbery/crew state machines, economy, heat, save migration, tests and pure City-facing APIs.
- Claude: 3D board and neighborhood building placement, visuals, City person/place cards, robbery/lock/loot presentation and final iPhone polish. Supply Claude with stable locations, IDs, data, API/error contracts and a review checklist. Only minimal isolated adapters in Claude-owned files when essential to test; identify every one in the PR. No ActionsHub/Wallet shortcuts to execute crimes. No 3D city rebuild or unauthorized art generation.
- Original production repo kalikeefbiz/Hood-Hero remains untouched. Feature only in Lab until owner acceptance.

Central guiding principles:
1. Strong-arming a normal person is **petty crime with serious risk**: $25–$75 cash at most on an ordinary successful cash drop, sometimes an additional petty object, and sometimes no bonus item. It is NOT a reliable path to instant wealth.
2. High-value strong-arming of a **recognized gang member or plug** is a DIFFERENT, dangerous opportunity: potentially larger cash, actual fictional merchandise stock and valuable jewelry, but substantial personal repercussions. Do NOT use the ordinary civilian payout for this category.
3. Story-driven character choices and persistent physical presence matter more than menu button farming.
4. Home invasions are crew jobs (at least one credible, willing real NPC partner). Only strong-arm and liquor-store jobs may be performed SOLO. Advanced armed stickups also require a crew.
5. Different operations play differently. Do not make an unrelated three-symbol memory puzzle the required core mechanic for every robbery.
6. All equipment and loot occupy real GOAL012 on-person slots and load. Required gloves/masks and other designated prep consumables are consumed when the attempt BEGINS, including failed/abandoned jobs. Guns are retained through normal success/failure, but all ILLEGAL items physically carried by an arrested character are seized on arrest.
7. One attempted home invasion per neighborhood at a time with a shared four-full-day cooldown. Different houses in that neighborhood do NOT bypass the lock.
8. Individual characters may demand a split after learning about a robbery in their neighborhood; refusing creates PERSONAL conflict and possible escalation, NOT automatic faction-wide war.
9. Future endgame bank heists ($20,000–$45,000 cash and gold/silver coins/safe-deposit valuables) are design canon but NOT active, profitable GOAL013 content. Enterprise/business endgame must exist first.

## B. ROBBERY CAREER / RANK CATALOG

Use existing Robbery ranks and milestones; do not rename or reset current player progression:
- Rank 1: Strong-Arm — multiple small civilian opportunities per hood; optional high-risk strong-arm of an eligible known criminal.
- Rank 2: Home Invasion — 2–3 distinct houses per eligible neighborhood, crew required; **Liquor-store robbery opens alongside Home Invasion**, not at Rank 3. Liquor-store is solo-capable and uses the existing two liquor stores where possible.
- Rank 3: Armed Stickup — at least one more demanding, distinctly interactive commercial crew operation, with new prerequisites and suitably higher (but not endgame) rewards. Use plausible existing City commercial locations rather than creating a bank or casino.
- Rank 4: Major Score — remain gated, no free placeholder score or artificially unlocked wealth. Future planning only.

Correct GOAL011's original "three successes then one home lead then everything is exhausted" logic: repeating distinct eligible jobs after cooldown and meeting contacts is how a player can earn 9 genuine qualifying successes and the appropriate XP/invitations for Rank 3. Keep the existing actual Robbery XP and Combat XP/milestone rules unless a documented balance test shows a specific problem. Rank gates must be REACHABLE through playable content; no farmable zero-consequence tutorial shortcut.

Include sufficiently varied authored job definitions per tier; recurring opportunities can be generated deterministically from APPROVED eligible location/target pools but must vary cash/items, circumstances and consequences. No invented new major gangs or characters. Existing protagonist starts unaffiliated; legal path must remain fully viable.

**Five ordinary strong-arm zones**: use grounded actual public gathering locations that Claude can place/approve. Initial suitable existing physical anchors:
- Downtown — Designer Drop storefront / shopping area (high police baseline).
- Rio Gabriel — Courtyard apartments (retains historical GOAL011 intro job).
- Southside — The Court.
- Reservoir — The lot court.
- Nawf — Nawf Ave station.
No generic arbitrary "rob anywhere" button; require presence and valid opportunity/encounter at a specific place. Ordinary target opportunities are generated via authored street visitors, not an inexhaustible loot box with the same named person robbed repeatedly; limit attempts by day/location and track repeat victim memory.

**Residential home invasion blocks**: 2–3 distinct houses clustered on ONE identifiable residential block for each of Rio Gabriel, Southside, Reservoir, and Nawf (8–12 targets total). Designs should match neighborhood architecture: Rio stucco/low-rise suburban homes, Southside brick/rowhouses, Reservoir weathered suburban houses, Nawf denser residential houses. Claude constructs/places the 3D homes and visual block labels; Codex authors stable target records, loot tiers, interaction/cooldown rules and integration contracts. Houses must be individually distinguishable with varied item pools and risk. No extra Downtown home invasion block required now; preserve Downtown commercial identity.

**Neighborhood home cooldown (owner lock):** one HOME attempt at any house in a zone locks all eligible houses in that zone for the next FOUR COMPLETE in-game days. Attempt started on day D means next home attempt available day D+5. Failure, partial result, retreat, arrest and interrupted attempt still start the cooldown; changing target or supplier doesn't reset it. Other zones have their own cooldowns. Show next eligible day and source in City UI. Do not allow reload, multiple taps, changing character or off-board APIs to bypass. Existing jobs may expire during cooldown; communicate this before a player spends AP.

**Store/liquor**: Rio Gabriel Liquor (rio.liquor) and Back Street Liquor (south.liquor) are currently present. Solo-capable with basic prep and contextual owner/witness confrontation (not dial puzzle). Pay **$125–$225 cash** on full success, chance of smokes/booze quantities that really fit; no automatic profitable repeats on the same day. Do not confuse this Rank-2 opening with generic Rank-3 Armed Stickup; keep clear type definitions and stable migration.

**Advanced Rank-3 commercial**: one coherent distinct crew-only commercial job (e.g. existing downtown storefront/warehouse if location actually compatible), requiring appropriate rank, trained/equipped partner and preparation. Author a real session path, not an inaccessible tier label. Choose tunable rewards in the hundreds/low thousands based on economy modeling (NOT $20k+).

## C. ORDINARY VS HIGH-VALUE STRONG-ARMS

Ordinary targets:
- Realistic small cash proceeds **$25–$75** when cash is obtained; some outcomes produce item-only/partial rewards, no fantasy windfalls.
- Optional seeded incidental loot: inexpensive phone, wallet contents (cash credited, not a cash item), smokes, booze or occasionally a plain small chain. A rare chain is worth more than ordinary small goods, but does not approach the guaranteed return of higher-tier jobs.
- Attempt itself can raise heat/witness memory, cost AP/consumables, cause injury or arrest and damage civilian relations. A robbery remains dangerous regardless of payout. No victim spawning infinite replacement valuables.

Named criminal target opportunities:
- Player may specifically target **eligible physically present gang members or street plugs** when a believable encounter/lead exists. This is riskier than robbing a civilian. Do not permit remote targeting just because someone appears in the contacts list.
- Potential loot: larger but resource-bounded cash stacks, fictional Pink Magic from an actual held stock/resource pool, and distinct higher-value jewelry (rare serious chain). Use the TARGET'S actual held money/stock where represented; debit it when taken. For loot not modeled in the target's inventory, allocate it once to a finite persistent authored target stock pool with a cooldown. Never mint an unlimited stolen Pink Magic lot without reducing the source.
- Any stolen Pink Magic becomes a distinct **stolen** player-owned economic lot linked to source, original owner, event and legal provenance, without an invented supplier debt to the victim. Real consignment liabilities from PREEXISTING supplier packs remain unaffected. Do not lose or duplicate stock through Set transfers, safes, confiscation, resale or sales.
- A target can recognize the player and pursue a personal grievance, retaliatory encounters and refusal of future business. Robbing a plug should meaningfully affect supply relationship and future introductions, not just lower an abstract reputation bar. Preserve Quanny's authored first-contact/repair constraints. Pablo is unavailable as a direct ordinary target to outsiders; no bypass of his GA-membership/Big-Dog rule. Mega's unique MEGA chain cannot be duplicated or stolen unless the Chains incident's actual durable ownership history supports it. Ordinary expensive jewelry may resemble a chain in VALUE, not canonical identity.
- Successful theft of a named NPC's valuables opens **two different disposition paths**: (a) fence eligible physical goods at a City pawn shop, or (b) make an in-person offer to SELL the stolen item back to that exact original owner. The return-for-payment path must be a real transactional choice with price, original-owner validation, physical item, capacity, NPC available cash/wealth, exchange history, and an explicit consequence preview. A completed sell-back awards configured personal notoriety/street reputation for audacity and **GUARANTEES an active personal beef with that original owner** even if they paid. No automatic entire-faction war or uncontestable guaranteed lethal encounter. Selling to a pawn shop does not automatically create the special sell-back reputation bonus.
- Do not allow returning a different generic lookalike chain to its supposed original owner, selling the same stolen item twice, turning a stolen chain into an innocent Chains settlement, selling an already confiscated item or using another NPC's debt as payment. The original owner may refuse if funds or availability are absent; no forced NPC bankruptcy. A refused offer never grants a fictitious successful transaction/reward.
- Targeting a faction member alone doesn't create unconditional full-gang beef; personal NPC hostility and discovered witness/event consequences must be grounded. No real-world tactical guidance.

## D. PHYSICAL LOOT, LOAD, SHOP & CREW SHARES

Extend GOAL012's item registry, schemas, capacity rules, icons and projections with coherent fictional property categories:
- ordinary phone (load 1), plain jewelry/chain (load 1), high-end chain (load 1), game console (load 5), desktop/laptop PC asset (load 8), antique art (load 10); leverage existing smokes/booze and Pink Magic. Wallet cash and victim-wallet cash remain currency, never occupy slots.
- Tune prices centrally. Starting pawn-payout targets: PC **$150–$300**, console **$90–$180**, typical jewelry **$120–$400**, antique art **$300–$900**. Certain rare high-end chains may be more valuable but should be uncommon and tied to coherent loot tier. Store a seeded item's estimated value and provenance at acquisition, not rerolled upon pawn visit. The pawn's offer is roughly **55–70% of estimated retail value**, modified modestly by relationship and heat, so the target pawn payouts are consistent (do NOT take 60% a second time from already quoted pawn-payout bands). Distinguish nominal estimated value from offered cash.
- Add REAL City pawn shop sale at the EXISTING 'reservoir.pawn' location. It is currently marked 'planned', and has no implemented pawn action; Claude must activate and present it. Sales require actual player presence, accepted physical stolen valuables, space/state validation, real item removal, provenance/memory/history, and **illicit** proceeds. Not every item can be sold there (Pink Magic/illegal weapon exclusions). Allow item-specific limits, price preview and optional reasonable finite shop purchasing ability, but do not invent a whole second black-market career.
- Houses generate diverse and seeded contents including CASH plus choices among PC, console, jewelry and rare antique art. The same house cannot regenerate loot by reloading the session. Different houses should feel different; high-value rolls are uncommon. A player might leave with only small proceeds; a "big find" must feel exceptional, not guaranteed.
- GOAL012 dual capacities always apply: player **12 slots / 20 load**, Set member **8 / 15**, residence safe **24 / 40**. One PC consumes 8 load; one piece of art 10. Selecting loot uses remaining on-person capacity. Crew members carry goods in their OWN slots only if physically assigned to the active job and the rules permit that allocation. A duffle is an actual prep/possessed item, not magic capacity or infinite extra safe space. If a special carry bonus is ever included, define/tune it as a strictly limited and validated temporary bonus, not free unbounded storage.
- **Loot-selection interface:** show revealed items, their value/load, carried capacity, choose which items to take, and option to depart with current take. Continuing to search imposes a legible game risk/time/heat tradeoff. No duplications by splitting, swapping, safe deposits, abandoning sessions, backgrounding or raid interruption. Cash handling and physical item handling must settle ONCE. Lost/captured loot never persists in the wrong inventory.
- Cash paid out at settlement is illicit. Physical loot is NOT automatically converted into cash. Reward XP only from real committed participation/success, not browsing loot or opening a house.
- **Crew cuts:** At least one real willing criminal contact or actual Set member accompanies home invasions, and at least one on advanced Rank-3 jobs. Use the GOAL012 'heistReadiness'/'inviteHeist' framework but extend the invitation to PERSISTED accepted job participation, participant availability, location/arrival readiness, equipment held and risk/resolution. Mere event-log invitations without session participation are inadequate. Quanny is an eligible potential partner only after earned relationship/business conditions; respect his hostility and independent agenda. Player cannot recruit an arbitrary unconnected person into a crime for free.
- Crew member combat/equipment affects actual job chances and outcomes. Real injury/arrest can affect crew too; no scripted certain death. A voluntary partner's agreed share should be visible up front. Initial configurable one-partner share target **20–25%** of realizable proceeds. Payout on immediate cash is settled once; goods handled later create explicit pending split/share obligation or a transparent fair buyout, not free unpaid crew labor. Unpaid shares cause personal grievance/loyalty consequences. If a crew member is incapacitated or leaves, persist their involvement and claims; don't double-charge by reloading.
- Inventory equipment cannot be teleported from player Wallet to a crew member or from safe mid-job; existing same-place handover and owned-residence withdrawal rules remain.

## E. INTERACTIVE EVENTS & MINIGAMES (PHONE FIRST)

The owner likes Fallout/Red Dead-style tactile lock feedback but **not frustrating busywork**. Choose the simplest coherent mobile implementation, with an accessible alternative for reduced motion/precision difficulty.

Job-specific session templates:
1. **Strong-arm:** short contextual encounter with target reaction/witness/moral and exit decisions. No safe or unrelated pattern challenge. The player's approach/retreat choice changes consequences. Ordinary low returns; recognized criminal targets carry a more serious danger state.
2. **Home invasion:** main playable interaction is REVEAL / CHOOSE / CARRY / LEAVE. Multiple distinct reveal beats; every additional search increases abstract pressure. Only a small subset of rare jewelry/valuables is behind an OPTIONAL stylized lock dial, NEVER a hard prerequisite to receive ordinary loot or finish a house. Locked valuables can be missed without failing the entire robbery.
3. **Liquor store:** immediate tense short encounter focused on clerk response, witnesses and when to leave; no dial puzzle. Reward small cash plus smokes/booze; high police exposure relative to ordinary strong-arm.
4. **Rank-3 commercial crew job:** distinct multi-partner cooperative beat(s), a short abstract focus/coordination challenge, or a quick choice under pressure, not a reused home-dial puzzle.

Suggested optional LOCK DIAL: a fictional circular 0–100 target with limited 5–12s tactile feel/visual feedback, optional untimed mode accessible via buttons, and a bounded attempt count. Player adjusts position and taps 'try', with clear close/near/far feedback. Never teach actual lock or alarm bypass, real techniques or real access tools. All puzzle state, attempt count and seeded target persist on save, no rerolls. Failure simply forfeits the optional bonus/raises pressure rather than forcing game over or major mandatory waiting. Use touch targets >=44px, avoid tiny precision-only controls, support reduced motion and no audio dependency.

Use pacing inspired by Fallout's optional feedback-based container challenge, Thief Simulator's physical loot/storage and pawn sale, and PAYDAY's actual-objective completion rewards. Preserve the REASON each interaction exists; do not copy visuals, source, sound, level layouts or copyrighted text.

Reference research for design rationale:
- https://fallout.fandom.com/wiki/Lock_%28Fallout_4%29
- https://thief-simulator.fandom.com/wiki/Pawn_Shop
- https://www.paydaythegame.com/payday2/updates/meltdown/
- https://payday.fandom.com/wiki/Reputation_%28Payday_2%29

## F. HEAT, PERSONAL EXTORTION & ARREST SEIZURE

- Continue using GOAL011's CriminalExposure, Danger, local police, memory and relationships; no new parallel wanted meter. Heat rises from attempted and completed robberies, witnesses and repeated neighborhood patterns. Downtown baseline is highest. No artificial faction hostility just for repeatedly using a hood.
- After a credible robbery rumor reaches a LOCAL gang-affiliated or street NPC who could actually know of the activity, that character can approach the player at their physical spot/City encounter requesting a slice. Initial proposed demand **10–20% of a known/estimated recent take**, based on actual recorded profit and their personality, no omniscient telepathy. Player can pay (actual wallet transfer, lawful/illicit provenance, recognition) or refuse (durable interpersonal grievance; possible escalating pursuit and deadly beef later within existing safety rules). Do NOT make automatic extortion after every robbery or impossible debt from no-loot failures. Don't make this a forced faction toll on every citizen.
- A named criminal victim of a strong-arm always remembers confirmed direct involvement as personal grievance, and completed paid sell-back always guarantees **ACTIVE personal beef** with that victim, not mere flavor. Reconciliation requires real future story/relationship actions; no immediate automatic hostility reset. Respect existing wrong-zone/war and injury/death rules.
- Arrest via ANY existing cause (robbery, trapping, patrol, danger) must invoke one CENTRAL confiscation boundary once. All ILLEGAL ON-PERSON items of the arrested character are seized: all currently illicit firearms including Law-19/Switch/ARP, Pink Magic and any tagged STOLEN property. Equipped seized weapon is unequipped and its combat bonus disappears. Account for Set members separately if THEY are arrested. Item loss updates lots, transaction/consignment obligations and UI feed exactly once. Supplier balances remain due. Property safes (at owned sites) and visible legacy overflow are not ON PERSON and remain untouched. Ordinary legal groceries/clothing/music and legal preparation props such as unworn gloves/mask are NOT universally contraband. Do not automatically confiscate all clean cash or declare every wallet possession illegal.
- Weapons stay in their physical inventory on normal completed/failed jobs without arrest, even if preparation items get consumed. Hospitalization alone does not implicitly seize firearms; use only established loss logic unless an explicit authored event says otherwise. Other NPCs can be arrested; save-state and return behavior must not create duplicate confiscation.
- Existing user rule for fatality applies: death generally arises from authentic conflicts/beef or exceptionally rare legitimate situations, not a routine guaranteed robbery outcome or every refusal to pay.
- Handle owned merchandise when source NPC is stolen from and when player gets arrested, with precise ledger invariants and no "new stolen stock" that secretly wipes someone's legitimate receivable.

## G. WORLD, CANON & PRESENTATION INTEGRATION

Stixx City affiliations: Gabriel's Angels (Rio), Back Street (Southside), Blocc Boys (Reservoir), Blips and Mudgang/Muddy World (Nawf), Downtown initially unaffiliated; groups have individual members with personal motivations. Do not copy names of real organizations. A specific victim does NOT equal his entire organization. All missions must respect existing characters: Mega (family mentor), Flacco (potential Set), Quanny (difficult Westside contact), the unified Angels robbery trio, and Pablo (outsiders gated). The Chains aftermath is canonical and not to be rewritten.

Make targets and job sources believable: earned leads from existing contacts; opportunistic ordinary strong-arm spots; local gossip; house opportunities through qualifying ties; occasional Set member initiative. Player is not forced into a criminal route. Do not introduce a new universal Crime tab or menu shortcuts.

Claude board deliverables required after Codex PR:
- 2–3 distinguishable homes on a suburban/residential block in each of Rio, Southside, Reservoir and Nawf; each home a unique selectable target id with individual loot/risk data, a visible shared neighborhood cooldown and status. Use current 3D models when practical; propose new assets ONLY where necessary and do not block rule tests on art.
- Strong-arm presence at approved 5 City gathering places, exact in-place opportunity cards.
- Activate the pre-existing Reservoir Pawn Shop as an actual sale location. Do not invent a second unapproved pawn location.
- Liquor store interactions at existing Rio and Southside stores, compatible with ordinary purchasing/work links.
- Portrait/item slots for phones, PC, consoles, chain, jewelry, art, no placeholder slot breaking; asset needs clearly listed, not fabricated.
- Robbery session/loot-selection/optional lock feedback on a ~390px iPhone with reduced-motion alternative, City navigation, game feed, 44px targets, no interaction under HUD/nav and no permanent renderer redraw. Give Codex a stable API contract; Claude owns visual implementation and integration.

Rules must be testable without board art through stable logical target ids, physical location validation and pure state functions. If Codex must expose one minimal functional City hook for browser testing, mark it as temporary and explicitly request Claude replace or approve it; do not claim visually finished deployment until that happens.

## H. ECONOMY / REPEATABILITY REQUIREMENTS

Robbery should be the risky alternative to jobs and trapping, not universally optimal:
- Casual strong-arm gross $25–$75 plus possible petty goods against $20 initial gloves/mask (subject to existing shop prices), 1 AP for attempt and variable failure/heat. Low expected net; skill progression and character stakes matter.
- Home invasions: ordinary FULL successful realized proceeds (cash plus eventual pawn value, before supplies and crew split) initially target **$200–$600**, sometimes lower or an unusual high-value find. The higher rare antiques/jewelry should not appear every visit.
- Liquor store $125–$225 cash plus small smokes/booze bonus, with greater local heat.
- Rank-3 commercial: meaningful next step, data-driven and simulated relative to daily work/trapping, realistic carry limits and crew shares; do not inflate into bank-level payouts.
- Bank heist future $20k–$45k and safety deposit boxes/gold/silver remain unavailable. No fake payout button.
- Pawn sale comes after physically carrying goods to a live Pawn Shop; safe can hold items between trips if purchased, but only when visited. Capacity prevents taking everything.
- Supplies are bought in existing shops, take real money/AP, and consumed at START whether successful or not. Allow multi-unit buying where compatible with existing capacity to avoid unreasonable repeat-shopping AP; costs don't magically disappear.
- Neighborhood cooldowns, target depletion, witnessed/heat pressure and encounter opportunity expiry constrain unlimited daily loot farming. They must be visible and deterministic, not unexplained RNG rejection.

Run deterministic game-economy tests over 30/60/180 simulated days with jobs, trapping, normal robberies, crew cuts, pawn sales, safe storage and arrest. Check bankruptcy/softlocks, no exploitative repeated infinite source, reachable skill milestones and no economically dominant guaranteed-RNG path. Keep numeric constants in an editable single balance registry for later user tuning. Document assumptions and measured expected net returns.

## I. SAVE / TECHNICAL INVARIANTS

- Current Lab main GOAL012 schema is v11. Add explicit additive migration for new robbery target, loot provenance, region cooldown, optional mini-session, set participation, witness/extortion and confiscation records. Load existing v8–v11 saves without corrupting inventory, active GOAL011 robbery sessions, Chains history, Quanny, old lots, cash, equipment or existing properties/safes. Don't retrofit historic completed crimes into new instant loot or guaranteed grievances without actual proof.
- Replace hardcoded single job location and validation mapping with registry-driven author-approved location data. Preserve existing 'rio.courtyard' and 'reservoir.boarded-house' job IDs/legacy sessions; use explicit legacy resolver when necessary.
- Persist session cursor, per-item loot choices, all seed/rolls, participant roster, optional dial state, cooldown start, consumption, victim, cash, equipment, provenance and outcome. Reload/revisit must not reroll available goods, reset consequences, duplicate XP, reopen an expired job or convert missing prep into free inventory.
- Validate no simultaneous trapping and robbery sessions, no off-board actions or remote in-person transfers, AP exactly once, prep consumed exactly once, illegal item seizure once, same item cannot be sold twice, original-owner returned item removes real property, lender debts survive loss.
- Split inventory semantics (on-person vs safe vs NPC vs legacy overflow) from economic 'lots remaining'. All new gains are checked against capacity **before** committing loot; if player cannot fit an item, leave it uncollected or leave a valid opportunity for a later local choice, no hidden overflow.
- Unit and browser tests must cover quantity stacks and physical load, Set companion equipment effects, personal beef changes, original owner recognition and cash, named chain uniqueness, pawn pricing, partial loot, home cooldown all houses same zone, different zone independent, consumable usage, no automatic firearm use, confiscation from all arrest causes, old-save compatibility, physical City enforcement, mobile/WebKit and session interruption/background recovery.

## J. ACCEPTANCE & DELIVERY

Minimum independently meaningful acceptance flows:
1. Fresh game still completes Chains / work / Mega trap tutorial. Existing GOAL011/012 gameplay preserved, Quanny and the Chains trio unaffected.
2. Ordinary strong-arm available in each of 5 zones at an actual physical gathering place: outcomes include $25–$75 cash and occasional small item, risk/heat, no arbitrary mandatory puzzle, no infinite identical victim. Verify 5 distinct locations in tests.
3. Eligible gang member/plug strong-arm: higher and bounded real source loot, theft state, individual hostility, optional PAWN or sell-back to ORIGINAL owner. On completed sell-back guarantee active personal beef and real reputation change. No automatic gang-wide war. Verify no manufactured second Mega chain.
4. Four district residential blocks, each 2–3 unique houses. At least two different houses in one zone are blocked by ONE attempted home for four FULL days; another neighborhood remains eligible; unlocked day D+5; failure/reload never bypass.
5. Home invasion requires at least one actual willing equipped participant. In-person invitation yields persistent job roster; companion equipment changes real chance/outcomes. Genuine item choices, load limits and cash/loot, optional short lock interaction only where a bonus item is relevant; exiting without optional challenge remains a coherent success path. Job crew cut is exact and auditable.
6. Rank 2 liquor-store available in Rio and Southside, solo-capable, $125–$225 and occasional real smokes/booze, different gameplay from home/strong-arm. Rank 3 actual crew commercial job playable when gates met; Rank 4 big heists not available.
7. Pawn Shop becomes a real legal City target id / rules API for Claude, with generated price preview and actual stolen item removed for illicit funds. Same item cannot sell twice or be returned to a prior victim after pawn. Property safe stores only in physical location and obeys capacity.
8. Every failed/success/abandoned robbery consumes designated prep; weapons survive ordinary failure but are confiscated upon actual arrest; all player or Set-carried illegal items seized from arrests outside robberies too; lawful goods, safe stock and legacy overflow preserved. Current debts remain.
9. NPC learns about activity through legitimate observation/rumor, may demand grounded 10–20% split, payment costs real money, refusal creates personal grievance and possible later escalation, not free global hostility. Resale of own property guarantees personal beef even if money paid.
10. Unit, TypeScript, production build, targeted Chromium and mobile WebKit iPhone 13 + smaller widths; persistence/reload, touch input freeze, hidden-board pause, game-ending rules, performance, AP and ledger invariants. Only call pre-existing test failures baseline when demonstrated on unchanged current Lab main, with exact engine/test.

When rules completed, supply separate detailed Claude handoff in docs (stable location IDs, JSON-like target schemas, API functions/errors, planned visuals, required art, iPhone playtest route). Open ONE implementation PR against latest Lab main. Provide commit SHA, PR, file ownership crossover, test pass/fail counts, baseline evidence, migration notes, economic balance data, deferred content and true integration status. Do NOT self-merge, deploy, or claim final presentation is complete until Claude completes it.

Owner's design is the authority. Avoid asking for additional approvals for routine technical choices. If a requirement cannot be completed without a Claude-owned board surface, implement and validate the logic, document exact stable hookup and do not fabricate or silently skip the feature. Endgame business/enterprise and major bank heists remain future GOALs.
