# THE STIXX — THE RESERVOIR / WESTSIDE
## Authoritative Hood Hero canon and production contract — v1
**Owner approval:** 2026-11-22. **Scope:** starting world state, inhabitants, neighborhood logic, activity/territory rules. **Repository:** `kalikeefbiz/Hood-Hero-Lab`.

**Read with:** `AGENTS.md` section 00, `docs/CITY_PLAN.md`, `docs/RESERVOIR_LAYOUT.md`, `docs/CODEX_CITY_BRIEF.md`, and Claude-authored `src/strip/cityMap.ts`. This document is the **content/canon authority** for the Reservoir. The existing city map remains the **geometric authority**; existing game systems and save-state contracts remain the **mechanical authority**. Do not treat speculative art or prototype NPC definitions as new canon.

### A. Neighborhood identity — LOCKED
The Reservoir, the Westside of Stixx City, is its oldest neighborhood and arguably its poorest. Art direction: a fictional, alternate-world Detroit/Flint—aging working-class homes, patched storefronts, industrial remnants, vacant and boarded properties, family-owned businesses, and a long-tagged water tower. Opportunity has largely disappeared; the community has not. Residents have deep family histories, work, raise children, help neighbors, and have varying attitudes toward crime.

**The Blocc Boys are from the community, not an occupying army.** Many residents are relatives, childhood friends, neighbors, or associates of members. The organization generally respects unaffiliated established residents such as Mr. Lewis and ordinarily keeps them out of gang operations. It is nonetheless a self-interested criminal organization capable of coercion, robbery and violence whenever members believe that serves their goals. Do not render every street resident as a victim, gang member, or quest-giver. Both lawful and illicit life are ordinary parts of this neighborhood.

### B. Physical streets — LOCKED; DO NOT REBUILD
- **Lil Bit Lane:** primary Blocc Boys link-up, trapping/illicit customers and social nexus; Lil Jay's Market; Quanny often here but not fixed to it.
- **Blocc Boy Boulevard:** primary commercial strip; Pawn & Resale, Barber Shop, Beauty Supply, Liquor & Deli; some storefronts initially scenery.
- **Dirty Money Drive:** family homes, duplex/households, Reservoir Laundry, work and local commerce.
- **No Refund Road:** Westside Warehouse, Lot Court, No Refund Auto & Tires, working/industrial lots.
- **Big Mouth Boulevard:** oldest residential character, boarded houses/bandos and water tower; the water tower is the Westside's westernmost landmark.
All five streets are socially relevant. **No duplicate Lil Jay's** on other streets. Existing geometry and positions in `src/strip/cityMap.ts` are authoritative, including where descriptions of early concept art differ. Do not add streets or relocate established places for NPC convenience.

### C. Organization and relationships — LOCKED
The Reservoir **begins controlled by the Blocc Boys** (`blocks` in existing game data). They pursue income and influence through home invasions, black-market sales (weapons, fictional narcotics and stolen goods), and hired violence. **There is no single centralized active street boss.** Members acquire informal influence through earnings, reputation, relationships and effectiveness, irrespective of age; do not add a rigid chain of command. **Splash Gang is Quanny's close inner group *within* the Blocc Boys, never a sixth faction.**

The Blocc Boys have a hostile rivalry with Gabriel's Angels over a past robbery dispute. **At campaign start, the war has not escalated into sustained violent conflict.** A later Quanny/Baby Canon station-area confrontation can precipitate that escalation. Existing alliance: Blocc Boys ↔ Blips. Rivalries, truces and alliances must be allowed to change through player/NPC events; the starting situation is not a perpetual script.

**Established family context:** Quanny knows Mega and Panic (Ricky) by reputation; he is cordial rather than close, and is not intimidated by them. Panic is incarcerated for murder. Quanny is 18, a respected and ambitious hitter, hotheaded, calculating, unforgiving, and motivated by loyalty, money and standing. He is influential despite his age, not overall leader.

**Joining the organization:** player starts unaffiliated. Potential introductions via **Quanny, Ty Ty, Mookie, Big Riq**; reputation/relationships and existing requirements determine outcomes. Player may remain unaffiliated or compete from an opposing faction; neither legitimate work nor civilian friendships require gang membership.

