# GOAL 012: SLOT + LOAD INVENTORY, SET EQUIPMENT, PROPERTY AND THE SAFE

**BlackHouse / Hood Hero, Stixx City**
**Lab repository:** `kalikeefbiz/Hood-Hero-Lab`
**Assigned branch:** `codex/goal-012-inventory`
**Target:** Lab `main`. Open a PR for Claude to review and merge; **do not self-merge**.
**Owner amendment — 6 Nov 2026:** Slots AND load capacity are required **in this GOAL**, including quantity-aware stack limits and safe storage. This explicitly supersedes the earlier “no weight limits” requirement below. Follow the latest decision, not the earlier quote.

## A. EXECUTION CONTRACT

Implement this as **one complete GOAL** and return a single finished PR with tests. The owner cannot do implementation back-and-forth.

Before changing anything, read:
- `AGENTS.md`, especially **section 0, "The city comes first"**
- `docs/ACTIONS_TO_CITY.md`
- `src/core/GameState.ts`
- `src/systems/Equipment.ts`
- `src/systems/StreetEconomy.ts`
- `src/systems/StreetTypes.ts`
- `src/systems/Consignment.ts`
- `src/systems/Robbery.ts`
- `src/systems/CrewAgency.ts`
- `src/core/ActionEngine.ts` (the `buy` action and `possessions`)
- `src/persistence/SaveSystem.ts`
- `src/ui/exchanges.ts`

**Ownership split for this GOAL.** The owner chose this split.
- **Codex: rules, state, save migration and tests.** Codex builds the item model, slots, transfers, the safe, property purchase, set-member equipment effects, and every validation and error message, as pure functions with unit tests.
- **Claude: all presentation.** Claude builds the Wallet slot grid, the Set member inventory view, the "give" panel on a set member's card, and the safe panel on the property card, on top of the functions Codex exposes.
- Codex adds **no new UI**, except the smallest wiring needed for its own browser test. List any such wiring in the PR so Claude can replace it.

## B. WHAT THE OWNER WANTS

**Decision update:** The older owner quote below originally said “no weight limits”; that sentence is now superseded. The current instruction is to implement both slots and abstract load points for every carried inventory and property safe, to make choices about keeping, distributing, storing and discarding items matter.


> "An actual inventory system for the wallet. That way you can share items with your set, i.e. weapons, equipment and other later content. It doesn't need to have weight limits, just slots that represent what you have on your person, with a separate 'safe' option available once you buy property."

> "You should exchange items with your set in city, but you can view their equipped inventory in the Set section. If I give a member a Law-19 they should get combat stats from it just like the player would from carrying a weapon. If I want to bring them on a heist, I should need to find them in city, invite them and provide the necessary equipment. Exchanging of work, i.e. Pink Magic, should work the same way it works already, but since they are in your set it's always a consignment since they'd be working for you technically."

## C. THE ITEM MODEL

1. **One inventory per character.** The player and every set member have a fixed number of **slots on their person**: **12 for the player** and **8 for a set member**. Each also has a load capacity defined in the centralized balance table in section C1. Both limits apply simultaneously; a free slot does **not** mean a heavy item can fit.
2. **Item kinds**, under one discriminated type:
   - `merchandise`: Pink Magic and later street goods. It **stacks per lot**, because each stack keeps its link to the lot (`lotId`) so debts, provenance and the existing sale records stay correct. The lot remains the economic record; the slot is where it physically is. A single economic lot may occupy **multiple bounded physical stacks** with the same lot ID; do not merge distinct supplier lots merely to save slots.
   - `equipment`: the existing `EQUIPMENT` (Law-19, Law-19 Switch, ARP). One per slot; never stacks.
   - `possession`: the existing personal purchases (`ITEMS`). Stacks by id.
   - Leave room for later kinds (tools, keys, documents) without a rewrite.
