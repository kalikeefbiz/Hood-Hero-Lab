import { describe, it, expect } from "vitest";
import { oneBuyer } from "./sessionFixtures";
import { newGame } from "../core/Simulation";
import { acquire } from "../systems/StreetEconomy";
import type { GameState } from "../core/GameState";
import { newExchanges, streetExchange, ITEM_ICONS, CASH_ICON } from "../ui/exchanges";
import { existsSync } from "fs";

/** Run single-buyer sales until one with the wanted outcome turns up. */
function saleWith(outcome: string[]) {
  for (let seed = 1; seed < 400; seed++) {
    const s = newGame("Feed", "south", seed * 7919);
    acquire(s, "mega", "consignment");
    const before = { firstId: s.street.transactions[0]?.id ?? null, count: s.street.transactions.length };
    const wallet = s.characters[s.playerId].wallet.illicit;
    const after = oneBuyer(s);
    const t = after.street.transactions.at(-1)!;
    if (outcome.includes(t.outcome)) return { before, after, t, wallet, start: s };
  }
  throw new Error(`no ${outcome} sale`);
}
const mine = (s: GameState) => s.characters[s.playerId];

describe("exchange feed", () => {
  it("shows exactly what a successful sale transferred and credited", () => {
    const { before, after, t, wallet } = saleWith(["sale"]);
    const { exchanges } = newExchanges(after, before);
    expect(exchanges).toHaveLength(1);
    const e = exchanges[0];
    expect(e.give).toMatchObject({ name: "Pink Magic", quantity: t.sold });
    expect(e.get).toMatchObject({ amount: t.gross, kind: "illicit" });
    // The amount shown is the amount the economy put in the player's wallet.
    expect(mine(after).wallet.illicit - wallet).toBe(t.gross);
    expect(after.ledger.at(-1)).toMatchObject({ amount: t.gross, provenance: "illicit" });
  });
  it("partial sales show only what actually sold", () => {
    // One-buyer sales at rank 1 move a single unit; partials come from
    // larger street work, recorded the same way.
    const { after, t } = saleWith(["sale"]);
    const e = streetExchange(after, { ...t, outcome: "partial", sold: 2, gross: 104 })!;
    expect(e.give!.quantity).toBe(2);
    expect(e.get!.amount).toBe(104);
  });
  it("failed sales show no money", () => {
    const { before, after } = saleWith(["none", "money-loss", "goods-loss"]);
    expect(newExchanges(after, before).exchanges).toEqual([]);
  });
  it("another character's sale is not the player's exchange", () => {
    const { after, t } = saleWith(["sale"]);
    expect(streetExchange(after, { ...t, actor: "quanny", partner: undefined })).toBeNull();
  });
  it("a crew partner sees only their share", () => {
    const { after, t } = saleWith(["sale"]);
    const e = streetExchange(after, { ...t, actor: "quanny", partner: after.playerId, crewPaid: 12 });
    expect(e).toMatchObject({ get: { amount: 12 } });
    expect(e!.give).toBeUndefined();
  });
  it("each new transaction gets its own card; a loaded history announces nothing", () => {
    const { before, after, start } = saleWith(["sale"]);
    const first = newExchanges(after, before);
    expect(first.exchanges).toHaveLength(1);
    expect(newExchanges(after, first.seen).exchanges).toEqual([]);
    // Loading the earlier save rewinds the history: nothing to announce.
    const rewound = newExchanges(start, first.seen);
    expect(rewound.exchanges).toEqual([]);
    // ...and the next sale after that load still gets its card.
    expect(newExchanges(after, rewound.seen).exchanges).toHaveLength(1);
  });
  it("uses the approved art and it is in the build", () => {
    for (const url of [ITEM_ICONS.nightgoods, CASH_ICON])
      expect(existsSync(`public/${url.replace(/^.*?assets\//, "assets/")}`)).toBe(true);
  });
});
