/** All physical capacity, load and stack tuning lives here. Cash never enters this registry. */
export const INVENTORY_BALANCE = {
  player: { maxSlots: 12, maxLoad: 20 },
  member: { maxSlots: 8, maxLoad: 15 },
  safe: { maxSlots: 24, maxLoad: 40 },
  residencePrice: 600,
} as const;
export const ITEM_DEFINITIONS = {
  phone: { kind: "possession", name: "Ordinary phone", load: 1, stack: 1 },
  "plain-chain": { kind: "possession", name: "Plain chain", load: 1, stack: 1 },
  jewelry: { kind: "possession", name: "Jewelry", load: 1, stack: 1 },
  "high-chain": {
    kind: "possession",
    name: "High-end chain",
    load: 1,
    stack: 1,
  },
  console: { kind: "possession", name: "Game console", load: 5, stack: 1 },
  pc: { kind: "possession", name: "Personal computer", load: 8, stack: 1 },
  art: { kind: "possession", name: "Antique art", load: 10, stack: 1 },
  nightgoods: { kind: "merchandise", name: "Pink Magic", load: 1, stack: 10 },
  "law-19": { kind: "equipment", name: "Law-19", load: 3, stack: 1 },
  "law-19-switch": {
    kind: "equipment",
    name: "Law-19 Switch",
    load: 3,
    stack: 1,
  },
  arp: { kind: "equipment", name: "ARP", load: 6, stack: 1 },
  gloves: { kind: "possession", name: "Gloves", load: 1, stack: 5 },
  mask: { kind: "possession", name: "Mask", load: 1, stack: 5 },
  "pattern-token": {
    kind: "possession",
    name: "Fictional pattern token",
    load: 1,
    stack: 5,
  },
  duffle: { kind: "possession", name: "Duffle bag", load: 2, stack: 1 },
  necessities: {
    kind: "possession",
    name: "Groceries & necessities",
    load: 3,
    stack: 3,
  },
  smokes: { kind: "possession", name: "Smokes", load: 1, stack: 5 },
  booze: { kind: "possession", name: "Booze", load: 2, stack: 3 },
  music: { kind: "possession", name: "Pocket music player", load: 2, stack: 1 },
  clothing: { kind: "possession", name: "Fresh clothes", load: 2, stack: 3 },
} as const;
export type PhysicalItemId = keyof typeof ITEM_DEFINITIONS;
