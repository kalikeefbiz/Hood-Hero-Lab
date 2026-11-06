# GOAL 012: SLOT INVENTORY, SET EQUIPMENT, PROPERTY AND THE SAFE

**BlackHouse / Hood Hero, Stixx City**
**Lab repository:** `kalikeefbiz/Hood-Hero-Lab`
**Assigned branch:** `codex/goal-012-inventory`
**Target:** Lab `main`. Open a PR for Claude to review and merge; **do not self-merge**.

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

> "An actual inventory system for the wallet. That way you can share items with your set, i.e. weapons, equipment and other later content. It doesn't need to have weight limits, just slots that represent what you have on your person, with a separate 'safe' option available once you buy property."

> "You should exchange items with your set in city, but you can view their equipped inventory in the Set section. If I give a member a Law-19 they should get combat stats from it just like the player would from carrying a weapon. If I want to bring them on a heist, I should need to find them in city, invite them and provide the necessary equipment. Exchanging of work, i.e. Pink Magic, should work the same way it works already, but since they are in your set it's always a consignment since they'd be working for you technically."

## C. THE ITEM MODEL

1. **One inventory per character.** The player and every set member have a fixed number of **slots on their person**: **12 for the player** and **8 for a set member**. Put both in one constant so they can be tuned later. There are **no weight limits**.
2. **Item kinds**, under one discriminated type:
   - `merchandise`: Pink Magic and later street goods. It **stacks per lot**, because each stack keeps its link to the lot (`lotId`) so debts, provenance and the existing sale records stay correct. The lot remains the economic record; the slot is where it physically is.
   - `equipment`: the existing `EQUIPMENT` (Law-19, Law-19 Switch, ARP). One per slot; never stacks.
   - `possession`: the existing personal purchases (`ITEMS`). Stacks by id.
   - Leave room for later kinds (tools, keys, documents) without a rewrite.
3. **Equipped weapon.** It stays one weapon per character, which must be **in that character's slots**. Giving the weapon away unequips it. `equipmentBonus(character)` must work for **set members exactly as for the player**. Use it wherever set members fight or face danger: crew assignments, robbery sessions, danger scenes, and later heists.
4. **Full slots.** Any gain (buying, gifts, story grants, packs from a plug) must check for space. If there is no room, the gain fails with a clear message, or the item goes to the safe **only if** the player is physically at their property. Never silently drop an item or create a hidden overflow.
5. **Cash is not an item.** Wallet cash stays as it is (`clean` / `illicit`).

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
2. **The safe.** Each owned residence has a **safe**: more slots (**24**), no weight. Deposits and withdrawals only happen **while the player is physically at that property**. Items in the safe aren't on the player's person, so they can't be robbed, seized in custody or lost to danger scenes. Use whatever on-person loss rules exist today; if none exist yet, write that rule in now so later content can't get it wrong.
3. **Set members cannot open the player's safe.**

## F. SAVES

- Bump the save schema with an explicit migration.
- The migration puts each character's existing `possessions`, `equipment.owned` and held lots into slots, keeping what's equipped.
- If an old save holds more than fits, put the overflow in a **legacy holding stack** that the player can see and clear. Never delete it.
- Don't change existing ids.
- Test old (v8 to v10) saves loading, plus a full round trip.

## G. FUNCTIONS CLAUDE WILL BUILD THE UI ON

Expose pure, validated functions that return either an error string or the new state. Names may differ, but cover:
- reading slots: `inventoryOf(s, characterId)`, `safeOf(s, propertyId)`
- moving between your own slots: `moveSlot`
- `giveItem` / `takeItem` (with the in-person and set-membership checks)
- `deposit` / `withdraw` (must be at the property)
- `buyProperty` and the residences for sale
- an exchange history the feed can read

Every function also has an `...Error` twin that explains, in player-facing words, why something can't happen right now. That matches the existing `supplierError` and `contactError` style, so the UI can show disabled controls with reasons.

## H. TESTS AND PR

- **Unit tests** for:
  - the slot rules
  - full-slot failures
  - in-person checks
  - consignment-only Pink Magic to set members
  - a set member's equipment bonus applying in a crew or danger roll
  - property purchase and safe deposit/withdraw
  - the save migration, including overflow
- **One browser test** that starts on the City tab: buy a residence, deposit an item, give a Law-19 to a set member in person, and confirm their stats changed. Simple wiring is enough; say in the PR which wiring Claude should replace.
- Run the checks in `AGENTS.md`, and record any test failures that also fail on `main`.

## I. OUT OF SCOPE

- Weight and encumbrance.
- Item art. Claude needs icons for Law-19, Law-19 Switch and ARP. Say in the PR which items have no icon.
- Heist story content.
- Banks and stores beyond what exists.
- Any change to the board, 3D or camera.
