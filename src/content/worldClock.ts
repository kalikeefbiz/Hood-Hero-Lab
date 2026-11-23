/** Civil time and active-play pacing for the Stixx. A gameplay day rolls at dawn. */
export const WORLD_CLOCK = {
  dawnMinute: 6 * 60,
  duskMinute: 18 * 60,
  daylightMs: 5 * 60_000,
  nighttimeMs: 7 * 60_000,
} as const;

export const MINUTES_PER_DAY = 24 * 60;
export const CYCLE_MS = WORLD_CLOCK.daylightMs + WORLD_CLOCK.nighttimeMs;
