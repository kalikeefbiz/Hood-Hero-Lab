// Sends feedback straight to GitHub issues when this device has a token.
// The token lives only in this browser's localStorage; it is never in code.
import {
  REPO,
  SHOT_BRANCH,
  issueBody,
  issueLabels,
  issueTitle,
  type FeedbackDraft,
} from "./format";

const TOKEN_KEY = "hh.devfeedback.token";
const SENT_KEY = "hh.devfeedback.sent";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t.trim());
  else localStorage.removeItem(TOKEN_KEY);
};

export interface SentNote {
  id: string;
  title: string;
  number: number | null;
  url: string;
  at: string;
  state?: "open" | "in progress" | "resolved";
}
export const sentNotes = (): SentNote[] => {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};
export const rememberSent = (n: SentNote) => {
  const all = [n, ...sentNotes().filter((x) => x.id !== n.id)].slice(0, 20);
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(all));
  } catch {
    /* storage full: the issue still exists on GitHub */
  }
};

async function api(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json()).message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`GitHub ${r.status}${detail ? `: ${detail}` : ""}`);
  }
  return r.status === 204 ? null : r.json();
}

/** Stores the screenshot on the feedback-shots branch and returns a viewable URL. */
async function uploadShot(id: string, dataUrl: string, token: string) {
  const content = dataUrl.split(",")[1];
  const path = `shots/${id}.jpg`;
  await api(`/repos/${REPO}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify({ message: `Feedback screenshot ${id}`, content, branch: SHOT_BRANCH }),
  });
  return `https://github.com/${REPO}/blob/${SHOT_BRANCH}/${path}?raw=true`;
}

export async function submitToGitHub(d: FeedbackDraft, shot: string | null, token: string) {
  let shotUrl: string | null = null;
  let shotError = "";
  if (shot)
    try {
      shotUrl = await uploadShot(d.id, shot, token);
    } catch (e) {
      shotError = (e as Error).message;
    }
  const body =
    issueBody(d, shotUrl) + (shotError ? `\n\n_Screenshot upload failed: ${shotError}_` : "");
  const issue = (await api(`/repos/${REPO}/issues`, token, {
    method: "POST",
    body: JSON.stringify({ title: issueTitle(d), body, labels: issueLabels(d) }),
  })) as { number: number; html_url: string; title: string };
  const sent: SentNote = {
    id: d.id,
    title: issue.title,
    number: issue.number,
    url: issue.html_url,
    at: d.context.takenAt,
    state: "open",
  };
  rememberSent(sent);
  return sent;
}

/** Refresh open / in progress / resolved for notes sent from this device. */
export async function refreshStates(token: string | null) {
  const notes = sentNotes();
  if (!token) return notes;
  const updated = await Promise.all(
    notes.map(async (n) => {
      if (!n.number) return n;
      try {
        const i = (await api(`/repos/${REPO}/issues/${n.number}`, token)) as {
          state: string;
          labels: { name: string }[];
        };
        const state: SentNote["state"] =
          i.state === "closed"
            ? "resolved"
            : i.labels.some((l) => l.name === "in progress")
              ? "in progress"
              : "open";
        return { ...n, state };
      } catch {
        return n;
      }
    }),
  );
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
  return updated;
}
