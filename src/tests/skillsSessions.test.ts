import { initiateConflict, violence } from "../systems/Danger";
import { finalizeEnding } from "../systems/EndConditions";
import { requestActivity } from "../systems/CrewAgency";
import { grantEquipment } from "../systems/Equipment";
import { repay, supplierError } from "../systems/StreetEconomy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame } from "../core/Simulation";
import { player, cash, type GameState } from "../core/GameState";
import { performAction } from "../core/ActionEngine";
import { advanceDay } from "../core/TimeSystem";
import { random } from "../core/Random";
import * as RNG from "../core/Random";
import {
  SKILLS,
  skillIds,
  skillsOf,
  skillRank,
  missingMilestones,
  awardBuyer,
  awardSkill,
  awardCombat,
  awardRobbery,
  bankEligible,
} from "../systems/Skills";
import {
  EQUIPMENT,
  equip,
  equipmentOf,
  equipmentBonus,
} from "../systems/Equipment";
import {
  acquire,
  transactionChance,
  transact,
  saleLot,
} from "../systems/StreetEconomy";
import {
  startStreetSession,
  advanceStreetSession,
  endStreetSession,
  pauseStreetSession,
  validateStartStreetSession,
} from "../systems/StreetSessions";
import { deserialize, serialize } from "../persistence/SaveSystem";
import { moveTo, presenceOf } from "../board/presence";
import { LOCATIONS } from "../board/locations";
import { arrest } from "../systems/Incarceration";
import { addExposure } from "../systems/CriminalExposure";
import {
  addGrievance,
  hospitalize,
  hospitalStay,
  resolveStreetScene,
} from "../systems/Danger";
import { record } from "../core/EventLog";
import { visitorPhase, SessionVisitors } from "../board/SessionVisitors";
import { Vector3 } from "three";
import { oneBuyer } from "./sessionFixtures";
import { businessAction, advanceBusinesses } from "../systems/Businesses";
import { BUSINESSES } from "../content/strategy";

function ready(seed = 2026) {
  const s = newGame("Test", "south", seed);
  acquire(s, "mega", "consignment");
  for (const e of s.encounters) e.status = "closed";
  s.presence = { ...presenceOf(s), location: "south.the-lot", zone: "south" };
  return s;
}
function started(seed = 2026) {
  const r = startStreetSession(ready(seed), "south.the-lot");
  expect(r.error).toBeNull();
  return r.state;
}
function step(s: GameState) {
  return advanceStreetSession(s, s.activeSession!.id, s.activeSession!.cursor);
}
function force(
  s: GameState,
  kind: NonNullable<GameState["activeSession"]>["beats"][number]["kind"],
  seed = 1,
) {
  s.activeSession!.beats[s.activeSession!.cursor] = {
    kind,
    seed,
    duration: 7200,
  };
  return s;
}
function finish(s: GameState) {
  while (s.activeSession?.status === "active") s = step(s);
  return s;
}
afterEach(() => vi.restoreAllMocks());

