import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SETTLE_MS,
  STALL_MS,
  droppedTaps,
  installInputGuard,
  setGuardClock,
} from "../ui/inputGuard";

const tap = (t: EventTarget) =>
  t.dispatchEvent(new Event("click", { cancelable: true }));

describe("input guard", () => {
  let remove: () => void = () => {};
  let now = 0;
  afterEach(() => {
    remove();
    vi.useRealTimers();
    setGuardClock(() => performance.now());
  });
  const setup = () => {
    vi.useFakeTimers();
    now = 1000;
    setGuardClock(() => now);
    const button = new EventTarget();
    remove = installInputGuard(button);
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    return { button, onClick };
  };
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      now += 50;
      vi.advanceTimersByTime(50);
    }
  };

  it("holds taps that arrive just after a stall, whichever runs first", () => {
    const { button, onClick } = setup();
    run(200);
    now += STALL_MS + 300;
    run(50); // the heartbeat wins the race this time
    tap(button);
    expect(onClick).not.toHaveBeenCalled();
    run(SETTLE_MS + 50);
    tap(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets taps through on a responsive page", () => {
    const { button, onClick } = setup();
    run(300);
    tap(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("drops every tap queued during a stall, then reopens", () => {
    const { button, onClick } = setup();
    run(200);
    const before = droppedTaps();
    // Time passes but no heartbeat runs: the main thread was blocked.
    now += STALL_MS + 300;
    tap(button);
    tap(button);
    tap(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(droppedTaps() - before).toBe(3);
    // The heartbeat runs again; after a short settle, input works.
    run(500);
    tap(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
