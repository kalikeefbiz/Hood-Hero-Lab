import { playerText } from "../presentation/PlayerInformation";
import { MERCHANDISE } from "../content/street";
import type { GameState } from "../core/GameState";
import { player } from "../core/GameState";
import { suppliers, supplierError } from "../systems/StreetEconomy";

/** Is this character someone the player can source merchandise from? */
export const isPlug = (s: GameState, id: string) =>
  suppliers(s).some((n) => n.id === id);

/** The player's open balance with a plug, if any. */
export const plugDebt = (s: GameState, id: string) =>
  s.street.agreements.find(
    (a) => a.supplier === id && a.debtor === s.playerId && a.balance > 0,
  );

/** A plug the player knows, as a short status line. */
export function plugStatus(s: GameState, id: string) {
  const debt = plugDebt(s, id);
  if (debt) {
    const debts = s.street.agreements.filter(
      (a) => a.supplier === id && a.debtor === s.playerId && a.balance > 0,
    );
    return `You owe $${debts.reduce((n, a) => n + a.balance, 0)}${debts.length > 1 ? ` across ${debts.length} packs` : ""} · due day ${Math.min(...debts.map((a) => a.dueDay))}`;
  }
  if (!player(s).connections.includes(id)) return "Not connected yet";
  const reasons = [
    supplierError(s, id, "cash"),
    supplierError(s, id, "consignment"),
  ];
  return reasons.some((r) => !r) ? "Pack available" : playerText(s, reasons[0]);
}

/**
 * The plug's offer and the way into the conversation where terms and
 * repayment are actually settled. Shared by Actions and the city, so both
 * read the same rules and open the same deal.
 */
export function PlugEntry({
  s,
  id,
  open,
}: {
  s: GameState;
  id: string;
  open: (id: string) => void;
}) {
  const c = s.characters[id],
    name = c.alias ?? c.name;
  if (!isPlug(s, id)) return null;
  const debt = plugDebt(s, id);
  const debts = s.street.agreements.filter(
    (a) => a.supplier === id && a.debtor === s.playerId && a.balance > 0,
  );
  const balance = debts.reduce((n, a) => n + a.balance, 0);
  const connected = player(s).connections.includes(id);
  const reasons = [
    ...new Set(
      [
        supplierError(s, id, "cash"),
        supplierError(s, id, "consignment"),
      ].filter((x): x is string => !!x),
    ),
  ];
  return (
    <div className="supplier-entry" aria-label="Supplier offer">
      <strong>
        {debt
          ? `Outstanding: $${balance}${debts.length > 1 ? ` across ${debts.length} packs` : ""} · due day ${Math.min(...debts.map((a) => a.dueDay))}`
          : "Pink Magic · limited lot"}
      </strong>
      {!debt && (
        <p>
          {MERCHANDISE.nightgoods.quantity} units · $
          {MERCHANDISE.nightgoods.wholesale} cash / $
          {MERCHANDISE.nightgoods.consignment} consignment · 1 AP
        </p>
      )}
      {connected ? (
        <button onClick={() => open(id)}>
          {debt ? `Talk repayment with ${name}` : `Talk terms with ${name}`}
        </button>
      ) : (
        <p className="disabled-reason">
          {name} only deals with people they know. Make contact first.
        </p>
      )}
      {connected &&
        !debt &&
        reasons.map((r) => (
          <p className="disabled-reason" key={playerText(s, r)}>
            {playerText(s, r)}
          </p>
        ))}
    </div>
  );
}
