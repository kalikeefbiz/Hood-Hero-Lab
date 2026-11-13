/**
 * Read-only boundary between simulation records and player knowledge.
 * References are command handles, never display labels. Do not add private
 * fields to these views: menus, city cards and dialogue share these adapters.
 * No rolls, awards, save fields or inferred discoveries belong here.
 */
import type { GameState, GameEvent } from "../core/GameState";
import { LOCATIONS, locationById } from "../board/locations";
import { ROBBERY_TARGETS, type CareerKind } from "../content/robberyCareer";
import { ITEM_DEFINITIONS } from "../content/inventory";
import { ACTIONS, validateAction, type Action } from "../core/ActionEngine";
import { careerOpportunities, targetForJob } from "../systems/RobberyCareer";

export const characterName = (s: GameState, id: string) =>
  id === s.playerId
    ? "you"
    : s.characters[s.playerId].known.includes(id)
      ? (s.characters[id]?.alias ?? s.characters[id]?.name ?? "someone")
      : "someone from the neighborhood";
export const placeName = (s: GameState, id: string) =>
  locationById(id)?.name ??
  s.zones[id as keyof typeof s.zones]?.name ??
  "the meeting place";
export const jobName = (s: GameState, id: string) =>
  targetForJob(s, id)?.name ?? "the lined-up job";

/** A receipt label is stable across reloads and keeps separate debts distinct. */
export function agreementName(s: GameState, id: string) {
  const index = s.street.agreements.findIndex((a) => a.id === id);
  const a = s.street.agreements[index];
  return a
    ? `pack ${index + 1} from ${characterName(s, a.supplier)}`
    : "the agreed pack";
}

/** Coarse, qualified impressions, never a score, trait or prediction of consent. */
export function relationshipView(s: GameState, id: string) {
  const p = s.characters[s.playerId],
    c = s.characters[id];
  if (!c || !p.known.includes(id)) return "You haven't been introduced.";
  if (!p.connections.includes(id))
    return "You've heard of them. Get to know them in person.";
  const r = c.relationships[p.id];
  return (r?.grievance ?? 0) > 30
    ? "Things seem strained between you."
    : (r?.trust ?? 0) < 15
      ? "They seem guarded around you."
      : (r?.trust ?? 0) < 45
        ? "You're getting acquainted."
        : "You seem to be on good terms. Their cooperation is still their choice.";
}

export function attentionView(value: number) {
  return value < 25
    ? "Quiet"
    : value < 50
      ? "Watchful"
      : value < 75
        ? "Heavy attention"
        : "Intense attention";
}
export const dangerExplanation = (text: string) =>
  text.replace(/your heat \(\d+(?:\.\d+)?\)/gi, "the attention on you");
export const publicRequirement = (text: string) =>
  text.replace(
    /an optional authored violent-operation introduction/g,
    "training with an experienced contact",
  );
export function marketView(s: GameState, zone: keyof GameState["zones"]) {
  const m = s.street.markets[zone];
  return `${m.demand < 40 ? "Few potential buyers" : "Some local interest"} · ${m.competition < 40 ? "ordinary competition" : "crowded market"} · ${attentionView(m.pressure).toLowerCase()}`;
}

/**
 * Legacy saves contain already-authored technical text. Translate it at the
 * boundary as well as projecting structured records. This is not discovery:
 * never look up a seed, private intention, future outcome or loot contents.
 */
