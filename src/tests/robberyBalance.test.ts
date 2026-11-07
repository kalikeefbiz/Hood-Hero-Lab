import { it, expect } from "vitest";
import { base, at, person, ok, input } from "./robberyFixtures";
import { player, cash, type GameState } from "../core/GameState";
import { advanceDay } from "../core/TimeSystem";
import { performAction } from "../core/ActionEngine";
import { ROBBERY_TARGETS } from "../content/robberyCareer";
import {
  offerTarget,
  offerCareerLead,
  inviteRobbery,
  takeLoot,
  pawnQuote,
  sellProperty,
  payCrewClaim,
} from "../systems/RobberyCareer";
import {
  PREPARATION,
  purchasePrep,
  purchasePrepError,
  startRobbery,
  obtainContactEquipment,
} from "../systems/Robbery";
import { skillsOf, skillRank } from "../systems/Skills";
import { inventoryOf, receivePhysical, gain } from "../systems/Inventory";
import { giveItem, equipItem } from "../systems/InventoryExchanges";
import { serialize, deserialize } from "../persistence/SaveSystem";
import {
  buyProperty,
  deposit,
  withdraw,
  RESIDENCES,
} from "../systems/Residences";
import {
  startStreetSession,
  advanceStreetSession,
} from "../systems/StreetSessions";
import { acquire, supplierError } from "../systems/StreetEconomy";
import { arrest } from "../systems/Incarceration";

