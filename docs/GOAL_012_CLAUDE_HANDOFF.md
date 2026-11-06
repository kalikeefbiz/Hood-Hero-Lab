# GOAL 012: Claude presentation handoff

Codex supplies rules, state, migration and tests. Claude owns the final Wallet grid, Set inventory view and person/property City panels. Final presentation is an integration dependency before release. No board geometry, camera, models, canonical IDs or Lab save keys change.

## State and balance

- `src/content/inventory.ts` centralizes all loads, stack caps and capacities: player **12 slots/20 load**, other characters **8/15**, each residence **24/40**. Cash occupies neither. Residence price is $600; existing item prices are unchanged.
- `Character.inventory.slots` is the physical source of truth. Stacks have unique `id`, `kind`, `itemId`, `quantity`, `provenance`; merchandise also has `lotId`. Multiple bounded stacks may reference one economic lot; different lots never merge. An equipped weapon occupies its slot/load once.
- Economic `street.lots[].remaining` includes stock in safes and legacy holding. **Do not label it as on-person stock.** Use `carriedLotQuantity` and physical slots. `possessions` and `equipment.owned` are carried compatibility projections maintained by the rules; never mutate them in UI.
- `residences[locationId]` is separate from the Chains `properties` record. Each residence records owner, physical location, purchase price, exact clean/illicit payment split, purchase event, and its independent `safe.slots`.
- `inventory.overflow[characterId]` is legacy holding created only during migration. Show its quantities and original lot/supplier context. It cannot sell, equip or accept new acquisitions. Retrieval must fit the destination. A blocked tutorial gift stays unclaimed until capacity becomes available. If all starter stock is discarded/lost/handed off before the lesson, Mega allows a normally priced replacement; the free gift cannot repeat.
- `inventory.history` is durable exchange/discard history. The existing exchange feed now consumes it and residence purchases. Discard records goods loss with zero sales/revenue and leaves supplier liability intact.

## Read APIs

From `systems/Inventory.ts`: `inventoryOf(s, characterId?)`, `safeOf(s, propertyId)`, `capacityOf(inventory, 'player' | 'member' | 'safe')`, `characterCapacity(s, characterId?)`, `usedLoad`, `remainingLoad`, `canFit`, `carriedLotQuantity`.

Capacity returns `usedSlots`, `maxSlots`, `remainingSlots`, `usedLoad`, `maxLoad`, `remainingLoad`. Show **both slots and load**, with integer fictional load points. Use registry labels/caps rather than duplicating balance values. A free slot does not imply an item fits.

## Commands and errors

These commands return `GameState | string`. Apply a returned state; show an error string. Every command has an `...Error` twin for disabled controls. Rejected commands preserve the original state and all resources. Quantities are positive whole physical units.

| Module | Commands | UI home |
| --- | --- | --- |
| `Inventory.ts` | `moveSlot(s, actor, slotId, occupiedIndex)`, `splitStack(s, actor, slotId, quantity, operationId?)`, `mergeStack(s, actor, fromSlotId, toSlotId, operationId?)` | Carried inventory rearrangement; Wallet grid |
| `InventoryExchanges.ts` | `giveItem(s, member, slotId, quantity, operationId?)`, `takeItem(...)`, `equipItem(s, actor, equipmentIdOrNull)` | Member's City card; Set view reads inventory |
| `InventoryExchanges.ts` | `discardItem(s, slotId, quantity, currentLocationId, operationId?)` | Player's physical City card; **no Wallet discard shortcut** |
| `InventoryExchanges.ts` | `claimOverflow(s, actor, legacySlotId, quantity, propertyId?, operationId?)` | Player presence, or meet the member; direct-to-safe retrieval only at that owned residence |
| `Residences.ts` | `buyProperty(s, locationId, operationId?)`, `deposit(s, propertyId, slotId, quantity, operationId?)`, `withdraw(...)`, `releaseProperty(s, propertyId)` | Existing residence place card; stand at that specific property |
| `InventoryExchanges.ts` | `collectSetConsignment(s, agreementId, operationId?)` | Member's City card with balance/history |
| `InventoryExchanges.ts` | `inviteHeist(s, member, requirement, operationId?)` | Member's City card, in person |

