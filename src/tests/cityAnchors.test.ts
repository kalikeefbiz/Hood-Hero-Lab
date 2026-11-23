import { describe, expect, it } from "vitest";
import { CITY_ANCHORS, anchorById, anchorsAt, isInteractive } from "../strip/anchors";
import { HOUSES, HOUSEHOLDS, NPC_SPOTS, WALLS, DOORS, GATHERING_SPOTS } from "../strip/cityMap";
import { resolveReservoirLocation, RESERVOIR_LOCATION_IDS } from "../city/LocationInteractions";
import { PreviewSession } from "../strip/previewSession";
import { newGame } from "../core/Simulation";

const inWall = (x: number, z: number) => WALLS.some((w) => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1);

describe("city anchors", () => {
  it("have unique stable ids", () => {
    const ids = CITY_ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cover every Reservoir game location, and every interactive anchor resolves in the location API", () => {
    const located = new Set(CITY_ANCHORS.filter(isInteractive).map((a) => a.locationId));
    for (const id of RESERVOIR_LOCATION_IDS) expect(located.has(id)).toBe(true);
    for (const a of CITY_ANCHORS.filter(isInteractive)) {
      const loc = resolveReservoirLocation(a.locationId!);
      expect(loc, a.id).not.toBeNull();
      if (a.propertyId) expect(loc!.properties.map((p) => p.id)).toContain(a.propertyId);
    }
  });

  it("stand on open ground, never inside a building", () => {
    for (const a of CITY_ANCHORS) expect(inWall(a.x, a.z), a.id).toBe(false);
  });

  it("find the nearest anchor at a point", () => {
    const door = DOORS.find((d) => d.locationId === "reservoir.lil-jays")!;
    expect(anchorsAt(door.x, door.z, ["place"])[0].id).toBe("reservoir.lil-jays");
    expect(anchorsAt(500, 500)).toEqual([]);
  });

  it("put NPC spots and gathering spots at real game locations, for real characters", () => {
    const characters = newGame("T", "reservoir").characters;
    for (const s of NPC_SPOTS) {
      expect(characters[s.characterId], s.characterId).toBeDefined();
      expect(resolveReservoirLocation(s.locationId), s.locationId).not.toBeNull();
    }
    for (const g of GATHERING_SPOTS) expect(resolveReservoirLocation(g.locationId)).not.toBeNull();
    expect(anchorById("npc:mr-lewis")?.locationId).toBe("reservoir.lil-jays");
    expect(anchorById("res-court-sideline")?.locationId).toBe("reservoir.lot-court");
  });
});

describe("households (RESERVOIR_CANON section E)", () => {
  const house = (id: string) => HOUSES.find((h) => h.id === id)!;
  it("live in mapped houses, one household per house", () => {
    const props = HOUSEHOLDS.map((h) => h.propertyId);
    expect(new Set(props).size).toBe(props.length);
    for (const h of HOUSEHOLDS) expect(house(h.propertyId), h.id).toBeDefined();
    expect(new Set(HOUSEHOLDS.map((h) => h.id)).size).toBe(HOUSEHOLDS.length);
  });

  it("give Mr. Lewis his own home that is not a robbery target", () => {
    const lewis = HOUSEHOLDS.find((h) => h.residents.includes("mr-lewis"))!;
    expect(lewis.kind).toBe("owner-occupied");
    expect(house(lewis.propertyId).targetId).toBeNull();
  });

  it("put Splash Gang in a shared abandoned house that is not the street-work boarded house", () => {
    const bando = HOUSEHOLDS.find((h) => h.id === "household.splash-gang")!;
    expect(bando.kind).toBe("bando");
    expect(bando.residents).toContain("quanny");
    expect(bando.canonResidents.length).toBe(4);
    expect(house(bando.propertyId).look).toBe("abandoned");
    expect(house(bando.propertyId).locationId).toBe("reservoir.homes");
  });

  it("never assign an existing engine character to two households", () => {
    const all = HOUSEHOLDS.flatMap((h) => [...h.residents, ...h.canonResidents]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("preview session", () => {
  it("runs the real location API on throwaway state and never touches storage", () => {
    const g = globalThis as { localStorage?: unknown };
    const prior = g.localStorage;
    g.localStorage = new Proxy({}, { get() { throw new Error("preview touched localStorage"); } });
    try {
      const s = new PreviewSession({ peopleAt: (id) => (id === "reservoir.lil-jays" ? ["mr-lewis", "quanny"] : []) });
      const market = anchorById("reservoir.lil-jays")!;
      expect(s.arrive(market)).toBe(true);
      const delivery = s.query(market).actions.find((a) => a.command.type === "lewisDelivery")!;
      expect(delivery.error).toBeNull();
      const before = s.player.wallet.clean;
      const result = s.run(market, delivery.command);
      expect(result.error).toBeNull();
      expect(s.player.wallet.clean).toBe(before + result.changes.wallet!.clean);
      expect(s.eventsOf(result).length).toBeGreaterThan(0);
    } finally {
      g.localStorage = prior;
    }
  });

  it("only treats people as present when the presence source says so", () => {
    const s = new PreviewSession({ peopleAt: () => [] });
    const market = anchorById("reservoir.lil-jays")!;
    s.arrive(market);
    const delivery = s.query(market).actions.find((a) => a.command.type === "lewisDelivery");
    expect(delivery?.error ?? "absent").not.toBeNull();
  });
});
