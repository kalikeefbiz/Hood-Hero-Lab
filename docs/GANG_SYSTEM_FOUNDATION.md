# Gang System phase 1

Membership, authority and faction consequences use the existing campaign snapshot and save schema. Initiation activity, departures, diplomacy, new conflict rules and organizational management are separate design work.

## Gameplay entry points

| Contract | Owner and behavior |
| --- | --- |
| `ActionEngine.performAction` | The existing `standing` and `affiliate` actions validate the participant and spend their existing AP and time. `gang/Membership.ts` resolves standing, sponsorship, affiliation and recognition. The Set remains independent. |
| `Politics` | The existing political commands retain their costs, eligibility and effects. Promotion, representatives and succession delegate to `gang/Authority.ts`. Current numeric gates are retained. Blocc Boys authority can increase past Big Homie without assigning a King Pin. Quanny is an authored Big Homie. NPC rank is unknown where no rank is established. |
| `gang/Consequences.ts` | The write path for faction resources, contribution points, organization standing, instability and faction priorities. The owning resolver admits each outcome once through its existing action cost, transaction, commitment, control-transition or daily boundary. Raw posting is internal to gameplay. `Territory` still owns footholds and control resolution. |
| `Progression.settlePlayerProgress` | Apply Set capacity and evaluate endings at a player command or the existing daily settlement. NPC subactions inside a day leave this evaluation to dawn. Discharge is processed before the daily evaluation, and release uses the same day pipeline. |
| `gang/index.ts` | `queryGangMenu` reads the player's disclosed faction information and current Set inventory. It returns detached data including affiliation, rank, standing, known relations, observed developments, territory summaries and progress. It exposes no management commands in the view. |

## Gemini handoff

The game-side contract uses the canonical identity and location IDs from the One Living Block contract. Claude's host and Gemini's simulation can integrate it without moving any gameplay writes into the sim.

1. Read `queryGangWorld(state, actorIds, afterEventId?)` from `src/systems/gang`. It supplies the V3 clock snapshot, requested character identities, rank when established, affiliation, daily availability, status, directed relationships, faction relations, territory summaries and events observed by those characters. Pass the returned `eventCursor` on the next query for the same actors. Use an initial read on load or when adding actors to the subscription. The returned snapshots are detached.
2. The trusted host reads Gemini's verified co-presence immediately before acting. Pass an observation with location ID, optional property ID, authoritative day and minute, and `peopleHere`. Include the acting NPC and any physically targeted NPCs. The host supplies coordinates and verifies range. The game still applies its canonical location and contact gates.
3. When the host is authorized to submit proposals, call `executeNpcLocationIntent` in `src/city/LocationInteractions.ts` with the actor ID, intended game day, existing location command and fresh observation. The command goes through existing eligibility and effects. A stale observation or consumed daily action leaves state unchanged. On acceptance, use the returned snapshot and event IDs. NPC actions use the canonical daily budget and advance neither player AP nor time.
4. The existing daily AI still operates. Both paths share the same daily availability check and action consumption. Future scheduling work should decide which supported actions the host proposes and when, using one owner per action. The simulation receives no independent faction, finance, injury, custody or relationship writer.

Sources for this seam are [Gemini's living-block findings](GEMINI_LIVING_BLOCK.md), [the NPC simulation brief](GEMINI_SIM_BRIEF.md), and [the merged V3 clock contract](WORLD_CLOCK_V3.md).
