/**
 * Drop taps that were queued while the page was frozen.
 *
 * When the main thread stalls (heavy rendering, a long state update), iOS
 * holds the player's taps and delivers them all once it recovers. A player
 * who tapped "Sell" three times on a frozen screen would then sell three
 * times. This guard keeps a heartbeat; input that arrives right after a gap in
 * that heartbeat was queued during the stall, so it is cancelled before any
 * game handler sees it. The next tap on a responsive page goes through as
 * normal.
 */
const BEAT_MS = 100;
/** A heartbeat gap longer than this counts as a stall. */
export const STALL_MS = 700;
/**
 * After a stall, input is held until the page has drawn a frame (the moment
 * the player can see it respond), and never longer than this. Browsers may
 * run the first heartbeat before or after the queued taps; either way they
 * are covered, and a fresh tap on the visibly working page goes through.
 */
export const SETTLE_MS = 350;

let lastBeat = 0;
let recoveredAt = -Infinity;
let settling = false;
let dropped = 0;
let clock = () => performance.now();
/** Tests only: replace the clock. */
export function setGuardClock(c: () => number) {
  clock = c;
}

function beat() {
  const now = clock();
  if (lastBeat > 0 && now - lastBeat > STALL_MS) {
    recoveredAt = now;
    settling = true;
    afterNextFrame(() => (settling = false));
  }
  lastBeat = now;
}
/** Two animation frames (queued input is dispatched before them), or SETTLE_MS. */
function afterNextFrame(fn: () => void) {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === "function") raf(() => raf(fn));
  else globalThis.setTimeout(fn, SETTLE_MS);
}

/** True if input handled right now was queued during a stall. */
export function queuedDuringStall(now = clock()) {
  return (
    (lastBeat > 0 && now - lastBeat > STALL_MS) ||
    (settling && now - recoveredAt < SETTLE_MS)
  );
}

/**
 * How long ago the device created this event. Modern browsers stamp events on
 * the performance clock; very old ones used wall-clock milliseconds.
 */
export function eventAge(e: Event, now = clock()) {
  const t = e.timeStamp;
  if (!t) return 0;
  return t > 1e12 ? Date.now() - t : now - t;
}

export function droppedTaps() {
  return dropped;
}

type GuardTarget = EventTarget & { hidden?: boolean };
export function installInputGuard(target: GuardTarget = document) {
  lastBeat = clock();
  recoveredAt = -Infinity;
  settling = false;
  const timer = globalThis.setInterval(beat, BEAT_MS);
  // Background tabs throttle timers; coming back is not a stall.
  const onVisible = () => {
    if (target.hidden) return;
    lastBeat = clock();
  };
  // A gesture starts with pointerdown/touchstart; its click follows. Judge the
  // gesture by its first event, which carries the device's own timestamp.
  let staleGesture = false;
  const onStart = (e: Event) => {
    staleGesture = eventAge(e) > STALL_MS || queuedDuringStall();
  };
  const onInput = (e: Event) => {
    const stale = staleGesture || queuedDuringStall();
    staleGesture = false;
    if (!stale) return;
    dropped++;
    e.preventDefault();
    e.stopImmediatePropagation();
    // No beat() here: every tap in the queued batch must be dropped. The
    // next heartbeat runs after the queue drains and reopens input.
  };
  target.addEventListener("visibilitychange", onVisible);
  for (const type of ["pointerdown", "touchstart"] as const)
    target.addEventListener(type, onStart, { capture: true, passive: true });
  for (const type of ["click", "submit"] as const)
    target.addEventListener(type, onInput, true);
  return () => {
    globalThis.clearInterval(timer);
    target.removeEventListener("visibilitychange", onVisible);
    for (const type of ["pointerdown", "touchstart"] as const)
      target.removeEventListener(type, onStart, true);
    for (const type of ["click", "submit"] as const)
      target.removeEventListener(type, onInput, true);
  };
}
