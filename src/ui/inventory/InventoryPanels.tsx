import { useState } from "react";
import type { GameState } from "../../core/GameState";
import { player } from "../../core/GameState";
import { ITEM_DEFINITIONS } from "../../content/inventory";
import { presenceOf } from "../../board/presence";
import { locationById } from "../../board/locations";
import { EQUIPMENT, equipmentBonus } from "../../systems/Equipment";
type WeaponId = keyof typeof EQUIPMENT;
const weapon = (id: string | null) => id as WeaponId | null;
import {
  inventoryOf,
  safeOf,
  splitStack,
  splitStackError,
  mergeStack,
  mergeStackError,
  moveSlot,
  moveSlotError,
  type ItemStack,
} from "../../systems/Inventory";
import {
  giveItem,
  giveItemError,
  takeItem,
  takeItemError,
  equipItem,
  equipItemError,
  discardItem,
  discardItemError,
  claimOverflow,
  claimOverflowError,
  collectSetConsignment,
  collectSetConsignmentError,
} from "../../systems/InventoryExchanges";
import {
  RESIDENCES,
  buyProperty,
  buyPropertyError,
  deposit,
  depositError,
  withdraw,
  withdrawError,
} from "../../systems/Residences";
import { Capacity, ItemArt, Quantity, SlotGrid, TransferPanel, useIntent } from "./Slots";

type Change = (s: GameState) => void;
const name = (x: ItemStack) => ITEM_DEFINITIONS[x.itemId].name;
const apply = (r: GameState | string, change: Change, fail: (e: string) => void) =>
  typeof r === "string" ? fail(r) : change(r);

/** One stack's facts, shared by every panel that shows a selection. */
function StackFacts({ s, x }: { s: GameState; x: ItemStack }) {
  const d = ITEM_DEFINITIONS[x.itemId];
  const lot = x.kind === "merchandise" ? s.street.lots.find((l) => l.id === x.lotId) : null;
  const eq = x.kind === "equipment" ? EQUIPMENT[x.itemId as keyof typeof EQUIPMENT] : null;
  return (
    <div className="stack-facts">
      <ItemArt itemId={x.itemId} />
      <div>
        <strong>
          {d.name} ×{x.quantity}
        </strong>
        <small>
          {d.load} load each · {x.quantity * d.load} total · stacks to {d.stack}
        </small>
        {eq && (
          <small>
            Attack +{eq.attack} · Defense +{eq.defense} · Combat rank {eq.rank}
          </small>
        )}
        {lot && (
          <small>
            From {s.characters[lot.supplier]?.alias ?? s.characters[lot.supplier]?.name ?? lot.supplier} ·{" "}
            {lot.arrangement === "consignment" ? `fronted, $${lot.owed} owed` : "paid in cash"}
          </small>
        )}
      </div>
    </div>
  );
}

/**
 * Wallet: what's on your person. Rearranging, splitting, merging and equipping
 * are your own business; handing things over and the safe happen in the city.
 */