3. **Equipped weapon.** It stays one weapon per character, which must be **in that character's slots**. Giving the weapon away unequips it. `equipmentBonus(character)` must work for **set members exactly as for the player**. Use it wherever set members fight or face danger: crew assignments, robbery sessions, danger scenes, and later heists.
4. **Capacity.** Every gain (buying, gifts, story grants, packs, loot, item recovery, transfers) must pass **slot count, per-stack maximum and total load** checks together, atomically. Reject with a clear reason if any limit fails. Optional direct-to-safe placement is valid **only while physically at an owned residence**, if that safe has both kinds of capacity and the player deliberately chooses that destination. Never silently drop an item, create hidden overflow or teleport goods to a property.
5. **Cash is not an item.** Wallet cash stays as it is (`clean` / `illicit`).

## C1. DUAL CAPACITY & ITEM LOAD — REQUIRED IN GOAL 012

**Use fictional, integer `load points` rather than literal pounds.** These are game-balance units, not movement speed or stamina penalties. Centralize the initial values and every item load and stack limit in an editable balance/definition module (not UI components). Every slot-bearing character/storage container has both limits:

| Container | Slot limit | Total load capacity | Notes |
| --- | ---: | ---: | --- |
| Player, on person | **12** | **20 load** | Includes equipped weapon and any carried loot |
| Each Set member, on person | **8** | **15 load** | Independent of player capacity; no shared invisible backpack |
| Each owned residence's safe | **24** | **40 load** | Independent per residence; travel to property to use |

**Initial item definitions; tune centrally, don't add unrequested item kinds or change current item prices.**

| Item or family | Load per physical unit | Stack maximum per occupied slot |
| --- | ---: | ---: |
| Pink Magic (`nightgoods` internal ID) | **1** | **10 units**, all from the **same economic lot ID** |
| Law-19, Law-19 Switch | **3** each | **1** |
| ARP | **6** | **1** |
| Robbery gloves, mask, fictional pattern token | **1** each | **5** of same ID |
| Robbery duffle bag | **2** | **1** |
| Groceries/necessities | **3** each | **3** |
| Smokes | **1** each | **5** |
| Booze | **2** each | **3** |
| Pocket music player | **2** | **1** |
| Fresh clothes | **2** each | **3** |

All items must have a defined, nonzero per-unit load and per-slot cap. Future products get values through the same registry. **Load is based on physical quantities** (`quantity * loadPerUnit`), not one flat cost per whole lot or slot. One pack of six Pink Magic uses six load points; four packs of six already use 24 points and cannot all fit in a 20-load player inventory, regardless of remaining slots. A 40-load safe is capped at 40 Pink Magic units even if it has many open slots. Safe count still scales with property ownership, but cannot contain unlimited items per stack.

**Implementation invariants:**

1. The system's single source of truth calculates `usedSlots`, `usedLoad`, `maxSlots`, `maxLoad`, and remaining capacity. A worn/equipped weapon uses its occupied on-person slot and load **once**, not an extra hidden equipped-capacity count. Cash has neither slots nor load.
2. Stack merging is permitted only for matching item IDs and matching provenance/debt/lot identity where applicable. Split/swap/merge operations preserve quantities and ledger links. Multiple physical stacks from one economic lot must reconcile to that lot's untransferred, unsold remaining units; the total cannot exceed it. Sale, confiscation, transfer, gift, loss and reup operations must update physical stacks and corresponding economic records consistently, even mid-session.
3. Full or overweight destinations reject **the entire attempted operation** without spending AP, cash, debt capacity or other resources unless the user explicitly selects a valid smaller quantity first. An item cannot disappear or money be charged on a rejected pickup/acquisition; if a gift/mission reward is pending, keep it pending and retryable rather than silently deleting it.
4. Session starts use the actual on-person available stock. Goods deposited in a safe, held by Set members or in an old-save overflow bin are **not** eligible for street selling, robbery preparation or combat until withdrawn/transferred onto the actor's person. Equip and heist readiness verify actual carried slots, rank and requirements.
5. Character-to-character exchanges must validate the receiver's capacity **before** mutating the sender, supplier ledger, consignment or relationship consequences. The player's load can free up when handing off stock, but consignment obligations do not evaporate. Taking an item back must fit the player's inventory and preserve outstanding debt for already sold items.
6. **Voluntary discard:** Provide a validated, auditable physical discard from the player's City presence/card (Claude to expose it; **not a Wallet shortcut**). Discarding consumes the specified item quantity, frees slots/load, never refunds cash, **never cancels supplier debts**, and for merchandise updates the original lot's loss accounting rather than creating a phantom sale. Use a visible event/exchange record; no magical recovery through save/reload. Do not invent new police-search or auto-raiding systems just for discard.
7. A safe is not remote cloud storage. Deposits/withdrawals require standing at that specific owned residence. Safe capacity is per property, NOT a global shared pool. A property cannot be silently sold or deleted while holding items; define a safe way to empty/handle storage when ownership changes. Safe-held items are exempt from **on-person** theft/custody loss, as originally specified; don't claim they are immune to all possible future property risks.
8. No player-facing `weight` numbers need real-world units; show capacity as `Used load / Capacity` and used slots in the API consumed by Claude. Offer specific messages like `Need 4 more load capacity`, `No free slots`, or `Stack limit reached`. Distinguish these errors clearly.
9. **No encumbrance debuffs yet.** Do not alter AP, walking speed, stamina, danger rolls or camera/animation. A transaction simply cannot push inventory beyond capacity.

