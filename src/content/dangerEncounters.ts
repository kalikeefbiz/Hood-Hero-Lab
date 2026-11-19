import type { EncounterDefinition } from "../core/Encounter";
import {
  hospitalStay,
  resolveStreetScene,
  sceneDialogue,
  warRecognized,
  type StreetResponse,
} from "../systems/Danger";
export { resolveStreetScene };
export const DANGER_ENCOUNTER: EncounterDefinition = {
  id: "living-danger",
  type: "request",
  participants: [],
  priority: 95,
  trigger: () => [], // Created by an exposure with concrete participants and context.
  eligible: (s, e) =>
    !s.end &&
    !hospitalStay(s) &&
    s.danger.scenes.some(
      (x) => x.id === e.dangerSceneId && x.status === "open" && x.day === s.day,
    ),
  dialogue: (s, e) => {
    const scene = s.danger.scenes.find((x) => x.id === e.dangerSceneId)!;
    return scene.outcome ?? sceneDialogue(s, scene);
  },
  responses: (s, e) => {
    const scene = s.danger.scenes.find((x) => x.id === e.dangerSceneId);
    if (!scene) return [];
    const conflict = s.danger.conflicts.find((c) => c.id === scene.conflictId);
    const dispute =
      scene.motive === "corner" ||
      (scene.motive === "history" && conflict?.state !== "settled") ||
      (scene.motive === "war" && warRecognized(s, s.characters[scene.npc])) ||
      (scene.motive === "debt" &&
        s.street.agreements.some(
          (a) =>
            a.debtor === s.playerId &&
            a.supplier === scene.npc &&
            a.balance > 0,
        ));
    const rows: [StreetResponse, string][] = [];
    if (scene.motive === "introduction" && s.characters[s.playerId].affiliation)
      rows.push(["identify", "Tell them who you run with"]);
    rows.push(["listen", "Hear them out"]);
    rows.push([
      "explain",
      scene.motive === "family"
        ? "Talk about how your cousin is doing"
        : dispute
          ? "Talk it through respectfully"
          : "Tell them what brings you here",
    ]);
    if (dispute) rows.push(["apologize", "Acknowledge their concern"]);
    rows.push([
      "leave",
      dispute ? "Try to leave the confrontation" : "Say goodbye and leave",
    ]);
    rows.push(["disrespect", "Dismiss them disrespectfully"]);
    const terms =
      scene.motive === "debt"
        ? s.street.agreements
            .filter(
              (a) =>
                a.debtor === s.playerId &&
                a.supplier === scene.npc &&
                a.balance > 0,
            )
            .map(
              (a) =>
                `You owe $${a.balance} on pack ${s.street.agreements.indexOf(a) + 1}, due day ${a.dueDay}. Talking won’t pay it off.`,
            )
        : [];
    const history =
      scene.motive === "history" && conflict
        ? [`${conflict.cause}. ${conflict.state === "cooling" ? "Things have cooled off some." : conflict.state === "settled" ? "You settled it." : conflict.state === "worsening" ? "It’s been getting worse." : "It’s still unsettled."}`]
        : [];
    return rows.map(([choice, label]) => ({
      id: choice,
      label,
      detail: [
        "No AP",
        ...terms,
        ...history,
      ].join(" · "),
      effect: { type: "danger" as const, choice },
    }));
  },
  rules: { replay: "read-only", expiresWithIncident: false },
};
