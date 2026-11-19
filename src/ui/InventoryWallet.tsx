import { placeName, jobName, playerText } from "../presentation/PlayerInformation";
import { PREPARATION } from "../systems/Robbery";
import { MERCHANDISE } from "../content/street";
import { quannyCollectionInstruction } from "../systems/QuannyState";
import { player, type GameState } from "../core/GameState";
import { lotProfit } from "../systems/StreetEconomy";
import { money } from "./ActionCard";
import { CarriedPanel } from "./inventory/InventoryPanels";
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
        <CarriedPanel s={s} change={change} />
        <h4>Supplies</h4>
        {Object.entries(PREPARATION).map(([id, d]) => (
          <p key={id}>
            {d.name}: {s.robberies?.items[id as keyof typeof PREPARATION] ?? 0}{" "}
            · buy at {placeName(s, d.location)}
          </p>
        ))}
        <h4>Jobs</h4>
        {s.robberies?.jobs
          .filter((j) => j.status === "offered")
          .map((j) => (
            <p key={j.id}>
              {jobName(s, j.id)} · {placeName(s, j.location)} · expires day {j.expiresDay}. Visit the
              physical City target.
            </p>
          ))}
        <details className="lot-records">
          <summary>
            Pink Magic lots · {held.length} open (on you, in safes or fronted)
          </summary>
          {held.map((l) => (
            <details className="inventory-slot" data-lot={l.id} key={l.id}>
              <summary>
                <strong>Pink Magic</strong>
                <b>×{l.remaining}</b>
                <small>Details</small>
              </summary>
              {detail(l)}
            </details>
          ))}
          {!held.length && <p className="empty-slot">No open lots.</p>}
        </details>
        <h4>Equipment</h4>
        <p>
          A weapon only helps if you’re carrying it and know how to use it. Tap
          it to equip. You won’t find these in stores; they come from people
          you know.
        </p>

      </section>
      <section
        className="panel obligations-panel"
        aria-label="What you owe"
      >
        <h3>What you owe</h3>
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
        {!debts.length && <p>You don’t owe any suppliers.</p>}
        <p className="muted">
          Unmet living expenses: {money(s.street.arrears)}
        </p>
      </section>
      {s.street.agreements.some((a) => a.supplier === p.id) && (
        <section className="panel" aria-label="Packs you fronted">
          <h3>Packs you fronted</h3>
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
                    : `Collect on day ${a.dueDay}.`}
                </p>
                {a.collections?.map((c) => (
                  <p key={c.eventId}>
                    Day {c.day} · {playerText(s, c.result)}
                  </p>
                ))}
              </div>
            ))}
        </section>
      )}
      <section
        className="panel transaction-history"
        aria-label="Money in and out"
      >
        <h3>Money in and out</h3>
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
          <summary>Packs from suppliers</summary>
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
          <summary>Where your stuff went</summary>
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
