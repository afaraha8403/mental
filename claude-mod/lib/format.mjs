/**
 * Pure text helpers for the Claude Code panel. No Node APIs: the mod runtime
 * only has web globals, and tests import these under `node --test`.
 */

export const ELLIPSIS = "…";

/** @param {unknown} value */
export function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {unknown} value
 * @param {number} width
 */
export function clip(value, width) {
  const text = oneLine(value);
  const max = Math.max(0, Math.floor(width));
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1).trimEnd()}${ELLIPSIS}`;
}

/** @param {number} ms */
export function ageOf(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** @param {number} ms */
export function clockOf(ms) {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Local wall time of a handoff (`when.date` + `when.time`, no zone).
 * @param {{ when?: { date?: string, time?: string } } | null | undefined} handoff
 * @returns {number | null}
 */
export function handoffMsOf(handoff) {
  const date = handoff?.when?.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rawTime = handoff?.when?.time || "";
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : "00:00";
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const ms = new Date(y, mo - 1, d, h, mi).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** @param {unknown} value */
export function msOf(value) {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Greedy word wrap to at most `maxLines` lines (last line clipped).
 * @param {unknown} value
 * @param {number} width
 * @param {number} [maxLines]
 */
export function wrapLines(value, width, maxLines = Infinity) {
  const w = Math.max(4, Math.floor(width));
  const words = oneLine(value).split(" ").filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = line ? `${line} ${word}` : word;
    if (next.length <= w) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > w ? word.slice(0, w) : word;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const joined = lines.join(" ");
  if (lines.length && joined.length < oneLine(value).length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length + 1 <= w ? `${last}${ELLIPSIS}` : `${last.slice(0, w - 1)}${ELLIPSIS}`;
  }
  return lines;
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} [many]
 */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

/**
 * The text of a tool result: a string, or the first string field of an
 * object (`stdout`, `text`, …), else its JSON.
 * @param {unknown} v
 */
export function textOf(v) {
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

/** Characters of `size`px text that fit in `px` (rough; no font metrics here). */
export function fitChars(px, size, mono = false) {
  return Math.max(4, Math.floor(px / (size * (mono ? 0.61 : 0.55))));
}