### D. Approved starting cast — CANONICAL NAMES AND ROLES
Use **stable IDs** in implementation, but do not rename any already-shipped IDs. Suggested identifiers below for newly approved people are *implementation proposals*, not permission to overwrite earlier characters. Many residents require no bespoke dialogue.

**Blocc Boys (regular roster, 9 additional to Quanny):**
| Name | Approved role | Suggested ID |
|---|---|---|
| Ty Ty | Personable neighborhood hustler and introduction contact; knows everyone | `ty-ty` |
| Mookie | Established earner and income-first business contact | `mookie` |
| Big Riq | Respected veteran whose opinion carries informal weight | `big-riq` |
| Dooda | Young seller competing over customers and corners | `dooda` |
| J-Money | Boosting and resale/stolen-goods focus | `j-money` |
| Bam | Aggressive and inclined to take slights personally | `bam` |
| Trell | Quiet, dependable neighborhood operator | `trell` |
| Boogie | Outgoing, flashy, status and consumption oriented | `boogie` |
| Nook | Low-profile hustler with a small circle | `nook` |

**Splash Gang (Quanny plus four approved members):**
| Name | Approved role | Suggested ID |
|---|---|---|
| Quanny | Group figurehead; Blocc Boys member; existing canonical ID `quanny` | `quanny` |
| Baby Reek | Quanny's closest associate, steady and loyal | `baby-reek` |
| Tay Savage | Impulsive, reputation-focused member | `tay-savage` |
| Lil Deuce | Young member focused on money and status | `lil-deuce` |
| K3 | Quiet, observant member | `k3` |

**Civilian / business population:**
| Name | Identity and default association | Suggested ID |
|---|---|---|
| Mr. Lewis | Existing `mr-lewis`; lifelong resident, homeowner, owns and operates Lil Jay's Market. Respected by the community and the BB; not a gang participant | `mr-lewis` |
| Miss Denise | Laundry operator, longtime local who knows local families | `miss-denise` |
| Unc Ray | Barber shop operator; knows several generations of BB without joining | `unc-ray` |
| Ms. Tonya | Beauty supply owner; financially strained, determined to stay | `ms-tonya` |
| Darnell “Nell” Price | Pawn shop operator; business-minded, cautious with strangers | `nell-price` |
| Mr. Harris | Warehouse manager; hires local workers when possible | `mr-harris` |
| Keisha | Young resident with an ordinary job and family ties; avoids gang involvement | `keisha-reservoir` |
| Miss Pat | Older homeowner who remembers the Westside's better years | `miss-pat` |
| Shay | Young woman raising a child alongside relatives; has an independent life | `shay-reservoir` |
| Reggie | Mechanic involved in No Refund Auto & Tires; concerned with keeping it running | `reggie-auto` |

**Background population:** in addition to named characters, use unnamed `Blocc Boy member` or unaffiliated residents to fill the world. Do not assign every extra NPC a special plot, handcrafted dialogue tree, unique home, or new gang rank. Supporting residents still have a household or workplace and can react to real events.

**Character complexity tiers:** (1) primary: authored motivations, memories, relationships, meaningful conversation; (2) supporting: schedules, relationships, eligible world actions, contextual dialogue only as needed; (3) background: efficient shared movement/routine/social/event reaction, no bespoke dialogue required. All are world inhabitants, not decorative random encounter prompts. Avoid a default unsolicited generic “steady work?” encounter with no meaningful follow-up.

### E. Households and property ownership — LOCKED PRINCIPLE; PHYSICAL ASSIGNMENTS PENDING
**Multiple characters share existing properties.** Do not require one house per NPC; the visual neighborhood contains fewer homes than people.
- Mr. Lewis **owns his home** and **Lil Jay's Market**. Assign his home to an existing `HOUSES` entry; do not invent new house geometry.
- **Quanny and Splash Gang stay/use a shared bando.** The existing boarded-house/abandoned housing stock should supply it. Which specific physical house serves as their base remains to be mapped without contradicting the existing `reservoir.boarded-house` street-work location.
- Other BB share bandos or live with relatives. Nonmembers share duplexes and multigenerational homes.
- Assign remaining commercial operators as above. Operator does not automatically mean deed owner unless explicitly stated: Mr. Lewis's ownership is confirmed; other business operator/owner relationships can be clarified in mechanics without rewriting the starting cast.
- A house can be a home, shared residence, vacant property, bando or story location. A visible building is **not automatically player-purchasable**.

