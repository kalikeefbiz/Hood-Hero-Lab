# Gameplay and world simulation integration

This foundation extends World Clock V3 (#68) and the Gang System Foundation (#86). Campaign gameplay and Gemini's physical simulation share character IDs, campaign time and committed outcomes. The strip preview remains an isolated client. Wiring the live host is a separate integration step.

## 1. Canonical Reservoir population

`src/content/reservoirResidents.ts` registers all 22 additional IDs from [Reservoir canon §D](RESERVOIR_CANON.md). `registerReservoirResidents` adds missing identities at campaign creation and after schema-13 load. It preserves existing characters and seeds directed ties for the additions without resetting established relationships. Numeric traits, skills, wallets and other new-character gameplay defaults are provisional. Canon names, affiliations, stated dispositions and occupations are content.

| Affiliation and group | Registered identities |
| --- | --- |
| Blocc Boys, Splash Gang | Baby Reek `baby-reek`, Tay Savage `tay-savage`, Lil Deuce `lil-deuce`, K3 `k3` |
| Blocc Boys | Ty Ty `ty-ty`, Mookie `mookie`, Big Riq `big-riq`, Dooda `dooda`, J-Money `j-money`, Bam `bam`, Trell `trell`, Boogie `boogie`, Nook `nook` |
| Unaffiliated | Miss Denise `miss-denise`, Unc Ray `unc-ray`, Ms. Tonya `ms-tonya`, Darnell “Nell” Price `nell-price`, Mr. Harris `mr-harris`, Reggie `reggie-auto`, Keisha `keisha-reservoir`, Miss Pat `miss-pat`, Shay `shay-reservoir` |

Quanny keeps his ID, authored rank and story. His established connection with Baby Reek is seeded in both directions. Existing contacts can introduce the player to the expanded network through ordinary relationship actions. Mr. Lewis and `contact-blocks` keep their current records and responsibilities. Splash Gang is a social group within the five-faction registry and has no Personal Set membership implications. Occupation text provides context for Gemini's schedules. Employment still comes from the campaign's job and shift records. The additional cast has no wholesale supplier roles in this phase.

## 2. Trusted world read contract

Import `queryGangWorld` and `GangWorldView` from `src/systems/gang`. Call `queryGangWorld(state)` for roster discovery or pass an array of actor IDs for a focused read. Results are detached projections. Refresh after every gameplay transition and read current availability before routing a physical routine.

| Field | Meaning |
| --- | --- |
| `time` | World Clock V3 campaign day, civil minute and daylight flag |
| `characters[]` | Identity, description, player flag, home zone, affiliation, existing rank, internal group, authored occupation, provisional defaults flag, traits, goals, stress, personal police scrutiny and directed relationships |
| `characters[].employment` | Current employment ID, job, employer and zone, workdays, time-off days, today's pending shift ID or attendance, next scheduled day, and today's shift eligibility from campaign state |
| Availability fields | World status, raw gameplay status, public routine eligibility, general availability day, custody or hospital release day when known, last action/assignment days and daily action eligibility |
| `factions[]` | Existing faction identities and current `allies` and `rivals` edges |
| `warfare` | The canon starting Blocks–Angels rivalry has `activeWar: false`. `activeWars: null` means the engine has no persisted war/escalation model. Do not infer current war from rival edges or legacy conflict text. |
| `territory[]` | Current controller and contested flag for each zone, plus `zones[id].police` |
| `events` | Existing observer-scoped feed for the selected actors |
| `worldEvents`, `eventCursor` | Trusted structured events across the campaign and the latest campaign event ID. Pass that cursor as the third argument on the next read. Deduplicate using event IDs if a cursor is absent or unknown and history replays. |

Player UI should use `queryGangMenu`, `visibleEvents` and its existing filters for disclosure. The trusted world feed can include incidents or causal references the player never observed.

## 3. Presence and street conversations

`src/city/LocationInteractions.ts` uses verified `peopleHere` for ordinary mapped social actions. Quanny and Mr. Lewis can be ordinary targets away from Lil Jay's. The market still gates the mapped Quanny introduction/business and Lewis delivery commands. The gameplay encounter's authored location and participants still gate opening and responding to scenes. The integrated host includes current `time` with mapped observations. Existing untimed callers serve the isolated developer preview and headless fixtures.

`src/city/StreetInteractions.ts` exports `StreetPresenceObservation`, `StreetConversationCommand`, `StreetConversationView`, `StreetConversationResult`, `queryStreetConversation` and `executeStreetConversationAction`. The query can identify a verified target and show why conversation is unavailable. It consumes no AP, money, time or relationship changes. It quotes the existing reach-out, socialize, inquire, introduction, offer and transfer actions, using the engine's relationship, agency, resources and AP checks.

```ts
const observation: StreetPresenceObservation = {
  time: worldTime(state),
  zone: "reservoir",
  playerPresent: controllerReportsPlayerInRange,
  nearbyCharacterIds: sim.peopleNear(x, z, interactionRadius)
    .filter(({ isCanonical }) => isCanonical)
    .map(({ characterId }) => characterId),
};
const view = queryStreetConversation(state, observation, targetId);
// Rebuild the observation from the current host frame at action/confirmation time.
const result = executeStreetConversationAction(state, freshObservation, command);
```

Use `locationId` only when the interaction has a verified mapped Reservoir location. Otherwise omit it and supply the known zone. Street commands never move the player or substitute a legacy location for an unmapped street. A mapped observed activity can use the existing place-dependent exposure with verified candidates. In the open world, an action may be blocked by stale time, lost proximity, known-contact rules, unwillingness, status, a conflicting session or an active encounter. Resume an authored encounter through its existing location commands. The caller must refresh proximity even within the same campaign minute.

## 4. NPC lifecycle and synchronization

`TimeSystem.advanceDay` calls `NPCDecisionAI.advanceNPCs` as the daily actor-level settlement path. The same action engine pays shifts, updates relationships and advances actor action dates. Existing crew, market and faction passes retain their responsibilities. `executeNpcLocationIntent` validates the timestamp, actor and presence and then declines routine settlement. Timed host observations cannot settle NPC actions via `executeLocationAction` either. Visual visitors, errands and social gatherings can animate repeatedly without generating money, relationship gains, police exposure or another game action.

| World status | Host behavior |
| --- | --- |
| `active` | Eligible for ordinary public routines. Check separate conversation and action eligibility. |
| `temporarily-unavailable` | May still be physically present. Honor gameplay availability for interaction. |
| `laying-low` | Unavailable for ordinary street contact. Gemini may preserve a private presence. |
| `hospitalized` | Suspend ordinary public routines. Campaign admission/recovery controls the status. |
| `incarcerated` | Suspend ordinary public routines until the campaign reports release. A null release date may be indefinite. |
| `dead` | Stop ordinary routines and remove the actor from public presence. Preserve the canonical identity and history. |

Gameplay reports status immediately. Gemini decides how changes appear physically. Refresh after actions, dawn and load, including before exposing observed NPCs to Claude. Status and event data may be read by the same query.

## 5. Structured world events

`src/core/WorldEvents.ts` defines `WorldEventDetails`, an optional member of existing `GameEvent` records. The existing `id`, `day`, `actors` and `observedBy` fields remain authoritative. `world` adds optional `subjectId`, `sourceEventId`, `zone`, `locationId`, status transition and territory controller transition. Some `actors` are existing faction IDs for strategic events. A zone-only event can influence regional planning, while spatial reactions require a verified mapping. A release can follow a spatial arrest or injury while having no established release location of its own.

| Kind | Producers and examples |
| --- | --- |
| `crime` | Opening robbery report, authored robbery or career settlement, the existing street economy, strong-arm attempts |
| `disturbance` | Local conflict, police patrol, police response, or an abstract off-player clash |
| `violence`, `injury`, `death` | Existing Danger, Quanny and robbery outcomes, including hospitalization and deaths from accrued NPC threat |
| `arrest`, `release` | Custody and discharge transitions with stable causal references |
| `faction-development` | Faction influence decisions, rival pressure, market competition, affiliation, rank, succession or existing incident resolution |
| `territory-change` | Actual controller change recognized by the daily territory resolver, with previous and current faction IDs |

No separate incident ledger is introduced. Preserve source linkage for deduplication, for example when a local assault leads to injury and custody events. An abstract NPC death can update status without spawning a disturbance at the NPC's home.

## 6. Persistence contract

The existing `SaveSystem` serializes optional `state.sim` in the same `syndicate` envelope, with campaign version 13 and existing manual/autosave keys. Gemini's `SimSnapshotV1` has its own version. For capture, call `withSimulationSnapshot(state, extractSimSnapshot(sim))` from `src/persistence/SimulationSnapshot.ts` and `src/sim/persistence.ts`, then save that state through the existing save entry point. Capture against the same campaign day and civil minute. The optional payload is detached when attached to campaign state.

`campaignSimulationSnapshot(state)` returns a restorable checkpoint or `undefined`. The campaign boundary uses Gemini's version check, checks required restore inputs, and rejects stale clock, duplicate IDs, missing or misclassified canonical identities, conflicting homes/affiliations and public-ineligible NPCs. The persisted campaign is loaded independently. A discarded checkpoint leaves all gameplay records intact.

Gemini owns detailed navigation/profile validation and snapshot structure. If a missing/incompatible checkpoint is dropped, initialize the runtime with a stable seed, the campaign's current day and minute, and profiles rebuilt from the trusted roster. Exclude public-ineligible canonical profiles. For restore, reconcile profile IDs, map compatibility and availability before publishing any presence. A valid older snapshot may represent a subset of the live population. If it cannot be reconciled, rebuild from the authoritative roster. Neither snapshot path may update canonical identity, money, jobs, relationships, custody or consequences.

## 7. Handoff and remaining decisions

**Gemini** should project persistent profiles from `queryGangWorld`, retain the exact character IDs, use the campaign's day and minute for schedules, and refresh status and directed ties after each committed action or dawn. Connect the read adapter for relationships and leave simulation relationship delta callbacks disconnected from gameplay settlement. The preview's `syncEngineDay` only updates the day. Integrating campaign-driven civil minutes into the running simulation and reconciling profiles across checkpoint restore remain Gemini host work. Translate relevant located world events into bounded reactions using actual map anchors and event ID deduplication.

**Claude** should use verified controller presence and Gemini's current `peopleHere` or `peopleNear` result, with current campaign time on each query/command. Show returned eligibility and costs. Apply only the returned gameplay state via the engine owner, refresh status and presence immediately, and respect the existing encounter flow for authored interactions. Claude owns player movement, range checks, physical mapping and presentation. Claude and Gemini coordinate any NPC movement interruption. The live host should use the existing campaign save path for Gemini's captured checkpoint.

**Owner review** remains for unresolved household mappings, the station/substation story location, future conflict escalation and any new economic role/settlement authorization. The existing prototype schedules still cover a smaller cast than the canonical gameplay roster. Registered residents have no new household or business geometry and no invented shop services. The campaign's existing legacy conflict logic may still use “war” terminology for rivalries. Resolving that behavior belongs to later conflict work.

## 8. Verification

`src/tests/worldSimulationIntegration.test.ts` exercises the 22-person registration, compatible save reload, detached queries, mapped/street eligibility, stale and invalid presence, single-settlement dawns, status transitions, scoped events and native Gemini checkpoint round-tripping and fallback. `src/tests/gangFoundation.test.ts` covers the existing gang functionality and the disabled visual-intent path. The mobile browser schema assertions in `tests/street.spec.ts` and `tests/corrections.spec.ts` compare against `GAME_SAVE_VERSION`.
