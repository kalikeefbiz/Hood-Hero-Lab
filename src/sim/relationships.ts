import type { GameState, Relationship } from "../core/GameState";
import type { EngineRelationshipAdapter, RelationshipDelta } from "./types";

/**
 * Read-only cache + delta emitter around the engine's authoritative relationship records.
 * `src/systems/Relationships.ts` remains the single source of truth; the sim never
 * mutates `GameState.characters[*].relationships` directly.
 */
export class SimRelationshipCache {
  private readonly adapter: EngineRelationshipAdapter;
  private readonly affinityCache = new Map<string, number>();
  private readonly pendingDeltas: RelationshipDelta[] = [];

  constructor(adapter?: EngineRelationshipAdapter) {
    this.adapter = adapter ?? { getRelationship: () => null };
  }

  private key(a: string, b: string): string {
    return `${a}=>${b}`;
  }

  /**
   * Computes a cached social affinity score in [-100, 100] from the engine's
   * authoritative relationship record (or neutral 0 for anonymous test residents).
   */
  getAffinity(actorId: string, targetId: string): number {
    const k = this.key(actorId, targetId);
    const cached = this.affinityCache.get(k);
    if (cached !== undefined) return cached;

    const rel: Relationship | null = this.adapter.getRelationship(actorId, targetId);
    const score = rel
      ? Math.max(
          -100,
          Math.min(
            100,
            Math.round(rel.trust * 0.45 + rel.respect * 0.35 + rel.affection * 0.4 - rel.grievance * 0.7),
          ),
        )
      : 0;
    this.affinityCache.set(k, score);
    return score;
  }

  /** Clears cached scores after the engine updates relationships. */
  invalidate(): void {
    this.affinityCache.clear();
  }

  /**
   * Emits a non-authoritative proposed relationship delta to the engine adapter.
   * Codex's integration decides whether/how to apply it in `Relationships.ts`.
   */
  proposeDelta(delta: RelationshipDelta): void {
    this.pendingDeltas.push(delta);
    this.adapter.onRelationshipDelta?.(delta);
  }

  drainProposedDeltas(): RelationshipDelta[] {
    return this.pendingDeltas.splice(0, this.pendingDeltas.length);
  }
}

/** Convenience adapter that reads live `GameState.characters[*].relationships` read-only. */
export function createGameStateRelationshipAdapter(
  getState: () => Pick<GameState, "characters">,
  onDelta?: (delta: RelationshipDelta) => void,
): EngineRelationshipAdapter {
  return {
    getRelationship(actorId, targetId) {
      const state = getState();
      return state.characters[actorId]?.relationships[targetId] ?? null;
    },
    onRelationshipDelta: onDelta,
  };
}
