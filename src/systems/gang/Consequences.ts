import { STRATEGY_BALANCE } from "../../content/strategy";
import {
  clamp,
  type FactionId,
  type GameState,
  type ZoneId,
} from "../../core/GameState";

interface FactionConsequences {
  resources?: number;
  contribution?: number;
  instability?: number;
  standing?: { characterId: string; amount: number };
  priority?: { zone: ZoneId; untilDay: number };
}

/** Apply faction-side changes after the owning command or daily resolver accepts the outcome. */
export function applyFactionConsequences(
  state: GameState,
  factionId: FactionId,
  {
    resources,
    contribution,
    instability,
    standing,
    priority,
  }: FactionConsequences,
) {
  const faction = state.factions[factionId];
  if (resources !== undefined)
    faction.resources = clamp(
      faction.resources + resources,
      0,
      STRATEGY_BALANCE.resourceCap,
    );
  if (contribution !== undefined)
    state.strategic.contributions[factionId] += contribution;
  if (instability !== undefined)
    faction.instability = clamp(faction.instability + instability);
  if (standing) {
    const standings =
      state.characters[standing.characterId].organizationStanding;
    standings[factionId] = clamp(standings[factionId] + standing.amount);
  }
  if (priority) {
    const strategy = state.strategic.strategies[factionId];
    strategy.priority = priority.zone;
    strategy.priorityUntil = priority.untilDay;
  }
}