**Old-save migration:** apply both slot and load limits to migrated inventories, including existing merchandise and prep. Anything over either bound goes to **visible, non-sellable, non-equipable legacy overflow**, keeping exact original lot/supplier/obligation/provenance and quantity. Never delete or duplicate items; let player retrieve only the portion that fits, optionally at a physical owned property into the safe. Overflow must never be a permanently free usable storage feature for new acquisitions. Validate new-game tutorial gift/paid pack, supplier reups and quest rewards under this capacity model, ensuring tutorial never soft-locks.

**Explicit acceptance tests:** 12/20, 8/15 and 24/40 boundaries; max merchandise units per stack and lot splits; a character with 12 open slots but insufficient load; a safe with 20 free slots but full load; multiple properties with nonshared storage; AP/cash/debt untouched on capacity rejection; in-person consignment to a capacity-limited Set member; stacked sales and supplier debts; equipped weapon load once and bonus eligibility; prep required for robbery and capacity errors; safe withdrawal and no teleport; discard of unpaid merchandise preserving supplier liability; backward migrations preserving quantities and visible overflow; valid new-game tutorials when capacity is full; save/load exact equality and duplicate-click idempotency. A small multi-property 30/60/180-day balance simulation should verify that storage requires meaningful tradeoffs without impossible progression.

**Claude handoff:** the slot grid, person and property cards must show load alongside slots, visually indicate when a transfer won't fit, support split quantity, and show capacity-specific errors. Codex owns all rules; Claude owns that presentation. No extra UI/board scope is authorized here.

## D. EXCHANGES WITH THE SET (IN THE CITY ONLY)

1. **In-person rule.** The player can give or take items with a set member only when **they are both at the same place on the board**. Use the existing presence, location and board-people rules. Remotely, the functions return an error that tells the player where to find the member. There are no menu shortcuts.
2. **Weapons and possessions** move directly between slots, with no payment. Record each move in a history that the exchange feed can read, so the player sees "Law-19 given to Robin" (follow the pattern in `src/ui/exchanges.ts`).
3. **Pink Magic to a set member is always a consignment.** They work for you. Reuse the directional consignment model already used for Quanny (`src/systems/Consignment.ts`):
   - the member owes the player for the units they take
   - the member sells through the existing crew and agency systems
   - the money is collected later under the existing rules
   - no cash deal and no free gift
   Quanny and other non-set contacts keep their current rules.
4. **Taking items back** works the same way, in person. Merchandise the member already sold can't be taken back, and the consignment debt stays.
5. **Heists.** Today robbery sessions are the player's own. Add the hook a heist will need:
   - the player invites a set member **in person in the city**
   - the member only joins if they carry the required equipment in their own slots
   Design the requirement check as a function, such as `heistReadiness(s, memberId, requirement)`, so later heist content can declare what it needs. Don't write heist story content in this GOAL.

