import { PREPARATION } from "../systems/Robbery";
import { MERCHANDISE } from "../content/street";
import {
  equip,
  equipError,
  equipmentOf,
  EQUIPMENT,
} from "../systems/Equipment";
import { quannyCollectionInstruction } from "../systems/QuannyState";
import { player, type GameState } from "../core/GameState";
import { lotProfit } from "../systems/StreetEconomy";
import { ITEMS } from "../content/economy";
import { money } from "./ActionCard";
import { Icon } from "./Icon";
export function InventoryWallet({
  s,
  open,
  change,
}: {
  s: GameState;
  change: (s: GameState) => void;
  /** Find the plug on the board; repayment is settled with them in person. */
  open: (id: string) => void;
}) {
  const p = player(s),
    lots = s.street.lots.filter((l) => l.owner === p.id),
    held = lots.filter((l) => l.remaining > 0),
    debts = s.street.agreements.filter(
      (a) => a.debtor === p.id && a.balance > 0,
    );
  const detail = (l: (typeof lots)[number]) => (
    <div className="lot-details">
      <p>{MERCHANDISE.nightgoods.description}</p>
      <p>
        Supplier:{" "}
        {s.characters[l.supplier].alias ?? s.characters[l.supplier].name} ·{" "}
        {s.zones[l.zone].name}
      </p>
      <p>
        Acquisition {money(l.cost)} · paid {money(l.paid)} · debt{" "}
        {money(l.owed)}
        {l.owed ? ` · due day ${l.dueDay}` : ""}
      </p>
      <p>
        Collected {money(l.collected)} · losses {money(l.losses)} · crew share{" "}
        {money(l.crewPaid)}
      </p>
      <p>
        {l.remaining} held / {l.received} received · {l.lost} lost ·{" "}
        {l.transferred ?? 0} fronted · result after supplier cost{" "}
        {money(lotProfit(l))}
        {l.remaining ? " (goods remain)" : ""}
      </p>
    </div>
  );
  return (
    <>
      <section className="panel inventory-panel" aria-label="Inventory">
        <p className="eyebrow">ON HAND</p>
        <h3>Inventory</h3>
        <p>
          {held.reduce((n, l) => n + l.remaining, 0)} Pink Magic in{" "}
          {held.length} held lots.
        </p>
        <h4>Preparation supplies</h4>
        {Object.entries(PREPARATION).map(([id, d]) => (
          <p key={id}>
            {d.name}: {s.robberies?.items[id as keyof typeof PREPARATION] ?? 0}{" "}
            · buy at {d.location}
          </p>
        ))}
        <h4>Robbery opportunities</h4>
        {s.robberies?.jobs
          .filter((j) => j.status === "offered")
          .map((j) => (
            <p key={j.id}>
              {j.kind} · {j.location} · expires day {j.expiresDay}. Visit the
              physical City target.
            </p>
          ))}
        <p>Store and bank scores: future content, unavailable.</p>
        <div className="inventory-grid">
          {held.map((l) => (
            <details className="inventory-slot" data-lot={l.id} key={l.id}>
              <summary>
                <span className="item-placeholder" aria-hidden="true">
                  ▧
                </span>
                <strong>Pink Magic</strong>
                <b>×{l.remaining}</b>
                <small>View lot details</small>
              </summary>
              {detail(l)}
            </details>
          ))}
          {!held.length && (
            <p className="empty-slot">No merchandise on hand.</p>
          )}
        </div>
        <h4>Equipment</h4>
        <p>
          Only equipped, rank-eligible tools grant bonuses. Story/contact
          rewards may grant equipment; stores do not sell it.
        </p>
        {equipmentOf(p).owned.length === 0 && <p>No equipment owned.</p>}
        {equipmentOf(p).owned.map((id) => {
          const def = EQUIPMENT[id],
            equipped = p.equipment?.equipped === id,
            reason = equipError(p, id);
          return (
            <div key={id}>
              <strong>
                {def.name} · {def.type}
              </strong>
              <p>
                Attack +{def.attack} · Defense +{def.defense} · Combat rank{" "}
                {def.rank}
                {equipped ? " · Equipped" : ""}
              </p>
              <button
                disabled={!equipped && !!reason}
                onClick={() => {
                  const next = structuredClone(s);
                  equip(player(next), equipped ? null : id);
                  change(next);
                }}
              >
                {equipped ? "Unequip" : "Equip"} {def.name}
              </button>
              {reason && <p>{reason}</p>}
            </div>
          );
        })}
        {p.possessions.length > 0 && (
          <>
            <h4>Personal possessions</h4>
            <div className="possession-grid">
              {p.possessions.map((id) => (
                <span className="possession-slot" key={id}>
                  <Icon name="People" />
                  {ITEMS[id as keyof typeof ITEMS]?.name ?? id}
                </span>
              ))}
            </div>
          </>
        )}
      </section>
      <section
        className="panel obligations-panel"
        aria-label="Outstanding obligations"
      >
        <h3>Outstanding obligations</h3>
        {debts.map((a) => (
          <div className="obligation-row" key={a.id}>
            <strong>
              {s.characters[a.supplier].alias ?? s.characters[a.supplier].name}{" "}
              · {money(a.balance)}
            </strong>
            <p>
              Due end of day {a.dueDay} · {a.status} · {money(a.repaid)} repaid
            </p>
            <button
              disabled={
                p.status !== "active" ||
                s.characters[a.supplier].status !== "active"
              }
              onClick={() => open(a.supplier)}
            >
              Find {s.characters[a.supplier].alias ?? s.characters[a.supplier].name} on map →
            </button>
          </div>
        ))}
        {!debts.length && <p>No outstanding supplier balance.</p>}
        <p className="muted">
          Unmet living expenses: {money(s.street.arrears)}
        </p>
      </section>
      {s.street.agreements.some((a) => a.supplier === p.id) && (
        <section className="panel" aria-label="Merchandise fronted to others">
          <h3>Merchandise fronted to others</h3>
          {s.street.agreements
            .filter((a) => a.supplier === p.id)
            .map((a) => (
              <div key={a.id}>
                <p>
                  {s.characters[a.debtor].name} owes you {money(a.balance)} ·{" "}
                  {a.quantity} Pink Magic · {a.status}
                </p>
                <p>
                  Agreed {money(a.original)} · paid {money(a.repaid)}
                </p>
                <p>
                  {a.debtor === "quanny"
                    ? quannyCollectionInstruction(s, a.dueDay)
                    : `Collection day ${a.dueDay}.`}
                </p>
                {a.collections?.map((c) => (
                  <p key={c.eventId}>
                    Day {c.day} · {c.result} · notoriety {c.notoriety}
                  </p>
                ))}
              </div>
            ))}
        </section>
      )}
      <section
        className="panel transaction-history"
        aria-label="Transaction history"
      >
        <h3>Transaction history</h3>
        {s.street.transactions
          .filter((t) => t.actor === p.id)
          .slice(-20)
          .reverse()
          .map((t) => (
            <p className="ledger" key={t.id}>
              Day {t.day} · {t.outcome} · {t.sold} sold / {t.lost} lost ·{" "}
              {money(t.gross)} gross / {money(t.loss)} loss
              {t.partner ? ` · with ${s.characters[t.partner].name}` : ""}
            </p>
          ))}
        {!s.street.transactions.some((t) => t.actor === p.id) && (
          <p>No street transactions yet.</p>
        )}
        <details>
          <summary>Supplier and lot records</summary>
          {lots.map((l) => (
            <details key={l.id}>
              <summary>
                Pink Magic · day {l.acquiredDay} · {l.status}
              </summary>
              {detail(l)}
            </details>
          ))}
          {s.street.agreements
            .filter((a) => a.debtor === p.id)
            .map((a) => (
              <p key={a.id}>
                {s.characters[a.supplier].name} · {a.status} ·{" "}
                {money(a.balance)} outstanding / {money(a.original)} agreed
              </p>
            ))}
        </details>
        <details>
          <summary>Custody history</summary>
          {s.street.custody
            .filter((r) => r.character === p.id)
            .map((r) => (
              <p key={r.id}>
                Custody record · {r.status} · arrest day {r.arrestDay} · release
                day {r.releaseDay ?? "not defined"} · current status: {p.status}
              </p>
            ))}
        </details>
      </section>
    </>
  );
}
