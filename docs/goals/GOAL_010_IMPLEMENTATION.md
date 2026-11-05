# GOAL 010 implementation and review guide

Review target: Lab `main`. Nothing here authorizes merging or deployment. Claude owns and must review the board adapter.

## State and progression

Save schema 9 reads both v8 and v9 envelopes under the unchanged `blackhouse.hoodhero-lab.v1` manual/auto keys. Migration adds independent `Character.skillProgress` and `equipment` to every character, including historical saves missing Quanny. Wallets, lots, directional debts, six-day commitments, crew, relationships, physical position and Quanny history remain intact. Historical merchandise text is renamed on v8 migration. Latest main’s optional `VITE_SAVE_SUFFIX` is preserved: the empty default retains existing Lab slots, and `/next/` can use isolated preview slots. Unknown versions and malformed XP/equipment/session state are rejected without overwriting saves.

`Skills.ts` centralizes all eight tracks, cumulative hundredths-of-XP thresholds, rank names, milestone checks, awards and future operation hooks. Ranks are derived from the canonical XP plus milestones, preventing stale cached ranks. Awards carry a category-qualified durable outcome key and day. No UI open, buy-weapon, transfer, application or idle-day awards exist. Trust-threshold keys and information outcomes bound repeat social awards; failed buyer XP is capped at six meaningful failures/day. Supplier repayment records credible trust and a completed obligation. Big Dog additionally checks twelve completed supply lots and sales in two zones.

Legacy `social/work/recovery` fields remain intact for existing formula/save compatibility. Recovery maps only to Survival; new offensive checks never read it. Social, Work and Survival proficiency use their old numeric ability as a compatibility floor, combined with bounded canonical progression; new criminal capabilities begin independently. Named competence is conservatively seeded: Quanny Stepper, Mega Gravedigger, Flacco Uncertified. Player certification requires a future authored story flag; XP, equipment and being attacked cannot create it. Existing influence-to-crew-capacity progression remains independent.

Qualifying actual conflicts use Combat and explicit strong-arm robbery awards. Defensive, future violent-operation and robbery outcome APIs distinguish successes and partial failures. Banks require Gravedigger plus equipped ARP. Higher robbery activity access and authored drills remain unavailable future content, with explicit missing requirements. The goal adds no missions, vendors, characters or locations.

Equipment has one equipped slot and unique owned items. Law-19 gives +2/+1 at Certified; Switch +5/+5 at Stepper; ARP +5/+6 at Gravedigger. Only eligible equipped gear modifies conflict/offensive and defensive checks. Losing eligibility suppresses bonuses without deleting ownership. Inventory exposes equip/unequip and requirements; no store grants these items.

Work shifts/gigs, meaningful contact thresholds/introductions, peaceful mediation, completed recovery/escapes, successful Set outcomes and clean profitable recently managed business outcomes award their corresponding skills. Business is capped at one XP/day across businesses and needs real maintenance within seven days. Crew commerce invitations reserve a willing partner; they no longer sell remotely or charge a second AP. Shares, losses and NPC Trapper XP settle per real buyer.

## Session state machine

`StreetSessions.ts` owns immutable start/advance/pause/end transitions. Start requires an active, unconfined player, no current encounter/session, the exact physical street location, actual stock, local/territory access, unfilled daily market demand and one AP. The four existing live street spots are used unchanged. Travel still uses `moveTo` and its danger/arrival hooks. The old player `crime` and `transact` entries cannot sell, even when called directly; NPC autonomy retains the existing transaction engine.

The session persists its ID, paid-AP marker, exact location/zone/lot/partner, start day, 4–6 visitor kinds with isolated RNG seeds and durations, cursor, settled IDs, totals, last status and pause/end reason. Each cursor is validated before a snapshot is cloned. Repeated/stale starts or beats return the original snapshot. Each transaction also records session ID/cursor; save validation checks lot/presence/cursor/settlement totals. Per-visitor random draws use the stored seed and restore the city RNG afterward. Rendering never calls an economy callback.

