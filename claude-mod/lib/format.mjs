/**
 * Pure text helpers for the Claude Code panel. No Node APIs: the mod runtime
 * only has web globals, and tests import these under `node --test`.
 */

export const ELLIPSIS = "…";
export const DIAL = ["○", "◔", "◑", "◕", "●"];
export const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

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

/** @param {number | null | undefined} pct */
export function dialOf(pct) {
  if (pct == null || !Number.isFinite(pct)) return DIAL[0];
  const p = Math.min(100, Math.max(0, pct));
  return DIAL[Math.min(DIAL.length - 1, Math.floor(p / 25))];
}

/**
 * @param {number | null | undefined} pct
 * @param {number} width
 */
export function barOf(pct, width) {
  const w = Math.max(1, Math.floor(width));
  const p = pct == null || !Number.isFinite(pct) ? 0 : Math.min(100, Math.max(0, pct));
  const full = Math.round((p / 100) * w);
  return `${"━".repeat(full)}${"┄".repeat(w - full)}`;
}

/**
 * @param {readonly number[]} values
 * @param {number} width
 */
export function sparklineOf(values, width) {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";
  const tail = values.slice(-w);
  if (tail.length === 0) return "";
  const max = Math.max(...tail);
  if (max <= 0) return SPARK[0].repeat(tail.length);
  return tail
    .map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((Math.max(0, v) / max) * (SPARK.length - 1)))])
    .join("");
}

/**
 * @param {string} path
 * @param {string | null | undefined} cwd
 */
export function relPathOf(path, cwd) {
  const p = String(path || "").replace(/\\/g, "/");
  const base = String(cwd || "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (base && p.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return p.slice(base.length + 1);
  return p;
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
 * Drop the lowest-priority segments until the strip fits `columns`
 * (segments joined by `sep`). Display order is kept.
 * @template {{ text: string, priority?: number }} T
 * @param {readonly T[]} segments
 * @param {number} columns
 * @param {string} [sep]
 * @returns {T[]}
 */
export function fitSegments(segments, columns, sep = "  ") {
  const kept = segments.filter((s) => s && s.text);
  const width = () => kept.reduce((n, s) => n + s.text.length, 0) + Math.max(0, kept.length - 1) * sep.length;
  while (kept.length > 1 && width() > columns) {
    let drop = 0;
    for (let i = 1; i < kept.length; i++) {
      if ((kept[i].priority ?? 0) <= (kept[drop].priority ?? 0)) drop = i;
    }
    kept.splice(drop, 1);
  }
  return kept;
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
