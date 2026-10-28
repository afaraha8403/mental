/**
 * Pure view model for the Mental panel: heartbeat → what to show, the band
 * state picker, receipt parsing from tool calls, and the pane and band as
 * plain data (`paneModelOf`, `bandModelOf`) that any host can draw. No Node
 * APIs and nothing host-specific.
 */

import { ageOf, clockOf, handoffMsOf, msOf, oneLine, plural, textOf } from "./format.mjs";

export const PRESSURE_CONTEXT_PCT = 75;
export const PRESSURE_EDITS = 25;
export const RECEIPT_MS = 6000;

/** Commands whose success writes to the Mental store (refresh after them). */
export const WRITE_COMMANDS = new Set([
  "park",
  "handoff",
  "decide",
  "attention",
  "journal",
  "note",
  "track",
  "link",
  "remap",
  "split",
  "new",
  "local",
]);

/** Receipt label + color key per write command. */
export const RECEIPT_KINDS = {
  park: { label: "Parked", tone: "violet", glyph: "◆" },
  handoff: { label: "Handed off", tone: "violet", glyph: "◆" },
  journal: { label: "Journaled", tone: "purple", glyph: "◆" },
  decide: { label: "Decision", tone: "sky", glyph: "◇" },
  attention: { label: "Attention", tone: "amber", glyph: "△" },
  note: { label: "Note", tone: "green", glyph: "○" },
  track: { label: "Time", tone: "zinc", glyph: "◷" },
};

export const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** @returns {SessionStats} */
export function newSession(now) {
  return {
    startedAt: now,
    turns: 0,
    files: new Map(),
    edits: 0,
    context: null,
    compacting: false,
    working: false,
    receipt: null,
    log: [],
  };
}

/**
 * Remember a receipt for the session's activity list.
 * @param {SessionStats} s
 * @param {Receipt} receipt
 */
export function noteReceipt(s, receipt) {
  s.receipt = receipt;
  s.log.push(receipt);
  if (s.log.length > 8) s.log.splice(0, s.log.length - 8);
}

/**
 * @typedef {{
 *   startedAt: number,
 *   turns: number,
 *   files: Map<string, number>,
 *   edits: number,
 *   context: { percent: number | null, tokens: number | null, window: number | null } | null,
 *   compacting: boolean,
 *   working: boolean,
 *   receipt: Receipt | null,
 *   log: Receipt[],
 * }} SessionStats
 * @typedef {{ kind: string, label: string, tone: string, glyph: string, title: string, at: number }} Receipt
 */

/**
 * @param {SessionStats} s
 * @param {string} path
 */
export function noteEdit(s, path) {
  if (!path) return;
  s.edits += 1;
  s.files.set(path, (s.files.get(path) || 0) + 1);
}

/** @param {SessionStats} s */
export function noteTurnComplete(s) {
  s.turns += 1;
  s.working = false;
}

/**
 * @param {SessionStats} s
 * @param {{ tokens?: number, window?: number, percent?: number } | null | undefined} ctx
 */
export function noteContext(s, ctx) {
  if (!ctx) return;
  const window = Number.isFinite(ctx.window) ? Number(ctx.window) : null;
  const tokens = Number.isFinite(ctx.tokens) ? Number(ctx.tokens) : null;
  let percent = Number.isFinite(ctx.percent) ? Number(ctx.percent) : null;
  if (percent == null && tokens != null && window) percent = (tokens / window) * 100;
  s.context = { percent, tokens, window };
}

/**
 * Which Mental command a tool call ran, if any.
 * Bash: `mental park …`, `npx @balacode/mental decide …`, `node bin/cli.mjs note …`.
 * MCP: `mcp__<server with mental>__<command>`.
 * @param {{ tool?: string, command?: string }} call
 * @returns {string | null}
 */