Playback targets roughly 29–46 seconds (7.2 seconds ±450 ms per visitor). Normal buyers use shared `StreetEconomy` calculations. Demand, competition, pressure, exposure, stress, affiliation and partner relationships shape independent success; Trapper rank does not affect success probability. Rank adds $2/unit margin per rank above Peon and raises maximum committed-buyer volume from one to two at Local Plug. Existing wholesale and base retail values are unchanged; a nickel bag is a fictional presentation, not a $5 pricing rule. One real buyer awards +0.50/+0.20 XP, regardless of units. Tier reward hooks are 0.75/1.00/1.25 for future tiers, without adding products.

Per-buyer stress/exposure increments are scaled down from the old bulk action (2 stress; one-third old exposure weight). Local capacity is still six daily opportunities and AP still two/day. Passers change nothing. Witness beats increase real exposure/investigation. Contextual patrols can invoke existing custody; rivals use existing Danger history/recognition/war logic. The existing rare danger rules and initial nonfatal Quanny shooting remain distinct.

Exiting retains settled results and forfeits AP. Movement and day end cancel future visitors. Injury, custody, death or an encounter interrupt rather than continuing sales. Switching screens or hiding the document pauses playback. Reload opens a paused session at its next cursor, with explicit Continue/Leave controls. Custody, hospital and game-ending controls open the inspector even when the session had closed it; the session HUD yields to those existing flows, including after reload. No hidden-tab timer settles buyers. Skip resolves the same one cursor, through the same transition, without extra AP.

## UI and Claude-owned adapter

Actions > Streets is stock/debt/risk information and route instructions only. City street sheets show location eligibility, stock, demand, pressure, competition and a disabled reason or Start. On start, the inspector closes to reveal the scene. A compact status/control panel retains totals, optional obligation details, pause/skip/leave and a dismissible summary. People contains eight exact-XP tracks; only Set members reveal their individual progression. Wallet retains lot provenance/receivables and adds equipment.

Claude-owned files requiring explicit compatibility review:

- `src/board/BoardRenderer.ts`: adds a transient visitor layer to the existing render loop and calls the existing camera flight to frame sidewalk actors at session start; no camera architecture, layout or art changes.
- `src/board/SessionVisitors.ts`: procedural figures from the existing `buildFigure`; approach/pause/depart, disposal, reduced-motion stationary presentation. No game state or RNG writes.
- `src/board/ui/BoardStage.tsx`: one optional descriptor prop/effect into the renderer.
- `src/board/presence.ts`: cancelling unresolved session visitors on a real move, preserving all arrival hooks.

Shared review surfaces: GameState, SaveSystem/StreetSchema, App, equipment wallet, and small activity styles. The input guard and hidden-board pause are unchanged. WebGL fallback uses the same City place list, physical presence gate and persisted outcomes. No second economy or alternate app exists.

## Validation and owner playtest

Automated validation results and exact baseline failures are recorded in the companion validation report. Focused 30/60/180/365-day runs use real session, supply, debt repayment, lawful fallback work and day advancement rather than passive XP. They deliberately preserve heat, custody and supply failures; skill growth is not guaranteed just because time passes.

On an iPhone: resume an existing Lab save or start Southside; obtain a limited lot through Connects/Cuzzo. Open City > The Lot > Go here; acknowledge any development banner and finish arrival encounters. Start trapping for one AP. Watch the visitor approach, pause and depart; inspect cash, held stock, heat and Trapper records. Pause/leave, switch tabs, background Safari and reload midway; Continue must keep the same queue/cursor and AP. After completion, dismiss the summary, open Details and start again if stock/demand/AP allow. Actions must have no sell/market selector. Check People > Skills and Wallet > equipment/lots. Test the other three existing street spots only after building actual local access. Physical-device playtesting remains for the owner after Claude review; emulator validation is not a claim of deployment.