**Do not guess** which mapped house Mr. Lewis or Splash Gang occupies. Claude owns physical house assignments in `src/strip/cityMap.ts`, in coordination with Codex's stable location/household IDs.

### F. Location mechanics and game contract — LOCKED INTENT
No location should become a **fake action**: a functional business exposes an actual rules-backed mechanic; until implemented it may remain coherent world scenery with NPC use rather than a fraudulent “live” gameplay button. Reuse existing systems and IDs. The existing `LOCATIONS` registry may say `status: "live"` for a link that only exposes limited functionality; test actual behavior.

| Place / stable game ID | Starting role; genuine mechanic or integration target |
|---|---|
| Lil Jay's `reservoir.lil-jays` | Mr. Lewis's market: purchase ordinary goods, established retail employment, eligible resident interactions; BB congregate *outside* without making Lewis complicit |
| Pawn `reservoir.pawn` | Existing pawn/stolen-goods resale actions; price, inventory, legality and outcomes through current systems |
| Laundry `reservoir.laundry` | Existing laundry-business investment/operations, if supported by game rules; civilian laundry visits as NPC activity |
| Warehouse `reservoir.warehouse` | Existing warehouse employment/job shift system |
| Lot Court `reservoir.lot-court` | Social gathering, relationships and contextual encounters via existing people mechanics |
| Boarded house `reservoir.boarded-house` | Existing street-work/illicit opportunities; bando occupancy separately assigned |
| Water tower `reservoir.water-tower` | Existing territorial/political information and appropriate world encounters; landmark rather than magic territory-capture button |
| Homes `reservoir.homes` | Existing rest/residence and relevant robbery/property systems; must select valid actual `HOUSES` target without assuming every home is accessible |
| Barber shop (currently null scenery) | Owner Unc Ray; haircut/grooming and social introductions only when genuine gameplay systems exist |
| Beauty Supply (currently null scenery) | Ms. Tonya; legitimate retail/apparel or style mechanic if supported |
| Liquor & Deli (currently null scenery) | Local retail/food/drink mechanic if supported; operator not yet individually named |
| No Refund Auto & Tires (currently null scenery) | Reggie; legitimate repair/vehicle service once corresponding system exists |

The last four are **not yet assigned gameplay `locationId` values** in `src/strip/cityMap.ts`. Do not silently manufacture new shops, inventories, vehicle systems or gameplay buttons. For missing functionality, document the minimum mechanic and request an explicit scope decision. Every building should ultimately have purpose for the living neighborhood, but not every building must have an immediate player action. No interiors required to establish current exterior gameplay contracts.

### G. Territorial economy, crime, response — LOCKED SYSTEM DESIGN
The **Blocc Boys start in control** of the Reservoir. Territory is contested through sustained, **place-based illicit activity and influence**, not simply standing nearby or working a legitimate job.
- Legitimate work, shopping, civilian relationships: may earn cash, friendship, information or contacts; **no direct territory capture**.
- Trapping and black-market trading: gradual **market share** from local customer acquisition, repeat business and cumulative relevant illicit revenue. Competing operators can react first through warnings, undercutting, intimidation or lost customers. Escalation is variable, not one automatic shootout.
- Robbery and assault: more immediate victim/faction response, retaliation, threats and police pressure. **Random violence is not a guaranteed positive territory gain**; it can undermine standing and increase counterpressure.
- Organized illicit activity can challenge economic dominance, coercive influence and faction control. These are related but not identical. Civilian standing, fear, gang threat and police heat must remain distinguishable.
- Location and victim affiliations matter. Faction pressure can intensify or de-escalate based on NPC choices and player choices.
- No arbitrary automatic “every crime grants territory” score. Do not make every NPC unconditionally trigger hostile encounters. **On-sight violence is for sufficiently escalated/true war conditions**, not ordinary movement into an unfamiliar block.
- Game progression retains established two victory routes, existing faction membership requirements and no fixed campaign timer; the Reservoir canon does not redefine those global rules.