describe("eight canonical persistent skill tracks", () => {
  it("initializes independent player/NPC records and conservative established competence", () => {
    const s = newGame("Test", "south");
    expect(skillIds).toHaveLength(8);
    expect(Object.keys(skillsOf(player(s)).xp)).toEqual(skillIds);
    for (const id of skillIds) expect(skillRank(player(s), id)).toBe(1);
    expect(skillRank(s.characters.quanny, "combat")).toBe(3);
    expect(skillRank(s.characters.mega, "combat")).toBe(4);
    expect(skillRank(s.characters.flacco, "combat")).toBe(1);
    const old = skillsOf(s.characters.flacco).xp.work;
    awardSkill(s, "player", "work", 100, "outcome");
    expect(skillsOf(s.characters.flacco).xp.work).toBe(old);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  for (const id of skillIds)
    it(`${id}: exact cumulative boundaries, rank gates, and transparent missing requirements`, () => {
      const s = ready(),
        c = player(s),
        p = skillsOf(c);
      p.milestones = {
        certified: 1,
        violentSuccess: 12,
        robberySuccess: 18,
        robberyAccess2: 1,
        robberyAccess3: 1,
        robberyAccess4: 1,
        supplierCredible: 1,
        supplierPaid: 1,
        supplyHistory: 12,
        commercialZones: 2,
      };
      if (id === "robbery") p.xp.combat = 6000;
      for (let r = 2; r <= 4; r++) {
        const threshold = SKILLS[id].gates[r - 1];
        p.xp[id] = Math.max(0, threshold - 1);
        if (threshold > 0) expect(skillRank(c, id)).toBe(r - 1);
        p.xp[id] = threshold;
        expect(missingMilestones(c, id, r)).toEqual([]);
        expect(skillRank(c, id)).toBe(r);
      }
    });
  it("never invents story certification, access, or supply history from XP or buying gear", () => {
    const s = ready(),
      c = player(s),
      p = skillsOf(c);
    for (const id of skillIds) p.xp[id] = 100000;
    expect(skillRank(c, "combat")).toBe(1);
    expect(skillRank(c, "robbery")).toBe(1);
    expect(skillRank(c, "trapper")).toBe(2);
    expect(missingMilestones(c, "combat", 2).join(" ")).toContain(
      "not yet available",
    );
    equipmentOf(c).owned.push("arp");
    expect(equip(c, "arp")).toBeTruthy();
    expect(p.milestones.certified).toBeUndefined();
  });
  it("awards exact hundredths by buyer, independent of unit count, with idempotent records and failure caps", () => {
    const s = ready(),
      p = skillsOf(player(s));
    awardBuyer(s, "player", "sale1", "sale");
    expect(p.xp.trapper).toBe(50);
    awardBuyer(s, "player", "sale1", "sale");
    expect(p.xp.trapper).toBe(50);
    awardBuyer(s, "player", "failure1", "failed");
    expect(p.xp.trapper).toBe(70);
    awardBuyer(s, "player", "pass1", "pass");
    expect(p.xp.trapper).toBe(70);
    for (let tier = 2; tier <= 4; tier++)
      awardBuyer(s, "player", `tier${tier}`, "sale", tier);
    expect(p.xp.trapper).toBe(370);
    for (let i = 0; i < 20; i++)
      awardBuyer(s, "player", `failed${i}`, "failed");
    expect(p.xp.trapper).toBe(470);
    expect(p.xp.combat).toBe(0);
    expect(Number.isInteger(p.xp.trapper)).toBe(true);
  });
  it("counts violent/robbery successes only on success and permits fractional failure rewards", () => {
    const s = ready(),
      p = skillsOf(player(s));
    awardCombat(s, "player", "defense", "defense");
    awardCombat(s, "player", "fail", "failed");
    expect(p.xp.combat).toBe(300);
    expect(p.milestones.violentSuccess).toBeUndefined();
    awardCombat(s, "player", "op", "success");
    awardCombat(s, "player", "op", "success");
    expect(p.milestones.violentSuccess).toBe(1);
    expect(p.xp.combat).toBe(800);
    for (const kind of ["strong-arm", "home", "store", "bank"] as const) {
      awardRobbery(s, "player", `f:${kind}`, kind, false);
      awardRobbery(s, "player", `s:${kind}`, kind, true);
    }
    expect(p.xp.robbery).toBe(3150);
    expect(p.milestones.robberySuccess).toBe(4);
    expect(p.xp.trapper).toBe(0);
  });
  it("awards actual defensive escape separately from successful violent operations and mere victimhood", () => {
    let s = ready();
    vi.spyOn(RNG, "random").mockReturnValue(0);
    initiateConflict(s, "quanny", "fight");
    expect(skillsOf(player(s)).xp.combat).toBe(200);
    expect(skillsOf(player(s)).milestones.violentSuccess).toBeUndefined();
    expect(skillsOf(player(s)).xp.survival).toBe(50);
    s = ready();
    violence(s, s.characters.quanny, undefined, false);
    expect(skillsOf(player(s)).xp.combat).toBe(0);
    expect(skillsOf(player(s)).xp.trapper).toBe(0);
  });
  it("records meaningful lawful outcomes, avoids transfer/application/contact-spam farming", () => {
    let s = ready();
    s.ap = 2;
    const before = skillsOf(player(s)).xp;
    s = performAction(s, { actor: "player", type: "gig" }).state;
    expect(skillsOf(player(s)).xp.work - before.work).toBe(100);
    const first = skillsOf(player(s)).xp.work;
    s = performAction(s, { actor: "player", type: "gig" }).state;
    expect(skillsOf(player(s)).xp.work).toBe(first);
    s.ap = 2;
    s = performAction(s, {
      actor: "player",
      type: "transfer",
      target: "mega",
    }).state;
    expect(skillsOf(player(s)).xp.social).toBe(0);
    s.ap = 2;
    player(s).stress = 0;
    s = performAction(s, { actor: "player", type: "rest" }).state;
    expect(skillsOf(player(s)).xp.survival).toBe(0);
  });
  it("requires active management and profitable clean business outcomes, caps XP per day", () => {
    let s = ready();
    player(s).wallet.clean = 20000;
    player(s).legitimacy = 100;
    s.ap = 2;
    const b = BUSINESSES[0];
    s = businessAction(s, b.id, "buy").state;
    expect(skillsOf(player(s)).xp.business).toBe(0);
    s = businessAction(s, b.id, "maintain").state;
    s.day++;
    advanceBusinesses(s);
    expect(skillsOf(player(s)).xp.business).toBe(100);
    advanceBusinesses(s);
    expect(skillsOf(player(s)).xp.business).toBe(100);
  });
});

describe("equipment validation and combat eligibility", () => {
  for (const [id, def] of Object.entries(EQUIPMENT))
    it(`${id}: exact bonuses, ownership, rank changes and save roundtrip`, () => {
      const s = ready(),
        c = player(s),
        p = skillsOf(c),
        key = id as keyof typeof EQUIPMENT;
      expect(equip(c, key)).toBeTruthy();
      equipmentOf(c).owned.push(key);
      expect(equip(c, key)).toBeTruthy();
      expect(equipmentBonus(c)).toMatchObject({ attack: 0, defense: 0 });
      p.milestones.certified = 1;
      p.milestones.violentSuccess = 12;
      p.xp.combat = def.rank === 4 ? 6000 : def.rank === 3 ? 1500 : 0;
      expect(equip(c, key)).toBeNull();
      expect(equipmentBonus(c)).toMatchObject({
        attack: def.attack,
        defense: def.defense,
      });
      expect(
        deserialize(serialize(s)).characters.player.equipment?.equipped,
      ).toBe(key);
      expect(bankEligible(c)).toBe(key === "arp");
      p.milestones.certified = 0;
      expect(equipmentBonus(c)).toMatchObject({ attack: 0, defense: 0 });
      expect(equip(c, null)).toBeNull();
      expect(equipmentBonus(c).attack).toBe(0);
    });
  it("grants gear only from a real authored outcome, without skill XP or duplicate ownership", () => {
    const s = ready(),
      c = player(s);
    expect(grantEquipment(s, c.id, "law-19", "invented")).toBe(false);
    const e = record(s, "system", "Controlled future authored reward fixture", [
      c.id,
    ]);
    expect(grantEquipment(s, c.id, "law-19", e.id)).toBe(true);
    expect(grantEquipment(s, c.id, "law-19", e.id)).toBe(false);
    expect(skillsOf(c).xp.combat).toBe(0);
    expect(equip(c, "law-19")).toBeTruthy();
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("one equipped slot prevents stacking owned items", () => {
    const s = ready(),
      c = player(s),
      p = skillsOf(c);
    equipmentOf(c).owned = ["law-19", "law-19-switch", "arp"];
    p.milestones = { certified: 1, violentSuccess: 12 };
    p.xp.combat = 6000;
    equip(c, "law-19");
    expect(equipmentBonus(c).attack).toBe(2);
    equip(c, "arp");
    expect(equipmentBonus(c).attack).toBe(5);
  });
});

describe("physical and transactional City sessions", () => {
  it("rejects off-site, non-street, rival, no stock, zero AP, occupied, and exhausted markets", () => {
    const s = ready();
    expect(validateStartStreetSession(s, "rio.angels-mural")).toContain(
      "physically",
    );
    expect(validateStartStreetSession(s, "south.rowhouses")).toBeTruthy();
    s.ap = 0;
    expect(validateStartStreetSession(s, "south.the-lot")).toContain("AP");
    s.ap = 1;
    s.street.lots[0].remaining = 0;
    expect(validateStartStreetSession(s, "south.the-lot")).toContain("on hand");
    s.street.lots[0].remaining = 6;
    s.street.markets.south.usedDay = s.day;
    s.street.markets.south.used = 6;
    expect(validateStartStreetSession(s, "south.the-lot")).toContain("demand");
    s.street.markets.south.used = 0;
    const l = LOCATIONS.find((l) => l.id === "south.the-lot")!;
    if (l.faction) player(s).affiliation = s.factions[l.faction].enemies[0];
    if (player(s).affiliation)
      expect(validateStartStreetSession(s, l.id)).toContain("Rival");
    player(s).affiliation = null;
    expect(startStreetSession(started(), "south.the-lot").error).toContain(
      "current session",
    );
  });
  it("blocks both legacy player sale routes while NPC trading still uses real lots", () => {
    const s = ready(),
      before = serialize(s);
    expect(
      performAction(s, { actor: "player", type: "crime", market: "south" })
        .error,
    ).toContain("City");
    transact(s);
    expect(serialize(s)).toBe(before);
    s.street.lots[0].owner = "quanny";
    const xp = skillsOf(s.characters.quanny).xp.trapper;
    transact(s, "quanny", "reservoir");
    expect(s.street.transactions).toHaveLength(1);
    expect(skillsOf(s.characters.quanny).xp.trapper).toBeGreaterThan(xp);
  });
  it("charges exactly once, stores 4–6 beats and rejects duplicate starts and stale cursors", () => {
    const s = ready(),
      original = structuredClone(s),
      r = startStreetSession(s, "south.the-lot");
    expect(s).toEqual(original);
    expect(r.state.ap).toBe(s.ap - 1);
    const a = r.state.activeSession!;
    expect(a.beats.length).toBeGreaterThanOrEqual(4);
    expect(a.beats.length).toBeLessThanOrEqual(6);
    expect(startStreetSession(r.state, a.location).state).toBe(r.state);
    expect(advanceStreetSession(r.state, "stale", 0)).toBe(r.state);
    const n = step(r.state);
    expect(n.ap).toBe(r.state.ap);
    expect(advanceStreetSession(n, a.id, 0)).toBe(n);
    expect(
      performAction(r.state, { actor: "player", type: "gig" }).error,
    ).toBeTruthy();
  });
  it("uses independent random buyers, exact economic totals, hundredths, debt and capacity", () => {
    let s = started();
    const before = cash(player(s)),
      debt = s.street.agreements[0].balance;
    for (const b of s.activeSession!.beats) {
      b.kind = "buyer";
      b.seed = 1;
    }
    s = finish(s);
    const a = s.activeSession!,
      ts = s.street.transactions;
    expect(ts.length).toBeGreaterThan(0);
    expect(a.totals.sold).toBe(ts.reduce((n, t) => n + t.sold, 0));
    expect(a.totals.gross).toBe(ts.reduce((n, t) => n + t.gross, 0));
    expect(cash(player(s)) - before).toBe(a.totals.gross - a.totals.loss);
    expect(saleLot(s)?.remaining ?? 0).toBe(6 - a.totals.sold - a.totals.lost);
    expect(s.street.agreements[0].balance).toBe(debt);
    expect(a.totals.xp).toBe(ts.reduce((n, t) => n + (t.sold ? 50 : 20), 0));
    expect(skillsOf(player(s)).xp.combat).toBe(0);
    expect(s.street.markets.south.used).toBeLessThanOrEqual(6);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("does not use Trapper rank in buyer success probability", () => {
    const s = ready(),
      a = transactionChance(s),
      p = skillsOf(player(s));
    p.xp.trapper = 50000;
    p.milestones = {
      supplierCredible: 1,
      supplierPaid: 1,
      supplyHistory: 12,
      commercialZones: 2,
    };
    expect(skillRank(player(s), "trapper")).toBe(4);
    expect(transactionChance(s)).toBe(a);
  });
  it("allows a genuine zero-revenue session; passers alter no inventory, heat or XP", () => {
    let s = started(),
      before = cash(player(s));
    s.activeSession!.beats.forEach((b) => (b.kind = "pass"));
    s = finish(s);
    expect(s.activeSession!.totals).toEqual({
      gross: 0,
      loss: 0,
      sold: 0,
      lost: 0,
      xp: 0,
      heat: 0,
    });
    expect(cash(player(s))).toBe(before);
    expect(saleLot(s)?.remaining).toBe(6);
    expect(s.ap).toBe(0);
  });
  it("real failed buyers gain 0.20 and real exposure; seeded runs include independent failures/successes", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      let s = force(started(), "buyer", seed);
      s = step(s);
      const t = s.street.transactions[0];
      expect(t).toBeDefined();
      outcomes.add(t.sold ? "sale" : "failed");
      expect(s.activeSession!.totals.xp).toBe(t.sold ? 50 : 20);
      expect(player(s).police).toBeGreaterThan(0);
    }
    expect(outcomes).toEqual(new Set(["sale", "failed"]));
  });
  it("reloads the next unprocessed beat without rerolling, and pausing cannot settle or refund", () => {
    let s = step(started()),
      saved = deserialize(serialize(s));
    expect(step(saved)).toEqual(step(s));
    s = pauseStreetSession(s, s.activeSession!.id, true);
    const before = serialize(s);
    expect(step(s)).toBe(s);
    expect(serialize(s)).toBe(before);
    expect(
      pauseStreetSession(s, s.activeSession!.id, false).activeSession!.status,
    ).toBe("active");
  });
  it("early exit, day end, movement, hospitalization and arrest cancel unresolved visitors safely", () => {
    const base = started(),
      a = base.activeSession!;
    for (const end of [
      endStreetSession(base, a.id),
      advanceDay(base),
      moveTo(base, "south.rowhouses"),
    ]) {
      expect(end.activeSession!.status).toBe("ended");
      expect(advanceStreetSession(end, a.id, 0)).toBe(end);
      expect(end.activeSession!.totals.sold).toBe(0);
    }
    const terminal = structuredClone(base);
    player(terminal).status = "dead";
    finalizeEnding(terminal);
    expect(terminal.activeSession!.status).toBe("ended");
    expect(step(terminal)).toBe(terminal);
    let s = structuredClone(base);
    arrest(s, "player", "test confinement");
    expect(step(s).activeSession!.status).toBe("ended");
    s = structuredClone(base);
    const e = record(s, "risk", "Injury", ["player"]);
    hospitalize(s, "assault", e.id);
    expect(step(s).activeSession!.status).toBe("ended");
  });
  it("settles participating crew once when a paid session is interrupted after a buyer", () => {
    let s = ready();
    const member = s.characters.flacco;
    member.traits.risk = 80;
    member.traits.lawful = 10;
    member.stress = 0;
    member.relationships.player.trust = 100;
    requestActivity(s, member.id, "partner-crime");
    expect(s.assignments.at(-1)?.status).toBe("active");
    s = startStreetSession(s, "south.the-lot").state;
    s = step(force(s, "buyer", 1));
    expect(s.activeSession!.totals.sold).toBeGreaterThan(0);
    s = advanceDay(s);
    expect(s.assignments.at(-1)?.status).toBe("resolved");
    expect(s.assignments.at(-1)?.success).toBe(true);
    expect(skillsOf(player(s)).xp.leadership).toBe(100);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("permits a second paid session at this spot and a later cross-zone session, with no third AP", () => {
    let s = ready();
    s.ap = 2;
    s = startStreetSession(s, "south.the-lot").state;
    s.activeSession!.beats.forEach((b) => (b.kind = "pass"));
    s = finish(s);
    s = startStreetSession(s, "south.the-lot").state;
    expect(s.ap).toBe(0);
    s = endStreetSession(s, s.activeSession!.id);
    expect(startStreetSession(s, "south.the-lot").error).toContain("AP");
    s.ap = 1;
    player(s).neighborhoodStanding.rio = 25;
    s = moveTo(s, "rio.angels-mural");
    for (const e of s.encounters) e.status = "closed";
    expect(startStreetSession(s, "rio.angels-mural").error).toBeNull();
  });
  it("grounded witness/patrol/rival beats affect exposure and existing custody/injury flows", () => {
    let s = force(started(), "witness");
    s = step(s);
    expect(s.street.exposure.player.investigation).toBeGreaterThan(0);
    expect(s.activeSession!.totals.xp).toBe(0);
    s = force(started(), "patrol");
    addExposure(s, "player", "south", 60, true);
    vi.spyOn(RNG, "random").mockReturnValue(0);
    s = step(s);
    expect(player(s).status).toBe("arrested");
    expect(s.activeSession!.status).toBe("ended");
    vi.restoreAllMocks();
    s = force(started(), "rival");
    const e = record(s, "risk", "Serious history", ["player", "mega"]);
    const c = addGrievance(
      s,
      "mega",
      "player",
      "Existing personal conflict",
      e.id,
      90,
      true,
    );
    c.intent = "seek";
    vi.spyOn(RNG, "random").mockReturnValue(0.1);
    s = step(s);
    expect(s.danger.injuries.length + s.danger.scenes.length).toBeGreaterThan(
      0,
    );
    expect(s.activeSession!.status).toBe("ended");
  });
  it("migrates historical v8 state additively and rejects corrupt progress, equipment, or session references", () => {
    const s = ready(),
      old = JSON.parse(serialize(s));
    old.version = 8;
    old.state.version = 8;
    for (const c of Object.values(old.state.characters) as Record<
      string,
      unknown
    >[]) {
      delete c.skillProgress;
      delete c.equipment;
    }
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.version).toBe(9);
    for (const key of ["wallet", "possessions", "relationships"] as const)
      expect(player(loaded)[key]).toEqual(player(s)[key]);
    expect(loaded.presence).toEqual(s.presence);
    expect(loaded.quanny).toEqual(s.quanny);
    expect(loaded.crew).toEqual(s.crew);
    const bad = JSON.parse(serialize(started()));
    bad.state.activeSession.location = "south.rowhouses";
    expect(() => deserialize(JSON.stringify(bad))).toThrow();
    bad.state.activeSession.location = "south.the-lot";
    bad.state.characters.player.skillProgress.xp.trapper = 0.5;
    expect(() => deserialize(JSON.stringify(bad))).toThrow();
    bad.state.characters.player.skillProgress.xp.trapper = 0;
    bad.state.characters.player.equipment = { owned: [], equipped: "arp" };
    expect(() => deserialize(JSON.stringify(bad))).toThrow();
  });
});

describe("focused progression balance and presentation adapter", () => {
  for (const days of [30, 60, 180, 365])
    it(`${days}-day focused City simulation avoids instant mastery`, () => {
      let s = ready(42);
      while (s.day <= days && !s.end) {
        // The strategy prioritizes paying real debts, selling held stock, then earning lawful fallback income.
        for (const scene of s.danger.scenes.filter(
          (scene) => scene.status === "open",
        ))
          resolveStreetScene(s, scene, "leave");
        for (const e of s.encounters)
          if (e.status === "active") e.status = "closed";
        if (player(s).status === "active" && !hospitalStay(s)) {
          const debt = s.street.agreements.find(
            (a) => a.debtor === s.playerId && a.balance > 0,
          );
          if (debt && cash(player(s)) >= debt.balance)
            repay(s, debt.id, debt.balance);
          if (!saleLot(s) && !supplierError(s, "mega", "consignment"))
            acquire(s, "mega", "consignment");
          for (let opportunity = 0; opportunity < 2 && s.ap; opportunity++) {
            const result = startStreetSession(s, "south.the-lot");
            if (result.error) break;
            s = finish(result.state);
          }
          if (s.ap)
            s = performAction(s, { actor: "player", type: "gig" }).state;
          if (s.ap)
            s = performAction(s, { actor: "player", type: "rest" }).state;
        }
        s = advanceDay(s);
      }
      const total = skillsOf(player(s)).xp.trapper;
      expect(total).toBeGreaterThan(0);
      // Even an impossible all-failed six-attempt/day strategy cannot reach mastery by day 60.
      expect(total).toBeLessThanOrEqual(days * 300);
      if (days === 60) expect(skillRank(player(s), "trapper")).toBeLessThan(4);
      expect(deserialize(serialize(s))).toEqual(s);
      console.log(
        `FOCUSED ${days} days: ${(total / 100).toFixed(2)} XP, rank ${skillRank(player(s), "trapper")}, ${s.street.transactions.filter((t) => t.actor === s.playerId).length} buyers, ended=${s.end}`,
      );
    }, 60000);
  it("moves a procedural visitor through approach, interaction and departure without game mutations", () => {
    expect([0, 0.4, 0.8, 1].map(visitorPhase)).toEqual([
      "approaching",
      "interacting",
      "leaving",
      "gone",
    ]);
    const actor = new SessionVisitors();
    actor.set(
      { id: "s:0", location: "south.the-lot", duration: 10000, kind: "buyer" },
      new Vector3(10, 0, 20),
    );
    const figure = actor.root.children[0],
      far = figure.position.x;
    actor.update(4);
    expect(figure.userData.phase).toBe("interacting");
    expect(figure.position.x).toBeLessThan(far);
    actor.update(4);
    expect(figure.userData.phase).toBe("leaving");
    actor.update(2);
    expect(figure.visible).toBe(false);
    actor.set(null, new Vector3());
    expect(actor.root.children).toHaveLength(0);
  });
});
