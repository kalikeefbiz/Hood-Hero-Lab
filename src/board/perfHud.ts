import { droppedTaps } from "../ui/inputGuard";

/**
 * `?perf` readout for playtesting on a phone: frame rate, the worst frame and
 * the worst main-thread stall in the last few seconds, taps the input guard
 * dropped, and board events (context lost/restored). Screenshot it and send.
 */
export class PerfHud {
  private el = document.createElement("div");
  private frames: number[] = [];
  private worstFrame: { at: number; ms: number }[] = [];
  private stalls: { at: number; ms: number }[] = [];
  private worstEver = 0;
  private notes: string[] = [];
  private last = performance.now();
  private beat: number;
  private paint: number;
  constructor(private mode: () => { eco: boolean; lite: boolean }) {
    Object.assign(this.el.style, {
      position: "fixed",
      left: "6px",
      top: "calc(env(safe-area-inset-top) + 4px)",
      zIndex: "9999",
      pointerEvents: "none",
      font: "11px/1.35 ui-monospace, Menlo, monospace",
      color: "#d9ffd0",
      background: "rgba(0,0,0,.72)",
      padding: "4px 6px",
      borderRadius: "6px",
      whiteSpace: "pre",
    });
    document.body.append(this.el);
    // A heartbeat that should fire every 100 ms; lateness is a stall.
    this.beat = window.setInterval(() => {
      const now = performance.now(),
        gap = now - this.last - 100;
      this.last = now;
      if (gap > 150) {
        this.stalls.push({ at: now, ms: gap });
        this.worstEver = Math.max(this.worstEver, gap);
      }
    }, 100);
    this.paint = window.setInterval(() => this.draw(), 500);
  }
  frame(now: number, interval: number, active: boolean) {
    this.frames.push(now);
    if (active && interval < 5000) this.worstFrame.push({ at: now, ms: interval });
  }
  note(text: string) {
    const t = new Date().toLocaleTimeString([], { hour12: false });
    this.notes = [`${t} ${text}`, ...this.notes].slice(0, 4);
    this.draw();
  }
  private draw() {
    const now = performance.now(),
      keep = (a: { at: number }[]) => a.filter((x) => now - x.at < 5000);
    this.frames = this.frames.filter((t) => now - t < 1000);
    this.worstFrame = keep(this.worstFrame) as typeof this.worstFrame;
    this.stalls = keep(this.stalls) as typeof this.stalls;
    const max = (a: { ms: number }[]) =>
      Math.round(a.reduce((m, x) => Math.max(m, x.ms), 0));
    const { eco, lite } = this.mode();
    this.el.textContent = [
      `fps ${this.frames.length}  ${lite ? "lite" : eco ? "eco" : "full"}`,
      `worst frame 5s ${max(this.worstFrame)} ms`,
      `stall 5s ${max(this.stalls)} ms  ever ${Math.round(this.worstEver)} ms`,
      `dropped taps ${droppedTaps()}`,
      ...this.notes,
    ].join("\n");
  }
  dispose() {
    clearInterval(this.beat);
    clearInterval(this.paint);
    this.el.remove();
  }
}