### H. Autonomous life and simulation integration — LOCKED BEHAVIORAL REQUIREMENTS
**Anything the player can meaningfully do, a relevant NPC may attempt through the SAME core rules**, with the established exception for select player progression/property purchases and narrow later-game exceptions. Eligibility, possessions, risks, obligations and opportunity apply; not every character can do every action. NPCs can earn, shop, work, socialize, pursue crime, retaliate, take losses, change loyalties and trigger consequences without a player present.

**One authoritative state:** the existing game engine owns canonical time/day/AP, money, merchandise, relationships/memories, faction standing, ownership, policing and saves. The NPC simulation may calculate itineraries, anchor positions, pathfinding, routine preferences and reactions; it must **not** create a separate game clock, economy, irreversible event log, relationship truth or save slot. NPC behavioral activity can be more granular than player turn actions while remaining synchronized with the game's calendar.

**Five-street scale:** later test 20 simulated residents as baseline, 40/60 for stress, and distinguish headless agents from visible 3D avatars. Off-screen/inside-house activity persists without active GLB or camera. Real-world iPhone performance needs actual device testing; desktop headless performance is not proof of Safari framerate. Canonical NPC activities use real mapped locations; no invented “shops” or fictitious interactions just to produce movement.

**A functional location progresses through three states:** physical scenery → real gameplay-connected place → living location with autonomous NPC use. This is production status, not a new gameplay flag.

### I. Starting conflicts, player opportunities, story continuity
- The player begins unaffiliated; family ties to Southside and local ties to Eastside can complicate Westside loyalties.
- Quanny, Ty Ty, Mookie or Big Riq can vouch for an introduction when appropriate; no instant mandatory recruitment.
- Angels rivalry starts tense, **before** a violent phase. A Quanny/Baby Canon confrontation is a potential escalation beat, and its schedule and outcome must respect in-world events and player state.
- **Continuity item unresolved:** one prior treatment referred to a substation; the owner's later wording refers to a train-station incident. Do not select or relocate this scene unilaterally; ask owner before final implementation.
- Alliances and territory are starting circumstances, not invulnerable locks. NPCs may influence or even drive conflicts, and players can recover from setbacks.

### J. Agent ownership / handoff
- **Claude:** existing five-street world, models/textures, sidewalks, doors, `src/strip/cityMap.ts`, physical household/business coordinates, performance and presentation. Do not change other agents' gameplay rules.
- **Codex:** gameplay behavior and links between established `reservoir.*` locations and **existing** actions/eligibility/economy/saves; canonical character/household data and rules where needed, tests, event outcome verification. **Current next task explicitly excludes control schemes, player movement, camera, joystick, pathfinding and NPC locomotion**; do not touch Claude-owned `src/strip/**` or frozen `src/board/**`.
- **Gemini:** independent prototype of NPC itineraries/navigation/autonomous behavior. Currently **not authorized to edit the game repository**. Must consume real canonical time, relationships, action results and location contracts *when* an integration is approved; never invent independent irreversible gameplay state.
- **Project owner/Vesper:** canon decisions, architecture boundary review and release/merge approval.

### K. Unresolved implementation mappings (NOT canon gaps)
1. Pick exact existing house mapping for Mr. Lewis and the shared Splash Gang bando; avoid assigning every NPC a unique dwelling.
2. Map residences/relatives for other named members without architectural expansion.
3. Confirm the implementation and actual working behavior behind each existing `reservoir.*` location link. Some “live” registry entries may have only info/social actions.
4. Assign shop-owner identities for Liquor & Deli if needed; no need for another primary NPC solely for a storefront.
5. Decide the train-station/substation scene location before hardcoding it.
6. Establish stable IDs for the approved new cast while preserving existing save compatibility and resolving collisions.
7. Define owner-approved mechanics if/when currently scenery-only shops become player-interactive.

**Never fill an unresolved mapping by silently overriding accepted canon, mutating Claude's city map, or adding fake interaction content.**