export function CarriedPanel({ s, change }: { s: GameState; change: Change }) {
  const p = player(s),
    inv = inventoryOf(s);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"swap" | null>(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const intent = useIntent();
  const x = inv.slots.find((y) => y.id === sel);
  const equipped = p.equipment?.equipped ?? null;
  const overflow = s.inventory?.overflow[p.id] ?? [];
  const owned = Object.values(s.residences ?? {}).filter((r) => r.owner === p.id);
  const pick = (y: ItemStack) => {
    setErr(null);
    if (mode === "swap" && x && y.id !== x.id) {
      const to = inv.slots.findIndex((z) => z.id === y.id);
      apply(moveSlot(s, p.id, x.id, to), change, setErr);
      setMode(null);
      return;
    }
    setMode(null);
    setSel(y.id);
    setQty(Math.max(1, Math.floor(y.quantity / 2)));
  };
  const mergeTargets = x
    ? inv.slots.filter((y) => y.id !== x.id && !mergeStackError(s, p.id, x.id, y.id))
    : [];
  return (
    <div className="carried-panel">
      <p className="eyebrow">On your person</p>
      <Capacity inv={inv} type="player" />
      <SlotGrid inv={inv} type="player" label="Your slots" selected={sel} equipped={equipped} onSelect={pick} />
      {mode === "swap" && <p className="city-hint">Tap another item to swap places.</p>}
      {x && (
        <div className="slot-detail" aria-label="Selected item">
          <StackFacts s={s} x={x} />
          <div className="slot-actions">
            {x.kind === "equipment" && (
              <button
                disabled={equipped !== x.itemId && !!equipItemError(s, p.id, weapon(x.itemId)!)}
                onClick={() =>
                  apply(equipItem(s, p.id, equipped === x.itemId ? null : weapon(x.itemId)), change, setErr)
                }
              >
                {equipped === x.itemId ? "Unequip" : "Equip"} {name(x)}
              </button>
            )}
            {inv.slots.length > 1 && (
              <button className="secondary" onClick={() => setMode(mode ? null : "swap")}>
                {mode ? "Cancel move" : "Move"}
              </button>
            )}
            {x.quantity > 1 && (
              <div className="split-row">
                <Quantity value={Math.min(qty, x.quantity - 1)} max={x.quantity - 1} onChange={setQty} />
                <button
                  className="secondary"
                  disabled={!!splitStackError(s, p.id, x.id, Math.min(qty, x.quantity - 1))}
                  onClick={() => {
                    const q = Math.min(qty, x.quantity - 1);
                    apply(splitStack(s, p.id, x.id, q, intent(`split:${x.id}:${q}:${x.quantity}`)), change, setErr);
                  }}
                >
                  Split off {Math.min(qty, x.quantity - 1)}
                </button>
              </div>
            )}
            {mergeTargets.map((y) => (
              <button
                key={y.id}
                className="secondary"
                onClick={() =>
                  apply(mergeStack(s, p.id, x.id, y.id, intent(`merge:${x.id}:${y.id}:${x.quantity}`)), change, setErr)
                }
              >
                Combine with ×{y.quantity}
              </button>
            ))}
          </div>
          {x.kind === "equipment" && equipped !== x.itemId && equipItemError(s, p.id, weapon(x.itemId)!) && (
            <p className="disabled-reason">{equipItemError(s, p.id, weapon(x.itemId)!)}</p>
          )}
          {err && <p className="disabled-reason">{err}</p>}
          <p className="city-hint">
            Hand it to someone in your Set, put it in your safe, or get rid of it in the city.
          </p>
        </div>
      )}
      {overflow.length > 0 && (
        <div className="overflow-list">
          <p className="eyebrow">Legacy holding · from an older save</p>
          <p className="city-hint">
            These didn't fit when your save was upgraded. They can't be sold or equipped here; collect what fits from your card in the city.
          </p>
          <SlotGrid inv={{ slots: overflow }} type="safe" label="Legacy holding" />
        </div>
      )}
      {owned.length > 0 && (
        <div className="safes-list">
          <p className="eyebrow">Your safes</p>
          {owned.map((r) => (
            <div className="known-contact" key={r.id}>
              <strong>{locationById(r.location)?.name ?? r.location}</strong>
              <Capacity inv={r.safe} type="safe" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Your own card in the city: get rid of things here, collect legacy items. */
export function SelfCarryCard({ s, change }: { s: GameState; change: Change }) {
  const p = player(s),
    inv = inventoryOf(s),
    here = presenceOf(s).location;
  const [sel, setSel] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const intent = useIntent();
  const x = inv.slots.find((y) => y.id === sel);
  const overflow = s.inventory?.overflow[p.id] ?? [];
  const o = overflow.find((y) => y.id === sel);
  const ownedHere = s.residences?.[here]?.owner === p.id ? here : undefined;
  if (!inv.slots.length && !overflow.length) return null;
  const q = Math.min(qty, (x ?? o)?.quantity ?? 1);
  return (
    <details className="self-carry" aria-label="What you're carrying">
      <summary>
        <span>What you're carrying</span>
        <Capacity inv={inv} type="player" />
      </summary>
      <SlotGrid
        inv={inv}
        type="player"
        label="Your slots"
        selected={sel}
        equipped={p.equipment?.equipped}
        onSelect={(y) => {
          setSel(y.id);
          setQty(y.quantity);
          setErr(null);
        }}
      />
      {x && (
        <div className="slot-detail">
          <StackFacts s={s} x={x} />
          <Quantity value={q} max={x.quantity} onChange={setQty} />
          <button
            className="danger"
            disabled={!!discardItemError(s, x.id, q, here)}
            onClick={() => {
              apply(discardItem(s, x.id, q, here, intent(`discard:${x.id}:${q}:${x.quantity}`)), change, setErr);
              setSel(null);
            }}
          >
            Get rid of {q}
          </button>
          <p className="city-hint">
            Gone for good: no refund{x.kind === "merchandise" ? ", and what you owe your plug still stands" : ""}.
          </p>
          {(discardItemError(s, x.id, q, here) || err) && (
            <p className="disabled-reason">{discardItemError(s, x.id, q, here) ?? err}</p>
          )}
        </div>
      )}
      {overflow.length > 0 && (
        <>
          <p className="eyebrow">Legacy holding</p>
          <SlotGrid
            inv={{ slots: overflow }}
            type="safe"
            label="Legacy holding"
            selected={sel}
            onSelect={(y) => {
              setSel(y.id);
              setQty(y.quantity);
              setErr(null);
            }}
          />
          {o && (
            <div className="slot-detail">
              <StackFacts s={s} x={o} />
              <Quantity value={q} max={o.quantity} onChange={setQty} />
              <button
                disabled={!!claimOverflowError(s, p.id, o.id, q)}
                onClick={() => apply(claimOverflow(s, p.id, o.id, q, undefined, intent(`claim:${o.id}:${q}`)), change, setErr)}
              >
                Take {q} with you
              </button>
              {ownedHere && (
                <button
                  className="secondary"
                  disabled={!!claimOverflowError(s, p.id, o.id, q, ownedHere)}
                  onClick={() =>
                    apply(claimOverflow(s, p.id, o.id, q, ownedHere, intent(`claim-safe:${o.id}:${q}`)), change, setErr)
                  }
                >
                  Put {q} in this safe
                </button>
              )}
              {(claimOverflowError(s, p.id, o.id, q, ownedHere) || err) && (
                <p className="disabled-reason">{err ?? claimOverflowError(s, p.id, o.id, q, ownedHere)}</p>
              )}
            </div>
          )}
        </>
      )}
    </details>
  );
}

/** A home on the board: buy it, then use its safe while you're standing there. */
export function ResidencePanel({ s, placeId, change }: { s: GameState; placeId: string; change: Change }) {
  const d = RESIDENCES.find((r) => r.id === placeId);
  const intent = useIntent();
  const [err, setErr] = useState<string | null>(null);
  if (!d) return null;
  const owned = s.residences?.[placeId];
  const mine = owned?.owner === s.playerId;
  const here = presenceOf(s).location === d.location;
  if (!owned)
    return (
      <section className="residence-panel" aria-label="Residence">
        <p className="eyebrow">Residence for sale</p>
        <p className="board-facts">
          ${d.price} · comes with a safe ({safeSize()})
        </p>
        <button
          disabled={!!buyPropertyError(s, placeId)}
          onClick={() => apply(buyProperty(s, placeId, intent(`buy:${placeId}`)), change, setErr)}
        >
          Buy for ${d.price}
        </button>
        {(buyPropertyError(s, placeId) || err) && (
          <p className="disabled-reason">{err ?? buyPropertyError(s, placeId)}</p>
        )}
      </section>
    );
  if (!mine) return null;
  const safe = safeOf(s, placeId)!;
  return (
    <section className="residence-panel" aria-label="Your residence">
      <p className="eyebrow">Your place · safe</p>
      {!here ? (
        <>
          <Capacity inv={safe} type="safe" label="Safe" />
          <p className="city-hint">Stand here to open the safe.</p>
        </>
      ) : (
        <TransferPanel
          change={change}
          a={{
            label: "On you",
            inv: inventoryOf(s),
            type: "player",
            equipped: player(s).equipment?.equipped,
            verb: {
              label: "Put in safe",
              error: (id, q) => depositError(s, placeId, id, q),
              run: (id, q, op) => deposit(s, placeId, id, q, op),
            },
          }}
          b={{
            label: "Safe",
            inv: safe,
            type: "safe",
            verb: {
              label: "Take out",
              error: (id, q) => withdrawError(s, placeId, id, q),
              run: (id, q, op) => withdraw(s, placeId, id, q, op),
            },
          }}
        />
      )}
    </section>
  );
}
const safeSize = () => "24 slots, 40 load";

/** A Set member on the board: their gear, and handing things over in person. */
export function MemberInventory({ s, id, change }: { s: GameState; id: string; change: Change }) {
  const c = s.characters[id];
  const [err, setErr] = useState<string | null>(null);
  const intent = useIntent();
  if (!s.crew.members.includes(id)) return null;
  const inv = inventoryOf(s, id),
    eq = c.equipment?.equipped ?? null,
    bonus = equipmentBonus(c),
    who = c.alias ?? c.name;
  const weapons = inv.slots.filter((x) => x.kind === "equipment");
  const owed = s.street.agreements.filter((a) => a.setConsignment && a.debtor === id && a.balance > 0);
  return (
    <div className="member-inventory" aria-label={`${who}'s gear`}>
      <p className="eyebrow">In your Set · gear</p>
      <p className="board-facts">
        {eq ? `Carrying ${ITEM_DEFINITIONS[eq as keyof typeof ITEM_DEFINITIONS]?.name ?? eq}` : "No weapon equipped"} · Attack +{bonus.attack} · Defense +
        {bonus.defense}
      </p>
      <TransferPanel
        change={change}
        note={<p className="city-hint">Pink Magic you hand over is always fronted: {who} owes you for it.</p>}
        a={{
          label: "You",
          inv: inventoryOf(s),
          type: "player",
          equipped: player(s).equipment?.equipped,
          verb: {
            label: `Give ${who}`,
            error: (sid, q) => giveItemError(s, id, sid, q),
            run: (sid, q, op) => giveItem(s, id, sid, q, op),
          },
        }}
        b={{
          label: who,
          inv,
          type: "member",
          equipped: eq,
          verb: {
            label: "Take back",
            error: (sid, q) => takeItemError(s, id, sid, q),
            run: (sid, q, op) => takeItem(s, id, sid, q, op),
          },
        }}
      />
      {weapons.length > 0 && (
        <div className="slot-actions">
          {weapons.map((w) => (
            <button
              key={w.id}
              className="secondary"
              disabled={eq !== w.itemId && !!equipItemError(s, id, weapon(w.itemId)!)}
              onClick={() => apply(equipItem(s, id, eq === w.itemId ? null : weapon(w.itemId)), change, setErr)}
            >
              {eq === w.itemId ? "Unequip" : "Have them carry"} {ITEM_DEFINITIONS[w.itemId].name}
            </button>
          ))}
        </div>
      )}
      {owed.map((a) => (
        <div className="known-contact" key={a.id}>
          <strong>
            {who} owes you ${a.balance}
          </strong>
          <span>For fronted Pink Magic · due day {a.dueDay}</span>
          <button
            disabled={!!collectSetConsignmentError(s, a.id)}
            onClick={() => apply(collectSetConsignment(s, a.id, intent(`collect:${a.id}:${a.balance}`)), change, setErr)}
          >
            Collect ${a.balance}
          </button>
          {collectSetConsignmentError(s, a.id) && (
            <small className="disabled-reason">{collectSetConsignmentError(s, a.id)}</small>
          )}
        </div>
      ))}
      {err && <p className="disabled-reason">{err}</p>}
    </div>
  );
}

/** Set tab: look, don't touch. Exchanges happen in person in the city. */
export function MemberGear({ s, id }: { s: GameState; id: string }) {
  const c = s.characters[id],
    inv = inventoryOf(s, id),
    bonus = equipmentBonus(c);
  return (
    <div className="member-gear" aria-label={`${c.name}'s inventory`}>
      <Capacity inv={inv} type="member" />
      <SlotGrid inv={inv} type="member" label={`${c.name}'s slots`} equipped={c.equipment?.equipped} />
      <small className="muted">
        Attack +{bonus.attack} · Defense +{bonus.defense} · hand things over in person in the city
      </small>
    </div>
  );
}
