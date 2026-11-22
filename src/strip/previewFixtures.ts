// PREVIEW FIXTURES — not NPC behaviour, not production presence.
//
// Codex's location API needs the host to say which NPCs are verifiably present (peopleHere).
// In the shipped game that answer comes from Gemini's NPC simulation. Until it is integrated,
// the strip preview pretends everyone with an NPC_SPOTS entry is standing at it, all day.
// This file is the only place that pretence lives. It is never saved, never imported by the
// game (src/ui, src/systems, src/city), and must be deleted when real presence arrives.
import { NPC_SPOTS } from "./cityMap";

export const PREVIEW_FIXTURE_NOTICE =
  "Preview fixture: NPCs stand at their map spots. Real presence comes from the NPC simulation.";

/** Characters the preview treats as present at a game location. */
export function fixturePeopleAt(locationId: string): string[] {
  return NPC_SPOTS.filter((s) => s.locationId === locationId).map((s) => s.characterId);
}
