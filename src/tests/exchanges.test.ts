import { describe, it, expect } from "vitest";
import { oneBuyer } from "./sessionFixtures";
import { newGame } from "./legacyGame";
import { acquire } from "../systems/StreetEconomy";
import type { GameState } from "../core/GameState";
import { baseline, newExchanges, streetExchange, ITEM_ICONS, CASH_ICON } from "../ui/exchanges";
import { repay } from "../systems/StreetEconomy";
import { existsSync } from "fs";

/** Run single-buyer sales until one with the wanted outcome turns up. */
function saleWith(outcome: string[]) {
  for (let seed = 1; seed < 400; seed++) {
    const s = newGame("Feed", "south", seed * 7919);
    acquire(s, "mega", "consignment");
    const before = baseline(s);
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
    expect(e.get).toMatchObject({ amount: t.gross, kind: "cash", provenance: "illicit", label: "Illicit cash received" });
    // The amount shown is the amount the economy put in the player's wallet.
    expect(mine(after).wallet.illicit - wallet).toBe(t.gross);
    expect(after.ledger.at(-1)).toMatchObject({ amount: t.gross, provenance: "illicit" });
  });
  it("partial sales show only what actually sold", () => {
    // One-buyer sales at rank 1 move a single unit; partials come from
    // larger street work, recorded the same way.
    const { after, t } = saleWith(["sale"]);
    const e = streetExchange(after, { ...t, outcome: "partial", sold: 2, gross: 104 })!;
    expect(e.give).toMatchObject({ kind: "item", quantity: 2 });
    expect(e.get).toMatchObject({ kind: "cash", amount: 104 });
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
  it("a pack from a plug shows what came in, and the cash out when paid up front", () => {
    const checked: string[] = [];
    for (const arrangement of ["cash", "consignment"] as const) {
      for (let seed = 1; seed < 200; seed++) {
        const s = newGame("Feed", "south", seed * 31);
        const before = baseline(s);
        const wallet = s.characters[s.playerId].wallet;
        const cashBefore = wallet.clean + wallet.illicit;
        acquire(s, "mega", arrangement);
        const lot = s.street.lots.at(-1);
        if (!lot || lot.arrangement !== arrangement) continue;
        const [e] = newExchanges(s, before).exchanges;
        expect(e.get).toMatchObject({ kind: "item", name: "Pink Magic", quantity: lot.received });
        expect((e.get as { label: string }).label).toMatch(/Received from/);
        const w = s.characters[s.playerId].wallet;
        if (arrangement === "cash") {
          expect(e.give).toMatchObject({ kind: "cash", amount: lot.cost });
          expect(cashBefore - (w.clean + w.illicit)).toBe(lot.cost);
        } else {
          expect(e.give).toBeUndefined();
          expect((e.get as { note: string }).note).toContain(`$${lot.owed} owed`);
        }
        checked.push(arrangement);
        break;
      }
    }
    expect(checked).toEqual(["cash", "consignment"]);
  });
  it("paying a plug back shows the cash handed over", () => {
    const s = newGame("Feed", "south", 99);
    acquire(s, "mega", "consignment");
    const a = s.street.agreements.find((a) => a.debtor === s.playerId)!;
    s.characters[s.playerId].wallet.illicit += 200;
    const before = baseline(s);
    repay(s, a.id, 40);
    const [e] = newExchanges(s, before).exchanges;
    expect(e.give).toMatchObject({ kind: "cash", amount: 40 });
    expect((e.give as { label: string }).label).toMatch(/Paid to/);
    expect((e.give as { note: string }).note).toBe(`$${a.balance} still owed`);
    expect(e.get).toBeUndefined();
  });
});