Use one stable unique `operationId` per user intent and retain it for duplicate/stale clicks. Create a fresh ID for a genuinely new action or quantity; do not reuse one slot-derived ID for every future partial transfer. Replaying an applied operation returns the existing state. `moveSlot` swaps occupied positions; derive empty display cells from remaining capacity.

Use the exact preflight errors: e.g. `Need 4 more load capacity.`, `No free slots.`, `Stack limit reached.` Support quantity selection on transfers, deposits, withdrawals, overflow retrieval and discard. Preview the destination's slots and load. Never spend resources in a component.

`heistReadiness(s, member, {items?, combatRank?, equipped?})` returns null or a reason. Call it again when later heist content starts. Invitations record an event; no heist content is authored here. Member Combat certification/rank checks match the player's; giving a weapon awards no skill.

`RESIDENCES` contains existing rest locations, one per zone. No new board objects are needed. `releaseProperty` refuses nonempty safes; after physically emptying one, it may be relinquished with no refund. Members cannot open the player's safe. `loseCarried` and its error twin provide the personal-risk loss boundary, touching neither safes nor overflow. No automatic searches, raids or encumbrance penalties are added.

## Existing-system integration

Giving merchandise to a Set member creates a directional child lot/agreement at the existing $15 wholesale unit floor, with no cash paid/reserved up front. Members use existing NPC trading/agency; collect real cash in person. Taking unsold units back restores the original lot and removes only outstanding unsold member liability. Sold-unit debt and the player's original supplier agreement remain. Quanny's non-Set rules are preserved; his Set front offer uses one bounded carried stack with matching displayed terms.

Purchases, supplier packs, Flacco's gift, authored equipment rewards, prep purchases and sales/losses use physical capacity. Robbery cash loot remains cash. Future physical rewards must use shared `gainError` / `receivePhysical` inside an owned transaction snapshot **before** spending resources or consuming a quest reward. Never create overflow for new acquisitions. `grantEquipmentError` / `grantEquipment` support retry and prevent reusing a claimed source-event reward. Direct-to-safe new purchases are not offered; receive then deposit, or retrieve legacy items directly into the safe while there.

Prep's existing `robberies.items` ledger counts player-owned units across person/storage; eligibility reads physical slots. Do not use that ledger as an on-person display. The ledger accounts for transfer/discard history as well as purchases and consumed preparation.

## Saves

Schema is **v11**, with explicit v8-v10 migration. Equipped gear is prioritized, then equipment/possessions/stock/prep; excess slots or load become bounded legacy stacks. Original quantities, lot IDs, suppliers, debts and historical records remain. Existing manual/auto save keys are unchanged. Validation covers capacities, stack limits, unique slot IDs, carried projections, physical/economic merchandise equality, property records and exchange history. Save round trips and old versions are tested.

## Temporary wiring and art

`src/ui/InventoryTestControls.tsx` supplies minimal test controls only with **`?inventory-review=1`**, inside the existing selected place/person City inspector. `App.tsx` adds that single conditional hook. Replace it with Claude's final panels; default presentation gains no controls and menus gain no actions. `tests/inventory.spec.ts` uses the actual City to buy, deposit, give/equip, assert bonuses, and test capacity refusal without loss. Its final capacity scenario uses a valid prefilled safe fixture.

No new art is supplied. **Law-19, Law-19 Switch and ARP need icons.** New non-merchandise exchange records currently use text and an empty icon.

## Balance probe

The bounded 180-day inventory/economy probe uses existing gig/purchase rules, two pre-funded residences and replenishing supplier budget, isolating storage from narrative presentation. At days 30/60/180 it admits **19/23/40 packs**, rejects **11/37/140** for capacity, and records **24/48/150** voluntarily discarded units. Each safe reaches 36 load: another six-unit pack requires splitting despite spare slots. This establishes storage tradeoffs within that scenario; full-world 30/60/180/365-day simulations remain separate regressions.

See `validation/goal-012/RESULTS.md` for final commands, outcomes and baseline failures. This work is unmerged and has not been deployed.
