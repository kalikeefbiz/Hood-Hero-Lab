// Lab-only dev feedback tool. Mounted from main.tsx only when the build sets
// VITE_DEV_FEEDBACK=1, so it never ships in other builds. See README.md for
// how to remove it.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { captureContext, watchErrors } from "./context";
import {
  TAGS,
  feedbackId,
  prefilledIssueUrl,
  issueTitle,
  type FeedbackContext,
  type TagId,
} from "./format";
import {
  getToken,
  refreshStates,
  rememberSent,
  sentNotes,
  setToken,
  submitToGitHub,
  type SentNote,
} from "./github";
import "./feedback.css";

type View = "closed" | "note" | "notes" | "setup";

function FeedbackTool() {
  const [view, setView] = useState<View>("closed");
  const [tags, setTags] = useState<TagId[]>([]);
  const [note, setNote] = useState("");
  const [context, setContext] = useState<FeedbackContext | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [withShot, setWithShot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; url?: string; error?: boolean } | null>(null);
  const [notes, setNotes] = useState<SentNote[]>([]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [hasToken, setHasToken] = useState(() => !!getToken());
  const sheet = useRef<HTMLDivElement>(null);
  const opening = useRef(false);

  const open = useCallback(async () => {
    if (opening.current) return;
    opening.current = true;
    window.dispatchEvent(new Event("hh:pause"));
    const { context, shot } = await captureContext();
    setContext(context);
    setShot(shot);
    setWithShot(!!shot);
    setTags([]);
    setNote("");
    setStatus(null);
    setView("note");
    opening.current = false;
  }, []);

  const close = useCallback(() => {
    setView("closed");
    setStatus(null);
    window.dispatchEvent(new Event("hh:resume"));
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (view !== "closed" && e.key === "Escape") close();
      else if (view === "closed" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n")
        void open();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, open, close]);

  useEffect(() => {
    if (view !== "closed") sheet.current?.querySelector<HTMLElement>("button, textarea, input")?.focus();
    if (view === "notes") {
      setNotes(sentNotes());
      refreshStates(getToken()).then(setNotes).catch(() => {});
    }
  }, [view]);

  const toggle = (id: TagId) =>
    setTags((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));

  async function send() {
    if (!context || busy) return;
    const draft = { id: feedbackId(), tags, note, context };
    const token = getToken();
    if (!token) {
      const url = prefilledIssueUrl(draft);
      rememberSent({ id: draft.id, title: issueTitle(draft), number: null, url, at: context.takenAt });
      window.open(url, "_blank", "noopener");
      setStatus({ text: "Opened in GitHub. Tap Submit there to file it." });
      return;
    }
    setBusy(true);
    try {
      const sent = await submitToGitHub(draft, withShot ? shot : null, token);
      setStatus({ text: `Sent as #${sent.number}`, url: sent.url });
      window.setTimeout(() => setView((v) => (v === "note" ? "closed" : v)), 2500);
      window.setTimeout(() => window.dispatchEvent(new Event("hh:resume")), 2500);
    } catch (e) {
      setStatus({ text: `Couldn’t send: ${(e as Error).message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  const canSend = tags.length > 0 || note.trim().length > 0;

  return (
    <div className="devfb">
      {view === "closed" && (
        <button
          type="button"
          className="devfb-fab"
          aria-label="Dev note (N)"
          title="Dev note (N)"
          onClick={() => void open()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M13 7l4 4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      )}
      {view !== "closed" && (
        <div className="devfb-scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={sheet}
            className="devfb-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Dev feedback"
          >
            <header>
              <strong>{view === "notes" ? "My notes" : view === "setup" ? "Send directly" : "Dev note"}</strong>
              <small>Lab only · game paused</small>
              <nav>
                {view !== "note" && context && (
                  <button type="button" onClick={() => setView("note")}>Note</button>
                )}
                {view !== "notes" && <button type="button" onClick={() => setView("notes")}>My notes</button>}
              </nav>
            </header>

            {view === "note" && (
              <>
                <div className="devfb-tags" role="group" aria-label="What’s this about?">
                  {TAGS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={tags.includes(t.id)}
                      onClick={() => toggle(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  aria-label="Note"
                  placeholder="What happened, or what should change? (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                {shot ? (
                  <label className="devfb-shot">
                    <img src={shot} alt="Screenshot of the city when you opened this note" />
                    {hasToken ? (
                      <span>
                        <input
                          type="checkbox"
                          checked={withShot}
                          onChange={(e) => setWithShot(e.target.checked)}
                        />
                        Attach screenshot
                      </span>
                    ) : (
                      <span className="devfb-muted">Screenshots attach when you send straight from the game.</span>
                    )}
                  </label>
                ) : (
                  <p className="devfb-muted">No city on screen, so no screenshot. Context is still attached.</p>
                )}
                <p className="devfb-muted">
                  {context?.game
                    ? `Day ${context.game.day} · ${context.game.ap} AP · ${context.screen}${context.dialog ? ` · ${context.dialog}` : ""}`
                    : context?.screen}
                </p>
                {status && (
                  <p className={status.error ? "devfb-status devfb-error" : "devfb-status"} role="status">
                    {status.text}{" "}
                    {status.url && (
                      <a href={status.url} target="_blank" rel="noopener">
                        Open
                      </a>
                    )}
                  </p>
                )}
                <div className="devfb-actions">
                  <button type="button" className="devfb-primary" disabled={!canSend || busy} onClick={() => void send()}>
                    {busy ? "Sending…" : hasToken ? "Send note" : "Open in GitHub"}
                  </button>
                  <button type="button" onClick={close}>Cancel</button>
                </div>
                {!hasToken && (
                  <button type="button" className="devfb-link" onClick={() => setView("setup")}>
                    Send straight from the game instead
                  </button>
                )}
              </>
            )}

            {view === "notes" && (
              <ul className="devfb-notes">
                {notes.length === 0 && <li className="devfb-muted">No notes sent from this device yet.</li>}
                {notes.map((n) => (
                  <li key={n.id}>
                    <a href={n.url} target="_blank" rel="noopener">
                      {n.number ? `#${n.number} ` : ""}
                      {n.title.replace(/^\[Feedback\] /, "")}
                    </a>
                    <span className={`devfb-state devfb-${(n.state ?? "draft").replace(" ", "-")}`}>
                      {n.number ? (n.state ?? "open") : "not filed"}
                    </span>
                  </li>
                ))}
                <li>
                  <button type="button" className="devfb-link" onClick={() => setView("setup")}>
                    {hasToken ? "Sending directly · change" : "Set up direct sending"}
                  </button>
                </li>
              </ul>
            )}

            {view === "setup" && (
              <div className="devfb-setup">
                <p>
                  Paste a GitHub fine-grained token for <b>Hood-Hero-Lab</b> only, with <b>Issues</b> and{" "}
                  <b>Contents</b> set to read and write. It stays in this browser and is never sent anywhere
                  except GitHub.
                </p>
                <input
                  type="password"
                  aria-label="GitHub token"
                  autoComplete="off"
                  placeholder={hasToken ? "Token saved on this device" : "github_pat_…"}
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                />
                <div className="devfb-actions">
                  <button
                    type="button"
                    className="devfb-primary"
                    disabled={!tokenDraft.trim()}
                    onClick={() => {
                      setToken(tokenDraft);
                      setTokenDraft("");
                      setHasToken(true);
                      setView(context ? "note" : "notes");
                    }}
                  >
                    Save token
                  </button>
                  {hasToken && (
                    <button
                      type="button"
                      onClick={() => {
                        setToken(null);
                        setHasToken(false);
                      }}
                    >
                      Forget token
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function mountFeedback() {
  watchErrors();
  const host = document.createElement("div");
  host.id = "dev-feedback-root";
  document.body.appendChild(host);
  createRoot(host).render(<FeedbackTool />);
}