export function mentalCommandOf(call) {
  const tool = String(call?.tool || "");
  const mcp = /^mcp__(.+)__([a-z_]+)$/.exec(tool);
  if (mcp) return /mental/i.test(mcp[1]) ? mcp[2] : null;
  if (tool !== "Bash" && tool !== "PowerShell") return null;
  for (const segment of commandSegmentsOf(String(call?.command || ""))) {
    const m =
      /^(?:npx\s+(?:-y\s+)?)?(?:@balacode\/)?mental(?:\.cmd)?\s+([a-z][a-z-]*)/i.exec(segment) ||
      /^node\s+\S*bin[\\/]cli\.mjs\s+([a-z][a-z-]*)/i.exec(segment);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/**
 * The simple commands of a shell line, each trimmed, with quoted strings and
 * heredoc bodies blanked out first. A `mental park` inside a commit message or
 * an `echo "…"` is text, not a call, so it must never start a segment.
 * @param {string} cmd
 * @returns {string[]}
 */
export function commandSegmentsOf(cmd) {
  const bare = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, " ")
    .replace(/'[^']*'|"(?:[^"\\`]|\\[\s\S])*"/g, '""');
  return bare
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim().replace(/^(?:[({]\s*)+/, "").replace(/^&\s+/, "").replace(/^(?:\w+=\S*\s+)+/, ""))
    .filter(Boolean);
}

/** @param {string | null} command */
export function isWriteCommand(command) {
  return !!command && WRITE_COMMANDS.has(command);
}

/**
 * Pull a short title from a Mental `--json` envelope (best effort).
 * @param {unknown} text
 */
export function receiptTitleOf(text) {
  if (typeof text !== "string" || !text.includes("{")) return "";
  let body;
  try {
    body = JSON.parse(text.slice(text.indexOf("{")));
  } catch {
    return "";
  }
  if (!body || typeof body !== "object" || body.ok === false) return "";
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const keys = ["title", "title_internal", "outcome", "resume", "summary", "question"];
  for (const node of [data, data.decision, data.attention, data.handoff, data.entry, data.note, data.interval]) {
    if (!node || typeof node !== "object") continue;
    for (const k of keys) {
      if (typeof node[k] === "string" && node[k].trim()) return oneLine(node[k]);
    }
  }
  return "";
}

/**
 * Build a receipt chip for a finished Mental write, or null.
 * @param {string | null} command
 * @param {{ text?: string, result?: unknown, isError?: boolean } | undefined} result
 * @param {number} now
 * @returns {Receipt | null}
 */
export function receiptOf(command, result, now) {
  if (!command || !RECEIPT_KINDS[command]) return null;
  if (!result || result.isError) return null;
  // `text` is set by core on a tool's own result; a hook's answer may carry only `result`.
  const text = textOf(result.text ?? result.result);
  if (/"ok"\s*:\s*false/.test(text)) return null;
  const kind = RECEIPT_KINDS[command];
  return { kind: command, ...kind, title: receiptTitleOf(text), at: now };
}

/**
 * Heartbeat `{ ok, data }` → what the panel needs.
 * @param {any} hb
 * @param {number} now
 */
export function viewModelOf(hb, now) {
  const d = hb && hb.ok !== false && hb.data && typeof hb.data === "object" ? hb.data : null;
  if (!d || !d.id) return { linked: false };
  const handoff = d.handoff || null;
  const handoffAt = handoffMsOf(handoff);
  const track = d.track && d.track.enabled ? d.track : null;
  const focused = track ? (track.running || []).find((r) => r.id === track.focusedId) || track.running?.[0] : null;
  return {
    linked: true,
    id: String(d.id),
    branch: d.git?.branch || "",
    dirty: !!d.git?.dirty,
    changed: String(d.git?.porcelain || "")
      .split("\n")
      .filter((l) => l.trim()).length,
    recent: Array.isArray(d.git?.recent) ? d.git.recent.slice(0, 4) : [],
    resume: oneLine(handoff?.resume || ""),
    outcome: oneLine(handoff?.outcome || ""),
    via: handoff?.via || "",
    handoffFile: typeof handoff?.file === "string" ? handoff.file : "",
    handoffAt,
    handoffAge: handoffAt == null ? null : Math.max(0, now - handoffAt),
    attention: Array.isArray(d.attention) ? d.attention : [],
    attentionCount: Number(d.attentionCount) || 0,
    decisions: Array.isArray(d.openDecisions) ? d.openDecisions : [],
    decisionCount: Number(d.openDecisionCount) || 0,
    needsEyes: Array.isArray(d.needsEyes) ? d.needsEyes : [],
    needsEyesCount: Number(d.needsEyesCount) || 0,
    laterCount: Number(d.laterCount) || 0,
    guardrails: Array.isArray(d.guardrails) ? d.guardrails : [],
    guardrailCount: Number(d.guardrailCount) || 0,
    delta: d.delta || null,
    track: track
      ? {
          runningCount: Number(track.runningCount) || 0,
          staleCount: Number(track.staleCount) || 0,
          unclocked: !!track.unclocked,
          startedAt: focused ? msOf(focused.started) : null,
          stale: !!focused?.stale,
        }
      : null,
  };
}

/**
 * Band state, highest priority first.
 * @param {ReturnType<typeof viewModelOf> | null} vm
 * @param {SessionStats} s
 * @param {number} now
 */
export function bandStateOf(vm, s, now) {
  if (s.compacting) return "compacting";
  if (s.receipt && now - s.receipt.at < RECEIPT_MS) return "receipt";
  if (!vm) return "loading";
  if (!vm.linked) return "absent";
  const ctx = s.context?.percent;
  if ((ctx != null && ctx >= PRESSURE_CONTEXT_PCT) || s.edits >= PRESSURE_EDITS) return "pressure";
  if (s.working) return "working";
  if (vm.handoffAge != null && vm.handoffAge < 15 * 60 * 1000) return "fresh";
  return "calm";
}

/** Why the band is amber, in a few words. */
export function pressureReasonOf(s) {
  const ctx = s.context?.percent;
  if (ctx != null && ctx >= PRESSURE_CONTEXT_PCT) return `context ${Math.round(ctx)}% — hand off before compacting`;
  return `${s.edits} edits since the last handoff — park a resume point`;
}

/**
 * Semantic tones every surface maps to its own theme: `accent`, `ok`, `info`,
 * `warn`, `danger`, `muted`, or `""` for the host's primary ink.
 * @typedef {"" | "accent" | "ok" | "info" | "warn" | "danger" | "muted"} Tone
 */

const RECEIPT_TONE = { violet: "accent", purple: "accent", sky: "info", amber: "warn", green: "ok", zinc: "muted" };

const KIND_LABEL = {
  thread: "Open thread",
  concern: "Concern",
  verify: "Needs eyes",
  direction: "Direction",
};

/**
 * Live status of the session, one word and a tone.
 * @param {ReturnType<typeof viewModelOf> | null} vm
 * @param {SessionStats} s
 * @param {number} now
 * @returns {{ state: string, label: string, tone: Tone }}
 */
export function statusOf(vm, s, now) {
  const state = bandStateOf(vm, s, now);
  switch (state) {
    case "compacting":
      return { state, label: "Compacting", tone: "accent" };
    case "receipt":
      return { state, label: s.receipt.label, tone: RECEIPT_TONE[s.receipt.tone] || "accent" };
    case "loading":
      return { state, label: "Reading", tone: "muted" };
    case "absent":
      return { state, label: "Not linked", tone: "muted" };
    case "pressure":
      return { state, label: "Hand off soon", tone: "warn" };
    case "working":
      return { state, label: "Working", tone: "ok" };
    case "fresh":
      return { state, label: "Fresh hand-off", tone: "accent" };
    default:
      return { state, label: "Idle", tone: "muted" };
  }
}

/**
 * @typedef {{ key: string, kind: string, label: string, tone: Tone, title: string, at: number | null, path: string }} Need
 */

/**
 * Items that need the user: open attention (verify items read "Needs eyes")
 * and open decisions. Heartbeat caps both lists, so `total` comes from its
 * counts. Each item is keyed on its file path, which survives a retitle.
 * @returns {{ items: Need[], total: number, later: number }}
 */
export function needsOf(vm) {
  if (!vm?.linked) return { items: [], total: 0, later: 0 };
  const titleOf = (x) => oneLine(x?.title || x?.question || x?.description || x?.file || "");
  /** @type {Omit<Need, "key">[]} */
  const listed = [
    ...(vm.attention || [])
      .filter((x) => x?.status !== "later")
      .map((x) => ({
        kind: x?.kind === "verify" ? "eyes" : x?.kind || "thread",
        label: KIND_LABEL[x?.kind] || "Attention",
        tone: /** @type {Tone} */ (x?.kind === "verify" ? "danger" : "warn"),
        title: titleOf(x),
        at: msOf(x?.timestamp),
        path: x?.path || "",
      })),
    ...(vm.decisions || []).map((x) => ({
      kind: "decision",
      label: "Open decision",
      tone: /** @type {Tone} */ ("info"),
      title: titleOf(x),
      at: msOf(x?.timestamp),
      path: x?.path || "",
    })),
  ];
  const items = listed.filter((x) => x.title).map((x) => ({ ...x, key: x.path || `${x.kind}|${x.title}` }));
  const later = Math.max((vm.attention || []).filter((x) => x?.status === "later").length, Number(vm.laterCount) || 0);
  const counted = Math.max(0, (Number(vm.attentionCount) || 0) - later) + (Number(vm.decisionCount) || 0);
  return { items, total: Math.max(items.length, counted), later };
}

/**
 * `needsOf` minus what the person hid from the footer and band. `total`
 * still counts the items heartbeat did not list.
 * @param {any} vm
 * @param {Set<string> | string[] | undefined} dismissed
 */
export function visibleNeedsOf(vm, dismissed) {
  const hide = dismissed instanceof Set ? dismissed : new Set(dismissed || []);
  const { items, total } = needsOf(vm);
  const shown = items.filter((x) => !hide.has(x.key));
  return { items: shown, total: total - (items.length - shown.length) };
}

/** `1 needs you` / `2 need you`. */
export function needsLabelOf(total) {
  return `${total} need${total === 1 ? "s" : ""} you`;
}

/**
 * What the band above the prompt says: status, the resume point (or why
 * there is none), how much needs you, and one line of news when there is any.
 * @param {{ vm: any, s: SessionStats, now: number, dismissed?: Set<string>, error?: string }} input
 */
export function bandModelOf({ vm, s, now, dismissed, error = "" }) {
  const status = statusOf(vm, s, now);
  const { items, total } = visibleNeedsOf(vm, dismissed);
  let message = "";
  if (status.state === "absent") message = error ? `Can't read Mental: ${error}` : "Not linked here. Ask the agent to link this folder.";
  else if (status.state === "loading") message = "Reading the thread…";
  else if (vm?.linked) message = vm.resume || "No resume point yet. Park when you pause.";
  /** @type {{ text: string, tone: Tone } | null} */
  let second = null;
  if (status.state === "pressure") second = { text: `△ ${pressureReasonOf(s)}`, tone: "warn" };
  else if (status.state === "receipt" && s.receipt?.title) second = { text: `${s.receipt.glyph} ${s.receipt.label} › ${s.receipt.title}`, tone: status.tone };
  else if (status.state === "compacting") second = { text: "Compacting context. The resume point is safe in Mental.", tone: "accent" };
  else if (items.length) second = { text: `${items[0].label} · ${items[0].title}${total > 1 ? `  +${total - 1} more` : ""}`, tone: items[0].tone };
  return { status, message, needs: total, hideable: items.length > 0, second, working: s.working };
}

/**
 * The pane, as data every surface draws: the resume point and what needs you
 * above the fold, then this session, the clock and ways to read more.
 * @param {{ vm: any, s: SessionStats, now: number, error?: string, updatedAt?: number | null }} input
 */
export function paneModelOf({ vm, s, now, error = "", updatedAt = null }) {
  const status = statusOf(vm, s, now);
  const linked = !!vm?.linked;
  const ago = (ms) => (ageOf(ms) === "now" ? "just now" : `${ageOf(ms)} ago`);
  const header = {
    title: linked ? vm.id : "Mental",
    status,
    meta: linked ? [vm.branch && `⎇ ${vm.branch}`, vm.dirty ? plural(vm.changed, "change") : vm.branch ? "clean" : ""].filter(Boolean).join(" · ") : "",
    error,
  };
  const updated = updatedAt == null ? "" : `Updated ${ago(now - updatedAt)}`;
  if (!linked) {
    return {
      linked: false,
      header,
      message: error ? "Mental couldn't be read here." : vm ? "This folder isn't linked to a Mental project." : "Reading the thread…",
      hint: !error && vm ? "Run `mental link`, or park once, to start keeping its thread." : "",
      updated,
    };
  }
  const resume = vm.resume
    ? { text: vm.resume, detail: [vm.outcome, vm.handoffAge != null ? ago(vm.handoffAge) : "", vm.via && `via ${vm.via}`].filter(Boolean).join(" · ") }
    : null;
  const pressure = status.state === "pressure" ? pressureReasonOf(s) : "";
  const ctx = s.context?.percent;
  const active = s.turns > 0 || s.files.size > 0 || s.working;
  const session = active
    ? [
        `Started ${ago(now - s.startedAt)}`,
        plural(s.turns + (s.working ? 1 : 0), "turn"),
        s.files.size ? `${plural(s.files.size, "file")} edited` : "",
        ctx != null ? `context ${Math.round(ctx)}%` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const activity = s.log
    .slice(-3)
    .reverse()
    .map((r) => ({ text: `${r.glyph} ${r.label}${r.title ? ` · ${r.title}` : ""}`, age: ageOf(now - r.at), tone: /** @type {Tone} */ (RECEIPT_TONE[r.tone] || "accent") }));
  return {
    linked: true,
    header,
    resume,
    pressure,
    // Near the context limit the way out is a hand-off; otherwise a park.
    primary: ctx != null && ctx >= PRESSURE_CONTEXT_PCT ? "handoff" : "park",
    needs: needsOf(vm),
    session,
    activity,
    time: timeModelOf(vm.track, now),
    handoffFile: vm.handoffFile || "",
    updated,
  };
}

/** @param {any} t the view model's `track`, or null when tracking is off */
function timeModelOf(t, now) {
  if (!t) return null;
  const running = t.runningCount > 0;
  const notes = [];
  if (t.runningCount > 1) notes.push(`${t.runningCount} clocks running`);
  if (t.stale) notes.push("No activity for a while. Stop it and it closes at now.");
  if (!running && t.unclocked) notes.push("You worked here today without a clock. Mental won't guess the hours.");
  let line = "◷ No clock running";
  if (running) line = t.startedAt != null ? `◷ Clock running · ${clockOf(now - t.startedAt)}` : "◷ Clock running";
  return { running, line, tone: /** @type {Tone} */ (t.stale ? "warn" : running ? "ok" : "muted"), notes };
}

/**
 * Markdown as plain lines for a host without `Markdown`: headings bold,
 * bullets dotted, inline marks dropped, blank runs collapsed.
 * @param {string} body
 * @returns {{ text: string, bold?: boolean, dim?: boolean }[]}
 */
export function markdownLines(body) {
  const out = [];
  let fence = false;
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push({ text: `  ${line}`, dim: true });
      continue;
    }
    if (!line.trim()) {
      if (out.length && out[out.length - 1].text !== "") out.push({ text: "" });
      continue;
    }
    const head = line.match(/^#{1,6}\s+(.*)$/);
    const clean = (t) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    if (head) {
      if (out.length && out[out.length - 1].text !== "") out.push({ text: "" });
      out.push({ text: clean(head[1]), bold: true });
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    out.push({ text: bullet ? `${bullet[1]}• ${clean(bullet[2])}` : clean(line) });
  }
  while (out.length && out[out.length - 1].text === "") out.pop();
  return out.slice(0, 200);
}
