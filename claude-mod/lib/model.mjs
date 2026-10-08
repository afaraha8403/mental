/**
 * Pure view model for the Claude Code panel: heartbeat → what to show, the
 * band state picker, and receipt parsing from tool calls. No Node APIs.
 */

import { handoffMsOf, msOf, oneLine } from "./format.mjs";

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
    editsThisTurn: 0,
    perTurn: [],
    files: new Map(),
    edits: 0,
    context: null,
    compacting: false,
    working: false,
    receipt: null,
  };
}

/**
 * @typedef {{
 *   startedAt: number,
 *   turns: number,
 *   editsThisTurn: number,
 *   perTurn: number[],
 *   files: Map<string, number>,
 *   edits: number,
 *   context: { percent: number | null, tokens: number | null, window: number | null } | null,
 *   compacting: boolean,
 *   working: boolean,
 *   receipt: Receipt | null,
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
  s.editsThisTurn += 1;
  s.files.set(path, (s.files.get(path) || 0) + 1);
}

/** @param {SessionStats} s */
export function noteTurnComplete(s) {
  s.turns += 1;
  s.perTurn.push(s.editsThisTurn);
  if (s.perTurn.length > 48) s.perTurn.splice(0, s.perTurn.length - 48);
  s.editsThisTurn = 0;
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
 * @param {SessionStats} s
 * @param {number} limit
 * @returns {{ path: string, count: number }[]}
 */
export function topFiles(s, limit) {
  return [...s.files.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit);
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
  const cmd = String(call?.command || "");
  const m =
    /(?:^|[\s;&|(])(?:npx\s+(?:-y\s+)?)?(?:@balacode\/)?mental(?:\.cmd)?\s+([a-z][a-z-]*)/i.exec(cmd) ||
    /(?:^|[\s;&|(])node\s+\S*bin[\\/]cli\.mjs\s+([a-z][a-z-]*)/i.exec(cmd);
  return m ? m[1].toLowerCase() : null;
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
 * @param {{ text?: string, isError?: boolean } | undefined} result
 * @param {number} now
 * @returns {Receipt | null}
 */
export function receiptOf(command, result, now) {
  if (!command || !RECEIPT_KINDS[command]) return null;
  if (!result || result.isError) return null;
  const text = typeof result.text === "string" ? result.text : "";
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
    handoffAt,
    handoffAge: handoffAt == null ? null : Math.max(0, now - handoffAt),
    attention: Array.isArray(d.attention) ? d.attention : [],
    attentionCount: Number(d.attentionCount) || 0,
    decisions: Array.isArray(d.openDecisions) ? d.openDecisions : [],
    decisionCount: Number(d.openDecisionCount) || 0,
    needsEyes: Array.isArray(d.needsEyes) ? d.needsEyes : [],
    needsEyesCount: Number(d.needsEyesCount) || 0,
    guardrails: Array.isArray(d.guardrails) ? d.guardrails : [],
    guardrailCount: Number(d.guardrailCount) || 0,
    hopsToday: Number(d.hopsToday) || 0,
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