export function playerText(
  s: GameState,
  text: string | null | undefined,
): string {
  if (!text) return "";
  let out = publicRequirement(text);
  if (
    /Neighborhood\/target cooldown|Next home opportunity day|Next attempt day/.test(
      out,
    )
  )
    return "People here are still on alert after the last attempt. Give the area time to settle.";
  if (
    /Unknown (?:named|career|target|action|actor|market|item|contact)|\bstale\b|invalid.*(?:reference|cursor)|source depleted|source stock no longer/i.test(
      out,
    )
  )
    return "This opportunity has changed. Return to the City and check again.";
  // Affiliation standing is a public requirement; a sponsor's private score isn't.
  if (/35 organizational standing and 35 sponsor trust/.test(out))
    return "Requires 35 organizational standing and a sponsor willing to vouch for you.";
  // Match the score itself, not unrelated money/deadlines elsewhere in a sentence.
  out = out
    .replace(
      /Consignment requires 30 supplier trust; cash terms start at 20\./g,
      "They aren't ready to front you a pack. Build a relationship and discuss cash terms in person.",
    )
    .replace(
      /\b(?:at least )?\d+(?:\.\d+)?\s+(?:(?:earned|supplier|representative|sponsor)\s+)?(?:trust|respect|loyalty)\b/gi,
      "a stronger relationship",
    )
    .replace(
      /\b(?:trust|respect|affection|grievance|loyalty)\s*(?:[:=]|>=|≥)?\s*[+−-]?\d+(?:\.\d+)?/gi,
      "the relationship changed",
    );
  out = out
    .replace(
      /\bInternal opposition must fall to \d+ or below\b/g,
      "Leadership faces internal opposition",
    )
    .replace(
      /\s*·\s*(?:\d+% (?:reliability|chance of useful information)|Likely refusal:.*)/gi,
      "",
    )
    .replace(
      /\b(?:success chance|chance of success)\s*[:=]?\s*\d+%/gi,
      "The outcome is uncertain",
    )
    .replace(/\bpressure \d+(?:\.\d+)?/gi, "pressure is building")
    .replace(/Demand is now \d+(?:\.\d+)?/g, "Local interest has shifted")
    .replace(
      /Reliability fell to \d+(?:\.\d+)?\./g,
      "Your employer is concerned about your attendance.",
    )
    .replace(
      /Future tier: no authored opportunity is available\./g,
      "You haven't learned of an opportunity like this yet.",
    )
    .replace(
      /Quanny(?:’s|'s) authored business conditions still apply\./g,
      "Quanny isn't ready to discuss this business.",
    );
  // Resolve only public registry labels. Never fall back to a raw identifier.
  const labels: [string, string][] = [
    ...Object.entries(ITEM_DEFINITIONS).map(
      ([id, item]) => [id, item.name] as [string, string],
    ),
    ...LOCATIONS.map((l) => [l.id, l.name] as [string, string]),
    ...ROBBERY_TARGETS.map((t) => [t.id, t.name] as [string, string]),
    ...(s.robberies?.jobs ?? []).map(
      (j) => [j.id, jobName(s, j.id)] as [string, string],
    ),
    ...s.street.agreements.map(
      (a) => [a.id, agreementName(s, a.id)] as [string, string],
    ),
    ...s.street.lots.map(
      (l, i) =>
        [l.id, `pack ${i + 1} received on day ${l.acquiredDay}`] as [
          string,
          string,
        ],
    ),
    ...Object.keys(s.characters).map(
      (id) => [id, characterName(s, id)] as [string, string],
    ),
  ];
  for (const [id, label] of labels.sort((a, b) => b[0].length - a[0].length)) {
    if (id === label || !out.includes(id)) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "g"),
      label,
    );
  }
  return out
    .replace(
      /\b(?:lick|event|session|assignment|commitment|lot|agreement|slot|danger|life-talk)-\d+(?::[\w.-]+)*/g,
      "the recorded activity",
    )
    .replace(
      /\b(?:seed|riskRoll|targetId|jobId|presentationKey)\s*[:=]\s*[^\s,;]+/g,
      "",
    )
    .replace(
      /\b(?:home|street|liquor|commercial|criminal)\.[\w.-]+/g,
      "the local opportunity",
    );
}
export const playerReason = (
  s: GameState,
  reason: string | null | undefined,
) => (reason ? playerText(s, reason) : null);

export function actionView(s: GameState, action: Action) {
  const def = ACTIONS[action.type];
  return {
    reason: playerReason(s, validateAction(s, action)),
    description: playerText(s, def.description),
    outcomes: def.outcomes.map((x) => playerText(s, x)).join(" / "),
    uncertainty: ["negotiate", "recover", "crime", "assign"].includes(
      action.type,
    )
      ? "The outcome is uncertain. Your preparation and the circumstances matter."
      : null,
  };
}

/** Only events the character witnessed; IDs retained solely for UI commands. */
export function eventView(s: GameState, e: GameEvent) {
  if (!e.observedBy.includes(s.playerId)) return null;
  return {
    id: e.id,
    day: e.day,
    category: e.category,
    importance: e.importance,
    factionId: e.factionId,
    title: playerText(s, e.title),
    text: playerText(s, e.text),
  };
}

export function latestPlayerEvent(s: GameState, after = 0) {
  const e = s.events
    .slice(after)
    .filter((e) => e.observedBy.includes(s.playerId))
    .at(-1);
  return e ? eventView(s, e) : null;
}

const possibilities: Record<CareerKind, string> = {
  home: "Homes in this neighborhood may hold cash, electronics or personal valuables. Contents are unknown until searched.",
  store:
    "Commercial premises may hold cash or stock. You don't know what's inside.",
  liquor: "A shop may hold cash or saleable stock. Nothing is guaranteed.",
  "strong-arm":
    "Passersby may carry cash or personal belongings. You cannot know what they're carrying.",
};
export function robberyPlaceView(s: GameState, location: string) {
  const targets = careerOpportunities(s, location);
  return {
    possibilities: [...new Set(targets.map((t) => possibilities[t.kind]))],
    targets: targets.map((t) => ({
      ref: t.id,
      kind: t.kind,
      name: t.name,
      circumstance:
        t.kind === "home"
          ? "A private home on this block. Someone could still be inside."
          : t.circumstance,
      warning:
        t.kind === "home"
          ? "Occupied home · uncertain danger"
          : "Confrontation risk",
      leadRequired: t.lead,
      expiresDay: s.robberies?.jobs.find(
        (j) =>
          j.targetId === t.id &&
          j.status === "offered" &&
          j.expiresDay >= s.day,
      )?.expiresDay,
      unsettled: !!t.cooldown && s.day < t.cooldown.nextDay,
      error: playerReason(s, t.error),
    })),
  };
}

/** Closed containers reveal only their existence, never their contents/value/load. */
export function robberyDiscoveryView(s: GameState) {
  const c = s.activeRobbery?.career;
  if (!c) return { goods: [], lockedContainer: false };
  return {
    lockedContainer:
      c.goods.some((g) => g.locked && g.beat <= c.revealed) && !c.dial.open,
    goods: c.goods
      .filter((g) => g.beat <= c.revealed && (!g.locked || c.dial.open))
      .map((g) => ({
        ref: g.id,
        itemId: g.itemId,
        name: ITEM_DEFINITIONS[g.itemId].name,
        quantity: g.quantity,
        value: g.value,
        load: g.quantity * ITEM_DEFINITIONS[g.itemId].load,
        takenBy: g.takenBy,
      })),
  };
}
