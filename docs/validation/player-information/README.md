# Player information correction

This change adds a read-only presentation boundary in `src/presentation/PlayerInformation.ts` and applies it to the existing City-first UI. Actions still occur at their current places/people. Simulation actions, random rolls, loot generation, AI decisions, economy, progression, persistent IDs and save schemas are unchanged. No migration is needed; legacy records are translated when displayed and retain their original text in saves.

## Disclosure rules

- **Explicit:** player cash, owned quantities/slots/load, equipment stats, earned ranks/XP, public progression requirements, prices, wages, contracts, repayment balances/deadlines, agreed crew shares and actual completed exchanges.
- **Contextual:** qualified relationship impressions, visible neighborhood activity, danger and police attention, general potential loot categories, unsettled streets and uncertainty about success.
- **Hidden:** target pools, private rolls/seeds, unopened containers' contents/value/load, NPC traits/intentions, exact cooperation/relationship gates and future AI plans. Observation membership still controls which events/history can appear.

`robberyPlaceView` deliberately omits pools, numeric risks and cooldown/job records. Its `ref` is a command handle, never a display label. The neighborhood may describe categories shared by a type of opportunity; individual houses do not forecast their contents. `robberyDiscoveryView` uses the existing persisted search cursor and dial-open state. Seeing a safe is not seeing inside it. Searches/opening the safe reveal real generated goods; rendering does not generate discoveries or advance RNG.

`actionView`, relationship/market/danger helpers and event views keep the same disclosure rules across paths. `playerText`/`playerReason` translate legacy human-readable records, hidden threshold explanations and technical identifiers. Separate supplier agreements receive receipt labels (`pack 1 from …`, `pack 2 from …`) so removing debug IDs never merges debts or loses their individual terms. This compatibility translation supplements structured projections; it is not the mechanism that hides loot or private events. DOM references used for command routing and persistence are not display copy. This is a player-experience boundary in a local client game, not an anti-cheat/security boundary against developer tools.

## Affected surfaces

| Surface | Disclosure change | Facts retained |
| --- | --- | --- |
| City target cards and house markers' inspector | Neighborhood loot categories; per-target contents unknown; contextual warnings and unsettled streets | Place/target names, earned job expiry, route to real interaction |
| Active robbery, safe, pause/resume | Real search discovery; locked containers opaque; contextual pressure | Discovered quantities, value/load, carriers' capacity, taken goods, actual loot, dial feedback/tries |
| Person sheet, People profile/list, Actions/Connects, Set | One qualified relationship impression; no exact private scores or NPC XP ledger | Public identity/affiliation, capabilities, shared history, player XP, crew equipment |
| Action cards, compact City tiles and outcomes | No exact computed success odds; shared contextual eligibility guidance | AP, prices, wages, public standing/rank/preparation requirements, possible consequences |
| Crew conversations and supplier dialogue | No private consent/reliability forecasts; receipt labels instead of agreement IDs | Quoted compensation, 15% partner share, 25% robbery share and goods buyout, exact debt terms |
| Jobs and employment summary | Employer attitude contextual; no private trust/performance scores | Wages, workdays, next shifts, warnings, earned income and attendance policy |
| City trapping start/playback, Street overview | Approximate demand/competition/pressure; no pre-generated visitor total or lot IDs | Owned stock, supplier, received day, balances/deadlines, price estimate, actual sales/cash/XP |
| Wallet, inventory, safe/residence, member transfers | Human job/place/receipt names; shared error presentation | Exact slots/load/quantities/equipment, transaction history, cash/debt/property rules |
| Neighborhood strategy, organizations, businesses, retirement | No exact faction influence components, candidate clocks, AI plans/budgets or private sponsor/successor scores | Known control/contestation, public authority/standing requirements, contributions, business prices/revenue/expenses/history, retirement requirements |
| Encounters, combat/danger, hospital and recovery | Contextual risks and translated explanations; source/outcome events must be observed | Actual injury/custody/treatment, choices, payment obligations and observed consequences |
| Activity, Journal, shared memories, notifications, response feedback and endings | Translate legacy IDs/thresholds/modifiers; exclude private source/latest events | Witnessed chronological history, agreed terms and completed outcomes |
| Game/save information, both HUDs | No RNG seed; heat contextual in visible and accessible text | Save/load controls and semantics, exact cash/AP and owned resources |
| Optional street-life conversations and tutorials | Authored player-facing conversation labels; no debug scene keys or future trigger dates | Existing dialogue, canon, rewards and City routes |

## Validation and ownership

See `results.md` for exact commands, outcomes, baseline evidence and environment limitations. Regression coverage compares pre-discovery output while varying hidden loot/cash/rolls, exercises search/opening and save/load, renders multiple career/menu/encounter surfaces, preserves distinct debt receipts and known requirements, and guards against direct UI imports/reads of RNG, future rolls, target pools or probability functions. Mobile browser cases begin in City, discover actual loot, pause/reload and visit all navigation paths.

Claude review is required for the narrowly scoped text/adaptor changes in `src/board/ui/BoardPanels.tsx` and `BoardHUD.tsx`, plus the application-level UI. They replace private relationship/heat values, sanitize business tooltip errors and risk explanations; they do not change renderer, layout, camera, models, locations, people placement or interaction wiring. No new board integration, place or action is required. No production repository, save key, Pages workflow or deployment setting was changed. The branch must not be self-merged or deployed.
