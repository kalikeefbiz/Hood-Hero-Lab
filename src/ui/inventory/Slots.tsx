import { useRef, useState, type ReactNode } from "react";
import type { GameState } from "../../core/GameState";
import { ITEM_DEFINITIONS, type PhysicalItemId } from "../../content/inventory";
import { capacityOf, type Inventory, type ItemStack } from "../../systems/Inventory";
import { ITEM_ICONS } from "../exchanges";

export type Container = "player" | "member" | "safe";
const def = (id: PhysicalItemId) => ITEM_DEFINITIONS[id];

/**
 * Approved art where it exists (Pink Magic). Everything else gets a plain
 * labelled badge until its icon is made — never stand-in artwork.
 */
export function ItemArt({ itemId }: { itemId: PhysicalItemId }) {
  const art = ITEM_ICONS[itemId];
  if (art) return <img className="item-art" src={art} alt="" />;
  const d = def(itemId);
  const initials = d.name
    .replace(/[^A-Za-z0-9 -]/g, "")
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <span className={`item-art item-badge kind-${d.kind}`} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Slots and load, side by side. Load is the one that usually binds. */
export function Capacity({
  inv,
  type,
  label,
  extraLoad = 0,
}: {
  inv: Inventory;
  type: Container;
  label?: string;
  /** Preview: load this transfer would add. */
  extraLoad?: number;
}) {
  const c = capacityOf(inv, type),
    after = c.usedLoad + extraLoad,
    pct = (n: number) => `${Math.min(100, (n / c.maxLoad) * 100)}%`;
  return (
    <div className="capacity" aria-label={`${label ?? "Capacity"}: ${c.usedSlots} of ${c.maxSlots} slots, ${c.usedLoad} of ${c.maxLoad} load`}>
      {label && <span className="capacity-label">{label}</span>}
      <span className="capacity-slots">
        {c.usedSlots}/{c.maxSlots} slots
      </span>
      <span className="capacity-load">
        {c.usedLoad}
        {extraLoad ? ` → ${after}` : ""}/{c.maxLoad} load
      </span>
      <span className="load-bar" aria-hidden="true">
        <span className="load-used" style={{ width: pct(c.usedLoad) }} />
        {extraLoad > 0 && (
          <span
            className={`load-preview ${after > c.maxLoad ? "over" : ""}`}
            style={{ left: pct(c.usedLoad), width: pct(Math.min(extraLoad, c.maxLoad)) }}
          />
        )}
      </span>
    </div>
  );
}

/** Fixed slot grid: occupied stacks, then empty cells up to the container's limit. */
export function SlotGrid({
  inv,
  type,
  selected,
  onSelect,
  equipped,
  label,
}: {
  inv: Inventory;
  type: Container;
  selected?: string | null;
  onSelect?: (stack: ItemStack) => void;
  equipped?: string | null;
  label: string;
}) {
  const c = capacityOf(inv, type);
  return (
    <div className="slot-grid" role="group" aria-label={label}>
      {inv.slots.map((x) => {
        const d = def(x.itemId);
        return (
          <button
            key={x.id}
            type="button"
            className={`slot filled kind-${x.kind} ${selected === x.id ? "selected" : ""}`}
            aria-pressed={selected === x.id}
            aria-label={`${d.name} ×${x.quantity}${equipped === x.itemId ? ", equipped" : ""}`}
            data-slot={x.id}
            onClick={() => onSelect?.(x)}
            disabled={!onSelect}
          >
            <ItemArt itemId={x.itemId} />
            <span className="slot-name">{d.name}</span>
            <span className="slot-qty">×{x.quantity}</span>
            {equipped === x.itemId && <span className="slot-flag" title="Equipped">EQ</span>}
          </button>
        );
      })}
      {Array.from({ length: Math.max(0, c.remainingSlots) }, (_, i) => (
        <span key={`empty-${i}`} className="slot empty" aria-hidden="true" />
      ))}
    </div>
  );
}

/** Whole-unit quantity picker, 1…max. */
export function Quantity({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const set = (n: number) => onChange(Math.max(1, Math.min(max, n)));
  return (
    <div className="quantity" role="group" aria-label="Quantity">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="One fewer">
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="One more">
        +
      </button>
      {max > 1 && (
        <button type="button" className="text-button" onClick={() => set(max)} disabled={value === max}>
          All {max}
        </button>
      )}
    </div>
  );
}

/**
 * One operation id per player intent, kept for repeated taps on the same
 * intent, so a double tap can never apply twice.
 */
export function useIntent() {
  const ids = useRef(new Map<string, string>());
  return (key: string) => {
    let id = ids.current.get(key);
    if (!id) {
      id = `${key}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      ids.current.set(key, id);
    }
    return id;
  };
}

export interface TransferVerb {
  label: string;
  error: (slotId: string, quantity: number) => string | null;
  run: (slotId: string, quantity: number, operationId: string) => GameState | string;
}

/**
 * Two containers face to face: pick a stack on either side, choose how many,
 * see what the other side's load becomes, then move it.
 */
export function TransferPanel({
  a,
  b,
  change,
  note,
  presentReason,
}: {
  a: { label: string; inv: Inventory; type: Container; verb: TransferVerb; equipped?: string | null };
  b: { label: string; inv: Inventory; type: Container; verb: TransferVerb; equipped?: string | null };
  change: (s: GameState) => void;
  note?: ReactNode;
  presentReason: (reason: string | null) => string;
}) {
  const [pick, setPick] = useState<{ side: "a" | "b"; id: string } | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const intent = useIntent();
  const from = pick?.side === "b" ? b : a,
    to = pick?.side === "b" ? a : b,
    stack = pick ? from.inv.slots.find((x) => x.id === pick.id) : undefined;
  const select = (side: "a" | "b") => (x: ItemStack) => {
    setPick({ side, id: x.id });
    setQty(x.quantity);
    setError(null);
  };
  const q = stack ? Math.min(qty, stack.quantity) : 0;
  const reason = stack ? from.verb.error(stack.id, q) : null;
  const extra = stack ? q * def(stack.itemId).load : 0;
  return (
    <div className="transfer-panel">
      {note}
      {([["a", a, b], ["b", b, a]] as const).map(([side, me, other]) => (
        <div className="transfer-side" key={side}>
          <Capacity
            inv={me.inv}
            type={me.type}
            label={me.label}
            extraLoad={stack && pick?.side !== side && other ? extra : 0}
          />
          <SlotGrid
            inv={me.inv}
            type={me.type}
            label={me.label}
            equipped={me.equipped}
            selected={pick?.side === side ? pick.id : null}
            onSelect={select(side)}
          />
        </div>
      ))}
      {stack && (
        <div className="transfer-action" aria-label="Move items">
          <strong>
            {def(stack.itemId).name} · {def(stack.itemId).load} load each
          </strong>
          <Quantity value={q} max={stack.quantity} onChange={setQty} />
          <button
            disabled={!!reason}
            onClick={() => {
              const r = from.verb.run(stack.id, q, intent(`${from.verb.label}:${stack.id}:${q}:${stack.quantity}`));
              if (typeof r === "string") setError(r);
              else {
                change(r);
                setPick(null);
              }
            }}
          >
            {from.verb.label} {q}
          </button>
          {(reason || error) && <p className="disabled-reason">{presentReason(reason ?? error)}</p>}
        </div>
      )}
    </div>
  );
}
