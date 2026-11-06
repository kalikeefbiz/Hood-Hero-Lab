/** Temporary City-card controls, visible only with ?inventory-review=1.
 * Claude replaces these with the final place/person presentation. No menu actions. */
import type { GameState } from "../core/GameState";
import {
  buyProperty,
  buyPropertyError,
  deposit,
  depositError,
} from "../systems/Residences";
import {
  giveItem,
  giveItemError,
  equipItem,
} from "../systems/InventoryExchanges";
import {
  inventoryOf,
  characterCapacity,
  safeOf,
  capacityOf,
} from "../systems/Inventory";
import { equipmentBonus } from "../systems/Equipment";
export function InventoryTestControls({
  s,
  place,
  member,
  change,
}: {
  s: GameState;
  place?: string;
  member?: string;
  change: (s: GameState) => void;
}) {
  const run = (result: GameState | string) => {
    if (typeof result !== "string") change(result);
  };
  const c = member
    ? characterCapacity(s, member)
    : place && safeOf(s, place)
      ? capacityOf(safeOf(s, place)!, "safe")
      : characterCapacity(s);
  return (
    <section aria-label="Inventory integration controls">
      <p>
        {c.usedSlots}/{c.maxSlots} slots · {c.usedLoad}/{c.maxLoad} load
      </p>
      {place && !s.residences?.[place] && (
        <button
          disabled={!!buyPropertyError(s, place)}
          onClick={() => run(buyProperty(s, place))}
        >
          Buy residence
        </button>
      )}
      {member && (
        <p>
          Attack {equipmentBonus(s.characters[member]).attack} · Defense{" "}
          {equipmentBonus(s.characters[member]).defense}
        </p>
      )}
      {inventoryOf(s).slots.map((x) => {
        const error = member
          ? giveItemError(s, member, x.id, x.quantity)
          : place
            ? depositError(s, place, x.id, x.quantity)
            : "Choose a person or residence.";
        return (
          <div key={x.id}>
            <button
              disabled={!!error}
              onClick={() =>
                run(
                  member
                    ? giveItem(s, member, x.id, x.quantity, `give:${x.id}`)
                    : deposit(s, place!, x.id, x.quantity, `deposit:${x.id}`),
                )
              }
            >
              {member ? "Give" : "Deposit"} {x.itemId} ×{x.quantity}
            </button>
            {error && <p>{error}</p>}
          </div>
        );
      })}
      {member &&
        inventoryOf(s, member).slots.some((x) => x.itemId === "law-19") && (
          <button onClick={() => run(equipItem(s, member, "law-19"))}>
            Equip member Law-19
          </button>
        )}
    </section>
  );
}
