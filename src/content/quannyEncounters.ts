import { skillRank } from "../systems/Skills";
import type { EncounterDefinition, EncounterResponse } from "../core/Encounter";
import {
  QUANNY_HOME,
  QUANNY_LOCATION_REVEAL,
  quannyCollectionInstruction,
} from "../systems/QuannyState";
import { presenceOf } from "../board/presence";
import { player } from "../core/GameState";
import { hospitalStay } from "../systems/Danger";
import { businessError, repairError } from "../systems/Quanny";
import { consignmentTerms, receivable } from "../systems/Consignment";
const response = (
  id: string,
  label: string,
  detail?: string,
  requirement?: EncounterResponse["requirement"],
): EncounterResponse => ({
  id,
  label,
  detail,
  requirement,
  effect: { type: "quanny", choice: id },
});
export const QUANNY_ENCOUNTER: EncounterDefinition = {
  id: "quanny",
  type: "request",
  participants: ["quanny"],
  priority: 100,
  trigger: () => [],
  eligible: (s, e) =>
    !s.end &&
    !hospitalStay(s) &&
    player(s).status === "active" &&
    s.characters.quanny?.status === "active" &&
    s.characters.quanny.availableDay <= s.day &&
    // Once a peaceful introduction is closed, resume business only at the revealed meeting place.
    (!e.deferred ||
      !s.quanny.knownLocation ||
      presenceOf(s).location === QUANNY_HOME) &&
    presenceOf(s).location ===
      (e.sourceEventId ? s.quanny.location : QUANNY_HOME),
  dialogue: (s, e) => {
    if (!s.quanny.claim) return "Aye, where you from?";
    if (s.quanny.business === "new")
      return "I ain’t never heard of you. Who put you on?";
    const a = receivable(s, "quanny");
    if (a)
      return s.day < a.dueDay
        ? `We got an arrangement. I owe you $${a.balance}. Come see me day ${a.dueDay}.`
        : `We got an arrangement. $${a.balance}, right?`;
    if (s.quanny.business === "blocked") return "What you coming around for?";
    if (e.selectedResponses.at(-1)?.id === "terms") {
      const t = consignmentTerms(s);
      return t
        ? `I can make some happen but I need a front. ${t.quantity} Pink Magic. I owe you $${t.amount}, six days from now. I don't pay up front.`
        : "Bring something real before we talk business.";
    }
    return `${e.sourceEventId && s.quanny.knownLocation ? QUANNY_LOCATION_REVEAL + " " : ""}What you got?`;
  },
  responses: (s, e) => {
    const q = s.quanny,
      p = player(s);
    if (!q.claim) {
      const labels = {
        blocks: "This Big BB.",
        angels: "You see the wings, homie. Angels!",
        backstreet: "This BackStreet.",
        muds: "This MuddyWorld.",
        blips: "The Blips.",
      };
      return [
        response(
          `claim:${p.affiliation ?? "unaffiliated"}`,
          p.affiliation
            ? labels[p.affiliation]
            : "Ion bang, but Im trynna touch some money.",
          "The truth",
        ),
        ...(["blocks", "angels"] as const)
          .filter((f) => f !== p.affiliation)
          .map((f) =>
            response(`claim:${f}`, labels[f], "A lie"),
          ),
      ];
    }
    if (q.business === "new")
      return [
        response(
          "explain",
          p.affiliation
            ? "Tell him who you really run with"
            : "Tell him you’re unaffiliated",
        ),
        response("decline-details", "Keep the details to yourself"),
      ];
    const a = receivable(s, "quanny");
    if (a)
      return [
        response(
          "collect",
          `Collect $${a.balance}`,
          quannyCollectionInstruction(s, a.dueDay),
          (state) =>
            state.day < a.dueDay ? `He pays on day ${a.dueDay}.` : null,
        ),
        response("leave", "Leave the arrangement in place"),
      ];
    const later = s.street.agreements.some(
      (a) =>
        a.debtor === "quanny" &&
        a.status === "disputed" &&
        a.collections!.some((c) => c.day < s.day),
    );
    const responses = [
      response(
        "terms",
        "Offer Quanny work",
        "Front him product now; he pays you later",
        (state) => businessError(state),
      ),
      response(
        "ask-work",
        "Ask Quanny for work · Locked",
        "“You need a body before we can talk about that.”",
        () => "Quanny isn’t offering you that kind of work.",
      ),
    ];
    if (e.selectedResponses.at(-1)?.id === "terms") {
      const t = consignmentTerms(s),
        n = consignmentTerms(s, true);
      responses.unshift(
        response(
          "front",
          `Agree · front ${t?.quantity ?? 0} goods for $${t?.amount ?? 0}`,
          "He pays nothing now · owes you in six days",
          (state) => businessError(state),
        ),
        response(
          "negotiate",
          `Negotiate $${n?.amount ?? 0}`,
          "Ask for more. You need to be good with people to pull it off, and a weak pitch could sour things.",
          (state) => businessError(state),
        ),
      );
    }
    if (q.business === "blocked")
      responses.push(
        response(
          "repair",
          "Discuss reopening business",
          "He’ll want new people vouching for you, or standing with the Blocc Boys",
          (state) => repairError(state),
        ),
      );
    if (later && s.day > e.createdDay - 1)
      responses.push(
        response(
          "reconcile",
          "Seek reconciliation",
          "Try to squash it. It won’t settle the money.",
        ),
        response(
          "rob",
          "Attempt to rob Quanny",
          "Extremely dangerous · a seasoned Blocc Boys hitter with people behind him",
        ),
        response(
          "retaliate",
          "Attempt violent retaliation",
          "Deadly · you won’t take him out on luck",
        ),
        response(
          "fight",
          "Challenge Quanny to a fight",
          "Extremely dangerous · experience and backup matter",
        ),
        response(
          "disrespect",
          "Publicly disrespect Quanny",
          "He won’t forget it",
        ),
      );
    responses.push(
      response(
        "leave",
        q.business === "blocked" || later
          ? "Leave it unresolved"
          : "Catch you later.",
      ),
    );
    for (const r of responses)
      if (["rob", "retaliate", "fight", "disrespect"].includes(r.id)) {
        r.detail = `1 AP · ${r.detail}`;
        r.requirement = (state) =>
          state.ap < 1
            ? "You need 1 AP."
            : r.id === "retaliate" &&
                skillRank(state.characters[state.playerId], "combat") < 2
              ? "You need Combat certification first."
              : null;
      }
    return responses;
  },
  rules: { replay: "read-only", expiresWithIncident: false },
};
