/**
 * Deterministic seeded PRNG (Mulberry32) for `src/sim/**`.
 * No `Math.random()` or `Date.now()` is permitted inside the simulation.
 */
export class SeededRng {
  readonly seed: number;
  private state: number;

  constructor(seed: number, savedState?: number) {
    this.seed = seed >>> 0;
    this.state = (savedState ?? seed) >>> 0;
  }

  getState(): number {
    return this.state >>> 0;
  }

  /** Returns a deterministic float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a deterministic float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns a deterministic integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Picks one item deterministically from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}
