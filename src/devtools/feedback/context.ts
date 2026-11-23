// Gathers what was happening when a feedback note was started.
import { BoardRenderer } from "../../board/BoardRenderer";
import { player } from "../../core/GameState";
import { AUTO_KEY, loadGame } from "../../persistence/SaveSystem";
import type { FeedbackContext } from "./format";
import type { GameState } from "../../core/GameState";

/**
 * Where a note's screenshot and game state come from. The main game uses the board renderer
 * and the autosave; another page (the 3D city preview, strip.html) registers its own.
 */
export interface FeedbackSource {
  capture?: () => string | null;
  game?: () => GameState | null;
  screen?: () => string;
  visibleText?: () => string;
}
let source: FeedbackSource = {};
export function setFeedbackSource(s: FeedbackSource) { source = s; }

const errors: string[] = [];
const push = (msg: string) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 400));
  if (errors.length > 12) errors.shift();
};

/** Start remembering recent errors. Safe to call more than once. */
let watching = false;
export function watchErrors() {
  if (watching) return;
  watching = true;
  window.addEventListener("error", (e) => push(`error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) =>
    push(`unhandled: ${String((e.reason as Error)?.message ?? e.reason)}`),
  );
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push(`console: ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ")}`);
    original(...args);
  };
}

let commit: string | null = null;
async function buildCommit() {
  if (commit) return commit;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}build-info.json`, { cache: "no-store" });
    commit = r.ok ? ((await r.json()).commit as string).slice(0, 9) : "local";
  } catch {
    commit = "local";
  }
  return commit;
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function gameSnapshot(): FeedbackContext["game"] {
  try {
    const s = source.game ? source.game() : loadGame(localStorage, AUTO_KEY);
    if (!s) return null;
    const p = player(s);
    const open = s.encounters.find((e) => e.status === "active" || e.status === "pending");
    return {
      day: s.day,
      ap: s.ap,
      cash: p.wallet.clean + p.wallet.illicit,
      clean: p.wallet.clean,
      street: p.wallet.illicit,
      stress: p.stress,
      zone: s.presence?.zone ?? null,
      location: s.presence?.location ?? null,
      session: s.activeSession ? `${s.activeSession.status} · beat ${s.activeSession.cursor}` : null,
      robbery: s.activeRobbery ? String(s.activeRobbery.id) : null,
      openEncounter: open ? `${open.definitionId ?? open.id} (${open.status})` : null,
      ended: s.end ?? null,
    };
  } catch (e) {
    push(`feedback: could not read save (${(e as Error).message})`);
    return null;
  }
}

/** Call before the feedback sheet is shown, so the screenshot is the game. */
export async function captureContext(): Promise<{ context: FeedbackContext; shot: string | null }> {
  const shot = source.capture ? source.capture() : BoardRenderer.capture();
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
    (d) => !d.closest(".devfb"),
  );
  const heading = dialog?.querySelector("h1, h2, h3");
  const main = document.querySelector("main");
  const now = new Date();
  const context: FeedbackContext = {
    takenAt: now.toISOString(),
    localTime: now.toLocaleString(),
    commit: await buildCommit(),
    url: location.href,
    screen: source.screen?.() || text(document.querySelector('[aria-current="page"]')) || "unknown",
    dialog: dialog
      ? [dialog.getAttribute("aria-label"), text(heading)].filter(Boolean).join(" · ") || "dialog"
      : null,
    visibleText: (source.visibleText?.() ?? text(dialog ?? main)).slice(0, 900),
    viewport: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    userAgent: navigator.userAgent,
    game: gameSnapshot(),
    errors: [...errors],
  };
  return { context, shot };
}
