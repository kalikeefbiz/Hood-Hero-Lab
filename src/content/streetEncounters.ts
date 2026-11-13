import type { EncounterDefinition } from "../core/Encounter";
import { cash, player, type GameState } from "../core/GameState";
import { STREET_BALANCE as B } from "./street";
import {
  paymentError,
  supplierError,
  unitPrice,
  suppliers,
} from "../systems/StreetEconomy";
export const SUPPLIER_ENCOUNTER: EncounterDefinition = {
  id: "street-supplier",
  type: "request",
  participants: [],
  priority: 80,
  trigger: () => [],
  eligible: (s, e) =>
    player(s).status === "active" &&
    !s.end &&
    s.characters[e.participants[0]]?.status === "active" &&
    player(s).connections.includes(e.participants[0]) &&
    !["closed", "acknowledged"].includes(e.status),
  expression: () => "proposing",
  dialogue: (s, e) => {
    const n = s.characters[e.participants[0]];
    const debts = s.street.agreements.filter(
      (a) => a.supplier === n.id && a.debtor === s.playerId && a.balance > 0,
    );
    const obligation = debts.length
      ? `You still owe me $${debts.reduce((v, a) => v + a.balance, 0)}. We haven’t changed those terms. `
      : "";
    const cashOnly =
      n.id === "mega" &&
      (s.streetLife?.initialDecision === "decline" ||
        (s.streetLife &&
          !s.streetLife.legacy &&
          s.streetLife.lesson === "waiting" &&
          s.streetLife.initialDecision !== "promise"));
    const tone =
      n.id === "mega"
        ? cashOnly
          ? s.streetLife?.initialDecision === "decline"
            ? "You said you couldn’t help with the chain. I’m disappointed, but you’re family. I’ll supply you on CASH terms only, no fronts."
            : "You never committed, but you’re still family. The first six for this lesson are CASH only, no fronts."
          : "Cuzzo, you’re family. But we still need to be clear about what you’re taking and what you owe."
        : n.id === "pablo"
          ? "You give your word, you keep it. I remember who does."
          : "Small pack, clear terms. I need to know you’ll keep your word.";
    return `${obligation}${tone} ${e.selectedResponses.some((r) => r.id === "terms") ? "Pay cash and it’s yours. If I front it, you owe me even if you lose it. I can’t promise you buyers." : "What are you looking for?"}`;
  },
  responses: (s, e) => {
    const supplier = e.participants[0];
    const repayments = s.street.agreements
      .filter(
        (a) =>
          a.supplier === supplier && a.debtor === s.playerId && a.balance > 0,
      )
      .flatMap((a) => [
        {
          id: `full:${a.id}`,
          label: `Repay ${a.id} · $${a.balance} · due day ${a.dueDay}`,
          effect: {
            type: "street" as const,
            choice: "repay",
            agreementId: a.id,
            amount: a.balance,
          },
          requirement: () => paymentError(s, a.id, a.balance),
        },
        {
          id: `partial:${a.id}`,
          label: `Part-pay ${a.id} · $${Math.min(25, a.balance)}`,
          effect: {
            type: "street" as const,
            choice: "repay",
            agreementId: a.id,
            amount: Math.min(25, a.balance),
          },
          requirement: () => paymentError(s, a.id, Math.min(25, a.balance)),
        },
        ...(a ===
        s.street.agreements.find(
          (x) =>
            x.supplier === supplier && x.debtor === s.playerId && x.balance > 0,
        )
          ? [
              {
                id: "full",
                label: `Repay full balance · $${a.balance}`,
                effect: {
                  type: "street" as const,
                  choice: "repay",
                  agreementId: a.id,
                  amount: a.balance,
                },
                requirement: () => paymentError(s, a.id, a.balance),
              },
              {
                id: "partial",
                label: `Make partial payment · $${Math.min(25, a.balance)}`,
                effect: {
                  type: "street" as const,
                  choice: "repay",
                  agreementId: a.id,
                  amount: Math.min(25, a.balance),
                },
                requirement: () =>
                  paymentError(s, a.id, Math.min(25, a.balance)),
              },
              {
                id: "affordable",
                label: `Pay what you can · $${Math.min(cash(player(s)), a.balance)}`,
                effect: {
                  type: "street" as const,
                  choice: "repay",
                  agreementId: a.id,
                  amount: Math.min(cash(player(s)), a.balance),
                },
                requirement: () =>
                  paymentError(s, a.id, Math.min(cash(player(s)), a.balance)),
              },
            ]
          : []),
      ]);
    return [
      ...repayments,
      {
        id: "cash",
        label: "Accept cash purchase · $90 · 1 AP",
        detail: `6 units · ownership transfers; no supplier debt · possible gross $${6 * unitPrice(s, s.characters[supplier].home)} if all sell, before costs, losses and partner share; buyers not guaranteed`,
        effect: {
          type: "street",
          choice: "acquire",
          supplier,
          arrangement: "cash",
        },
        requirement: () => supplierError(s, supplier, "cash"),
      },
      {
        id: "consignment",
        label: `Accept consignment · $102 due day ${s.day + B.deadline} · 1 AP`,
        detail: `6 units · personal repayment obligation, including losses · possible gross $${6 * unitPrice(s, s.characters[supplier].home)} if all sell, before costs, losses and partner share; buyers not guaranteed`,
        effect: {
          type: "street",
          choice: "acquire",
          supplier,
          arrangement: "consignment",
        },
        requirement: () => supplierError(s, supplier, "consignment"),
      },
      ...(!e.selectedResponses.some((r) => r.id === "terms")
        ? [
            {
              id: "terms",
              label: "Explain the terms and risk.",
              effect: { type: "street" as const, choice: "terms" },
            },
          ]
        : []),
      {
        id: "leave",
        label: "Leave without a new arrangement.",
        detail: "Existing debts and agreements remain in place.",
        effect: { type: "street", choice: "leave" },
      },
    ];
  },
  rules: { replay: "read-only", expiresWithIncident: false },
};
export function openSupplier(state: GameState, supplier: string): GameState {
  if (
    !suppliers(state).some((n) => n.id === supplier) ||
    !player(state).connections.includes(supplier) ||
    player(state).status !== "active" ||
    state.end
  )
    return state;
  const s = structuredClone(state);
  for (const e of s.encounters)
    if (e.status === "active") {
      e.status = "pending";
      e.deferred = true;
    }
  for (const e of s.encounters)
    if (
      e.definitionId === "street-supplier" &&
      ["active", "pending"].includes(e.status)
    )
      e.status = "closed";
  s.encounters.push({
    id: `street-conversation-${s.nextId++}`,
    definitionId: "street-supplier",
    participants: [supplier],
    createdDay: s.day,
    status: "active",
    selectedResponses: [],
    followUpPending: false,
    deferred: false,
  });
  return s;
}

export const SUPPLIER_REACTION: EncounterDefinition = {
  id: "street-reaction",
  type: "reaction",
  participants: [],
  priority: 45,
  trigger: (s) =>
    s.events
      .filter(
        (e) =>
          e.commitmentId &&
          s.commitments.some(
            (c) =>
              c.id === e.commitmentId &&
              c.kind === "supplier-debt" &&
              c.actor === s.playerId,
          ) &&
          ["major", "critical"].includes(e.importance ?? "") &&
          !s.acknowledgedEvents.includes(e.id),
      )
      .map((e) => ({ key: e.id, eventId: e.id })),
  eligible: (s, e) =>
    !s.acknowledgedEvents.includes(e.sourceEventId!) &&
    !["closed", "acknowledged"].includes(e.status),
  dialogue: (s, e) =>
    s.events.find((x) => x.id === e.sourceEventId)?.text ??
    "Your supplier remembers the arrangement.",
  responses: () => [
    {
      id: "acknowledge",
      label: "I hear you. Return to City.",
      effect: { type: "acknowledge" },
    },
  ],
  rules: { replay: "read-only", expiresWithIncident: false },
};
