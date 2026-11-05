// A tiny bridge between the game UI and the lazily-loaded 3D board, so the
// main bundle can ask the board to animate without importing three.js.
type Walker = (placeId: string) => Promise<void>;
let walker: Walker | null = null;
let dayPulse: (() => void) | null = null;

export function connectBoard(w: Walker, pulse: () => void) {
  walker = w;
  dayPulse = pulse;
  return () => {
    if (walker === w) walker = null;
    dayPulse = null;
  };
}
/**
 * Walk the player's figure to a place. Resolves immediately without a board,
 * and never later than WALK_LIMIT_MS: the UI holds input while a walk is
 * pending, so a stalled board must not be able to lock the game.
 */
export const WALK_LIMIT_MS = 4000;
export const walkTo = (placeId: string) =>
  walker
    ? Promise.race([
        walker(placeId),
        new Promise<void>((r) => window.setTimeout(r, WALK_LIMIT_MS)),
      ])
    : Promise.resolve();
export const pulseDay = () => dayPulse?.();
