import { openingDecision } from "./StreetLife";
import {
  type GameState,
  type Incident,
  player,
  clamp,
} from "../core/GameState";
import { record } from "../core/EventLog";
import { change, remember } from "./Relationships";
import { random } from "../core/Random";
export function resolveIncident(
  s: GameState,
  i: Incident,
  resolution: NonNullable<Incident["resolution"]>,
  actor: string,
) {
  if (i.status !== "active") return;
  // Finishing or ignoring the incident without giving a word is still a no-commitment route.
  // The closed storyline must never leave the lawful-work introduction unreachable.
  if (i.id === "the-chains" && s.streetLife?.decision === "unasked")
    openingDecision(s, "delay");
  i.status = resolution === "sold" ? "abandoned" : "resolved";
  i.resolution = resolution;
  const property = s.properties[i.property];
  property.possession =
    resolution === "sold"
      ? { kind: "market", id: "resale-market" }
      : { kind: "character", id: i.victim };
  const e = record(
    s,
    "incident",
    resolution === "sold"
      ? `${i.title}: they sold the chains. They’re gone for good.`
      : `${i.title}: ${resolution === "buyback" ? "they took the money" : resolution === "settlement" ? "the leadership worked out a deal" : "you got them back"}. ${s.characters[i.victim].alias ?? s.characters[i.victim].name} has his chains again.`,
    [actor, i.victim, ...i.participants],
    ["player", actor, i.victim, ...i.participants],
    {
      importance: "major",
      factionId: i.organization,
      presentationKey: `incident:${i.id}:outcome`,
      title:
        resolution === "sold" ? "The Chains — lost" : "The Chains — resolved",
      incidentId: i.id,
    },
  );
  i.resolvedBy = actor;
  i.resolvedEventId = e.id;
  change(s.characters[i.victim], actor, {
    trust: resolution === "sold" ? -4 : 18,
    respect: resolution === "sold" ? 0 : 8,
  });
  remember(
    s,
    i.victim,
    actor,
    e.id,
    resolution === "sold"
      ? "My property was lost."
      : "Helped settle my property dispute.",
    20,
  );
  const contributor =
    actor === s.playerId ||
    (resolution === "settlement" &&
      i.interventions.some(
        (x) => x.actor === s.playerId && x.type === "settlement",
      ));
  if (contributor && actor !== s.playerId) {
    change(s.characters[i.victim], s.playerId, { trust: 18, respect: 8 });
    remember(
      s,
      i.victim,
      s.playerId,
      e.id,
      "Brought the dispute to leadership and helped get my property back.",
      20,
    );
  }
  if (contributor && resolution !== "sold") {
    player(s).influence += 5;
    player(s).neighborhoodStanding[s.characters[i.victim].home] += 5;
  }
  for (const id of i.participants) {
    remember(
      s,
      id,
      actor,
      e.id,
      resolution === "recovered"
        ? "Challenged our group."
        : "The property dispute ended.",
      12,
    );
    change(s.characters[id], actor, {
      grievance: resolution === "recovered" ? 20 : 0,
      trust: resolution === "buyback" ? 4 : 0,
    });
  }
}
export function raiseIncidentDemand(s: GameState, i: Incident) {
  i.demand += 15;
  record(
    s,
    "incident",
    `${i.title}: they raised their price to $${i.demand}. Cuzzo’s patience is wearing thin.`,
    i.participants,
    [s.playerId, i.victim, ...i.participants],
    { incidentId: i.id },
  );
}
export function advanceIncidents(s: GameState) {
  for (const incident of Object.values(s.incidents)) advanceIncident(s, incident);
}

export function advanceIncident(s: GameState, i: Incident) {
  if (i.status !== "active") return;
  const age = s.day - i.startedDay;
  if (i.leadershipAware && (i.helpRequested || age >= 3)) {
    const leader =
      s.characters[
        s.factions[i.organization].leaders.find(
          (id) => s.characters[id].status === "active",
        ) ?? ""
      ];
    // Leaders with loyalty/stability priorities may discipline an unauthorized act.
    if (leader && leader.traits.loyalty >= 70 && random(s) < 0.65) {
      resolveIncident(s, i, "settlement", leader.id);
      s.factions[i.organization].instability = clamp(
        s.factions[i.organization].instability - 8,
      );
      return;
    }
  }
  if (age >= i.deadline) {
    resolveIncident(s, i, "sold", i.participants[0]);
    return;
  }
  if (age >= 2 && !i.leadershipAware) {
    i.escalation = clamp(i.escalation + 6);
    if (age === (i.id === "the-chains" ? 2 : 3)) raiseIncidentDemand(s, i);
    if (age >= (i.id === "the-chains" ? 4 : 5)) {
      i.leadershipAware = true;
      s.factions[i.organization].instability += 5;
      record(
        s,
        "incident",
        "Pablo heard about the robbery. He didn’t sign off on it, and now he has to decide what it means for the neighborhood.",
        ["pablo", ...i.participants],
        ["player", "pablo", i.victim],
        {
          importance: "major",
          title: "Pablo heard about the robbery",
          factionId: i.organization,
          expiresOnIncidentClose: true,
          incidentId: i.id,
        },
      );
    }
  }
}
