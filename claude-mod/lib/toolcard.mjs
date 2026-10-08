/**
 * Inline chat rows: what a `mental …` shell call looks like in the transcript.
 * Pure parsing, so tests can check it without the engine; the drawing is
 * `toolCardSvg` in desktop.mjs.
 */

import { RECEIPT_KINDS, mentalCommandOf, receiptTitleOf } from "./model.mjs";
import { oneLine } from "./format.mjs";

const PLAIN = {
  heartbeat: "Read the thread",
  where: "Looked up the thread",
  resume: "Picked up the resume point",
  doctor: "Checked the setup",
  dashboard: "Dashboard",
};

/** @param {unknown} v */
function textOf(v) {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "";
  const o = /** @type {any} */ (v);
  for (const k of ["stdout", "text", "output", "content", "result"]) {
    if (typeof o[k] === "string") return o[k];
  }
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/** The shell command string out of a ToolUse `input` (an object, a string, or JSON text). */
export function commandOfInput(input) {
  if (typeof input === "string") {
    const t = input.trim();
    if (t.startsWith("{")) {
      try {
        return commandOfInput(JSON.parse(t));
      } catch {
        /* plain text */
      }
    }
    return t;
  }
  if (input && typeof input === "object") {
    const o = /** @type {any} */ (input);
    for (const k of ["command", "cmd", "script"]) if (typeof o[k] === "string") return o[k];
  }
  return "";
}

/** @param {string} text */
function envelopeOf(text) {
  const at = text.indexOf("{");
  if (at < 0) return null;
  try {
    const body = JSON.parse(text.slice(at));
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

/**
 * A card model for a ToolUse of Mental, or null when the row is anything else.
 * @param {{ input?: unknown, output?: unknown }} props
 * @returns {{ command: string, kind: string, tone: string, title: string, detail: string, state: "running" | "done" | "failed" } | null}
 */
export function toolCardOf(props) {
  const raw = commandOfInput(props?.input);
  const command = mentalCommandOf({ tool: "Bash", command: raw });
  if (!command) return null;
  const out = textOf(props?.output);
  const env = envelopeOf(out);
  const data = env && env.data && typeof env.data === "object" ? env.data : env || {};
  const spec = RECEIPT_KINDS[/** @type {keyof typeof RECEIPT_KINDS} */ (command)];
  const kind = spec?.label || PLAIN[command] || `mental ${command}`;
  const tone = spec?.tone || "violet";
  if (!out.trim()) return { command, kind, tone, title: "Working…", detail: "", state: "running" };
  if (env?.ok === false || (!env && /\b(error|failed|usage)\b/i.test(out) && out.length < 400)) {
    const msg = env?.error?.message || env?.error || env?.message || out;
    return { command, kind: "Mental", tone: "rose", title: "That did not go through", detail: oneLine(String(msg)), state: "failed" };
  }
  let title = receiptTitleOf(out);
  let detail = "";
  if (command === "heartbeat" || command === "where") {
    const hand = data.handoff;
    title = oneLine(hand?.resume || "") || "No resume point yet";
    const bits = [];
    const att = Number(data.attentionCount) || 0;
    const dec = Number(data.openDecisionCount) || 0;
    if (att) bits.push(`${att} open ${att === 1 ? "thread" : "threads"}`);
    if (dec) bits.push(`${dec} ${dec === 1 ? "decision" : "decisions"}`);
    if (data.git?.branch) bits.push(String(data.git.branch));
    detail = bits.join("  ·  ");
  } else if (!title) {
    title = spec ? `${spec.label} in Mental` : `mental ${command} done`;
  }
  return { command, kind, tone, title, detail, state: "done" };
}