## E. PROPERTY AND THE SAFE

1. **Buying property.** No player property purchase exists today.
   - Add the smallest real version: the player can **buy a residence at an existing physical home location** (choose suitable existing `LocationDef`s with `links.rest`, at least one per zone).
   - It uses a real price paid from the wallet, its provenance recorded, plus a ledger entry and an event.
   - Store it in the existing `properties` record or a clearly named sibling, without breaking the property-dispute model (the Chains).
   - Don't add new locations or board geometry; Claude will wire the purchase onto that place's card.
2. **The safe.** Each owned residence has a **safe** with **24 slots AND 40 load capacity** under section C1. Deposits and withdrawals only happen **while the player is physically at that property**; both capacity constraints apply. Items in the safe aren't on the player's person, so they can't be robbed, seized in custody or lost to danger scenes directed at the person. This is not a promise of immunity from future property-related risks. Use whatever on-person loss rules exist today; if none exist yet, write that rule in now so later content can't get it wrong.
3. **Set members cannot open the player's safe.**

## F. SAVES

- Bump the save schema with an explicit migration.
- The migration puts each character's existing `possessions`, `equipment.owned` and held lots into slots, keeping what's equipped.
- If an old save holds more than either its **slot OR load** limit, put the overflow in **visible legacy holding state** with preserved original quantities, lot IDs, provenance and debts. It must be inert until claimed into a valid physical inventory; never delete it or allow it to become reusable free storage for newly gained items.
- Don't change existing ids.
- Test old (v8 to v10) saves loading, plus a full round trip.

## G. FUNCTIONS CLAUDE WILL BUILD THE UI ON

Expose pure, validated functions that return either an error string or the new state. Names may differ, but cover:
- reading slots and computed capacity: `inventoryOf(s, characterId)`, `safeOf(s, propertyId)`, plus `capacityOf`, `canFit`, `usedLoad` and `remainingLoad` or equivalents. Return **slots and load** for Claude's UI.
- moving/splitting/merging bounded stacks: `moveSlot`, `splitStack`, `mergeStack` (or equivalent)
- `giveItem` / `takeItem` (with the in-person and set-membership checks)
- `deposit` / `withdraw` (must be at the property, both capacities checked), and `discardItem` (City-only, durable loss history and no supplier debt erasure)
- `buyProperty` and the residences for sale
- an exchange history the feed can read

Every function also has an `...Error` twin that explains, in player-facing words, why something can't happen right now. That matches the existing `supplierError` and `contactError` style, so the UI can show disabled controls with reasons.

## H. TESTS AND PR

- **Unit tests** for:
  - the slot rules
  - full-slot **and full-load** failures, max stack sizes, merged/split lots, exact quantities and capacity across every gain/loss
  - in-person checks
  - consignment-only Pink Magic to set members
  - a set member's equipment bonus applying in a crew or danger roll
  - property purchase and safe deposit/withdraw, multiple property capacity isolation, discard preserving debt, safe-vs-on-person risk rules
  - the save migration, including both slot **and load** overflow and non-destructive recovery
- **One browser test** that starts on the City tab: buy a residence, deposit an item, give a Law-19 to a set member in person, and confirm their stats changed. Also verify safe capacity prevents excess storage and a full-load recipient refuses a transfer without loss; item splitting/discard can be unit-tested until Claude wires the final UI. Simple wiring is enough; say in the PR which wiring Claude should replace.
- Run the checks in `AGENTS.md`, and record any test failures that also fail on `main`.

## I. OUT OF SCOPE

- **Movement-speed/stamina/encumbrance penalties** are out of scope. **Dual capacity (slots + load), load points, stack caps and discard are REQUIRED in scope** under section C1.
- Item art. Claude needs icons for Law-19, Law-19 Switch and ARP. Say in the PR which items have no icon.
- Heist story content.
- Banks and stores beyond what exists.
- Any change to the board, 3D or camera.
