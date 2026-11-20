// Pure helpers for the Lab's dev feedback tool: no DOM, no network.

export const REPO = "kalikeefbiz/Hood-Hero-Lab";
export const SHOT_BRANCH = "feedback-shots";

export const TAGS = [
  { id: "broke", label: "Something broke" },
  { id: "unclear", label: "Unclear what to do" },
  { id: "text", label: "Text sounds off" },
  { id: "looks", label: "Looks off" },
  { id: "hard", label: "Too hard" },
  { id: "easy", label: "Too easy" },
  { id: "controls", label: "Controls feel off" },
  { id: "slow", label: "Performance issue" },
  { id: "idea", label: "Idea" },
  { id: "love", label: "Love this" },
] as const;
export type TagId = (typeof TAGS)[number]["id"];

export interface FeedbackContext {
  takenAt: string; // ISO real-world time
  localTime: string;
  commit: string;
  url: string;
  screen: string; // bottom-nav page
  dialog: string | null; // open dialog name + heading
  visibleText: string; // short excerpt of what the player was reading
  viewport: string;
  userAgent: string;
  game: {
    day: number;
    ap: number;
    cash: number;
    clean: number;
    street: number;
    stress: number;
    zone: string | null;
    location: string | null;
    session: string | null;
    robbery: string | null;
    openEncounter: string | null;
    ended: string | null;
  } | null;
  errors: string[];
}

export interface FeedbackDraft {
  id: string;
  tags: TagId[];
  note: string;
  context: FeedbackContext;
}

export function feedbackId(now = new Date(), rand = Math.random()) {
  const stamp = now.toISOString().slice(2, 16).replace(/[-:T]/g, "");
  return `fb-${stamp}-${Math.floor(rand * 1296).toString(36).padStart(2, "0")}`;
}

const tagLabel = (id: TagId) => TAGS.find((t) => t.id === id)?.label ?? id;

export function issueTitle(d: FeedbackDraft) {
  const note = d.note.trim().replace(/\s+/g, " ");
  const lead = d.tags.length ? d.tags.map(tagLabel).join(", ") : "Note";
  const day = d.context.game ? ` · day ${d.context.game.day}` : "";
  const text = note ? `: ${note.length > 70 ? note.slice(0, 67) + "…" : note}` : "";
  return `[Feedback] ${lead}${day}${text}`;
}

export function issueLabels(d: FeedbackDraft) {
  return ["feedback", ...d.tags.map((t) => `fb:${t}`)];
}

export function issueBody(d: FeedbackDraft, screenshotUrl: string | null) {
  const c = d.context,
    g = c.game;
  const rows: [string, string][] = [
    ["Feedback ID", d.id],
    ["Sent", `${c.takenAt} (${c.localTime})`],
    ["Build", c.commit],
    ["Screen", c.screen],
    ["Open dialog", c.dialog ?? "none"],
  ];
  if (g)
    rows.push(
      ["Game day / AP", `day ${g.day} · ${g.ap} AP`],
      ["Cash", `$${g.cash} ($${g.clean} clean, $${g.street} street)`],
      ["Stress", String(Math.round(g.stress))],
      ["Where", [g.location, g.zone].filter(Boolean).join(" · ") || "unknown"],
      ["Trapping", g.session ?? "no"],
      ["Robbery", g.robbery ?? "no"],
      ["Encounter", g.openEncounter ?? "none"],
      ["Story ended", g.ended ?? "no"],
    );
  else rows.push(["Game", "no saved game yet"]);
  rows.push(["Viewport", c.viewport], ["Device", c.userAgent], ["URL", c.url]);
  const table = rows
    .map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`)
    .join("\n");
  return [
    `**Tags:** ${d.tags.length ? d.tags.map(tagLabel).join(", ") : "none"}`,
    "",
    "**Note**",
    "",
    d.note.trim() ? d.note.trim().split("\n").map((l) => `> ${l}`).join("\n") : "> (no note)",
    "",
    screenshotUrl ? `![Screenshot](${screenshotUrl})` : "_No screenshot attached._",
    "",
    "<details><summary>Context</summary>",
    "",
    "| | |",
    "|---|---|",
    table,
    "",
    "**On screen:**",
    "",
    "```text",
    c.visibleText || "(nothing captured)",
    "```",
    "",
    "**Recent errors:**",
    "",
    "```text",
    c.errors.length ? c.errors.join("\n") : "(none)",
    "```",
    "",
    "</details>",
    "",
    "<!-- dev-feedback v1 -->",
  ].join("\n");
}

/** A prefilled "new issue" link, for when no GitHub token is set on this device. */
export function prefilledIssueUrl(d: FeedbackDraft, maxLength = 7000) {
  const base = `https://github.com/${REPO}/issues/new`;
  let body = issueBody(d, null);
  const build = () =>
    `${base}?${new URLSearchParams({
      title: issueTitle(d),
      labels: issueLabels(d).join(","),
      body,
    })}`;
  let url = build();
  while (url.length > maxLength && body.length > 200) {
    body = body.slice(0, Math.floor(body.length * 0.8)) + "\n\n…(trimmed)";
    url = build();
  }
  return url;
}