for (const days of [30, 60, 180])
  it(`economy ${days} real days: supplies, opportunity limits, shares, pawn, storage, trapping, arrest and legal fallback`, () => {
    let s = base(101),
      attempts = 0,
      homes = 0,
      goodsSold = 0,
      gross = 0,
      spent = 0,
      work = 0,
      trap = 0,
      seized = 0;
    player(s).wallet.clean = 125;
    // Scenario starts with an established trained Set companion, not free player rank or equipment.
    s.crew.members = ["flacco"];
    const member = s.characters.flacco;
    member.relationships.player.trust = 95;
    member.traits.risk = 85;
    member.traits.lawful = 10;
    const mp = skillsOf(member);
    mp.milestones = { certified: 1, violentSuccess: 3 };
    mp.xp.combat = 1500;
    receivePhysical(s, "flacco", gain("law-19"));
    member.equipment!.equipped = "law-19";
    const home = RESIDENCES.find((r) => r.zone === "south")!;
    for (let d = 0; d < days && !s.end; d++) {
      s.encounters.forEach((e) => (e.status = "closed"));
      if (
        player(s).status === "active" &&
        !s.danger.injuries.some((i) => !i.discharged && i.severity !== "minor")
      ) {
        s.activeRobbery = undefined;
        if (s.activeSession?.status === "ended") s.activeSession = undefined;
        // Banking loot requires a physically visited owned safe and real $600 purchase.
        if (d > 20 && !s.residences?.[home.id] && cash(player(s)) >= 700) {
          at(s, home.location);
          const r = buyProperty(s, home.id);
          if (typeof r !== "string") s = r;
        }
        // Supplies bought in multi-unit batches with real AP/cash/capacity costs.
        for (const item of ["gloves", "mask"] as const)
          if (!inventoryOf(s).slots.some((x) => x.itemId === item)) {
            at(s, PREPARATION[item].location);
            if (!purchasePrepError(s, item, PREPARATION[item].location, 3)) {
              const before = cash(player(s));
              s = purchasePrep(s, item, PREPARATION[item].location, 3);
              spent += before - cash(player(s));
            }
          }
        const successes = skillsOf(player(s)).milestones.robberySuccess ?? 0;
        if (successes >= 3 && skillRank(player(s), "robbery") === 1) {
          person(s, "dizzy");
          const lead = offerCareerLead(s, "dizzy", "home.south.1");
          if (typeof lead !== "string") s = lead;
        }
        if (successes >= 9 && skillRank(player(s), "robbery") < 3) {
          person(s, "dizzy");
          const lead = offerCareerLead(s, "dizzy", "commercial.designer");
          if (typeof lead !== "string") s = lead;
        }
        if (
          skillRank(player(s), "combat") >= 2 &&
          !player(s).equipment?.owned.includes("law-19") &&
          cash(player(s)) >= 95 &&
          s.ap > 0
        ) {
          person(s, "dizzy");
          s = obtainContactEquipment(s, "dizzy");
          const eq = equipItem(s, "player", "law-19");
          if (typeof eq !== "string") s = eq;
        }
        let target = ROBBERY_TARGETS.filter((t) => t.kind === "strong-arm")[
          d % 5
        ];
        if (skillRank(player(s), "robbery") >= 2 && d % 3 === 0)
          target = ROBBERY_TARGETS.find((t) => t.id === "liquor.south")!;
        if (skillRank(player(s), "robbery") >= 2 && d % 7 === 0) {
          person(s, "dizzy");
          const lead = offerCareerLead(s, "dizzy", "home.south.1");
          if (typeof lead !== "string") {
            s = lead;
            const job = s
              .robberies!.jobs.filter(
                (j) => j.targetId === "home.south.1" && j.status === "offered",
              )
              .at(-1)!;
            if (job) {
              for (const item of ["gloves", "mask", "duffle"] as const) {
                at(s, PREPARATION[item].location);
                if (
                  !inventoryOf(s).slots.some((x) => x.itemId === item) &&
                  !purchasePrepError(s, item, PREPARATION[item].location)
                )
                  s = purchasePrep(s, item, PREPARATION[item].location);
              }
              person(s, "flacco");
              for (const item of ["gloves", "mask"] as const) {
                const x = inventoryOf(s).slots.find((x) => x.itemId === item);
                if (
                  x &&
                  !inventoryOf(s, "flacco").slots.some((x) => x.itemId === item)
                ) {
                  const r = giveItem(s, "flacco", x.id, 1);
                  if (typeof r !== "string") s = r;
                }
              }
              const invitation = inviteRobbery(s, "flacco", job.id);
              if (typeof invitation !== "string") {
                s = invitation;
                target = ROBBERY_TARGETS.find((t) => t.id === "home.south.1")!;
              }
            }
          }
        }
        at(s, target.location);
        const offer = offerTarget(s, target.id);
        if (typeof offer !== "string") {
          s = offer;
          const j = s
            .robberies!.jobs.filter(
              (j) => j.targetId === target.id && j.status === "offered",
            )
            .at(-1)!;
          if (j) {
            const start = startRobbery(s, j.id);
            if (!start.error) {
              s = start.state;
              attempts++;
              if (target.kind === "home") homes++;
              s = input(s, "patient");
              if (target.kind === "home") s = input(s, "search");
              for (const g of s.activeRobbery!.career!.goods.filter(
                (g) => !g.locked && g.beat <= s.activeRobbery!.career!.revealed,
              )) {
                const r = takeLoot(
                  s,
                  s.activeRobbery!.id,
                  s.activeRobbery!.cursor,
                  g.id,
                );
                if (typeof r !== "string") s = r;
              }
              s = input(s, target.kind === "home" ? "leave" : "deescalate");
              gross += s.activeRobbery!.loot;
              expect(offerTarget(s, target.id)).toEqual(expect.any(String));
            }
          }
        }
        if (player(s).status === "active") {
          at(s, "reservoir.pawn");
          for (const x of [...inventoryOf(s).slots])
            if (pawnQuote(s, x.id)) {
              const r = sellProperty(s, x.id);
              if (typeof r !== "string") {
                s = r;
                goodsSold++;
              }
            }
          for (const c of s.robberyCareer!.claims.filter(
            (c) => c.paid < c.amount,
          )) {
            person(s, c.member);
            const paid = payCrewClaim(s, c.id);
            if (typeof paid !== "string") s = paid;
          }
          // Real consignment and City buyers; existing debt remains if patrol seizes it.
          if (s.ap && d % 9 === 0) {
            person(s, "mega");
            if (!supplierError(s, "mega", "consignment"))
              acquire(s, "mega", "consignment");
            at(s, "south.the-lot");
            const start = startStreetSession(s, "south.the-lot");
            if (!start.error) {
              s = start.state;
              trap++;
              while (s.activeSession?.status === "active")
                s = advanceStreetSession(
                  s,
                  s.activeSession.id,
                  s.activeSession.cursor,
                );
            }
          }
          if (s.residences?.[home.id]) {
            const x = inventoryOf(s).slots.find((x) => x.itemId === "gloves");
            if (x) {
              at(s, home.location);
              const dep = deposit(s, home.id, x.id, 1);
              if (typeof dep !== "string") {
                s = dep;
                const stored = s.residences![home.id].safe.slots.find(
                  (x) => x.itemId === "gloves",
                )!;
                const take = withdraw(s, home.id, stored.id, 1);
                if (typeof take !== "string") s = take;
              }
            }
          }
          if (s.ap) {
            at(s, "nawf.street-market");
            const r = performAction(s, { actor: "player", type: "gig" });
            if (!r.error) {
              s = r.state;
              work++;
            }
          }
        }
      }
      // One deterministic non-robbery arrest checks campaign recovery and outstanding debt.
      if (d === Math.floor(days / 2) && player(s).status === "active") {
        arrest(s, "player", "simulation patrol");
        seized++;
      }
      s = deserialize(serialize(s));
      s = advanceDay(s);
    }
    const p = skillsOf(player(s));
    console.log(
      "ROBBERY ECONOMY",
      JSON.stringify({
        days,
        attempts,
        homes,
        successes: p.milestones.robberySuccess ?? 0,
        rank: skillRank(player(s), "robbery"),
        gross,
        goodsSold,
        prepSpent: spent,
        work,
        trap,
        seized,
        wallet: cash(player(s)),
        arrears: s.street.arrears,
        debts: s.street.agreements.reduce((n, a) => n + a.balance, 0),
        end: s.end,
      }),
    );
    expect(attempts).toBeGreaterThan(0);
    expect(s.end).not.toBe("killed");
    expect(cash(player(s))).toBeGreaterThanOrEqual(0);
    expect(s.street.lots.every((l) => l.remaining >= 0)).toBe(true);
    expect(s.robberyCareer!.seizures.length).toBeGreaterThan(0);
    if (days === 180)
      expect(skillRank(player(s), "robbery")).toBeGreaterThanOrEqual(3);
  }, 60000);
