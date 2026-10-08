/**
 * Shared paging + date-window flags for `list` and `search`.
 * Default page stays 50 so existing callers see the same shape.
 */

export const DEFAULT_PAGE_LIMIT = 50;

/**
 * @param {unknown} raw
 * @param {string} name
 * @param {number} min
 * @returns {{ ok: true, value: number } | { ok: false, message: string }}
 */
function parseInt0(raw, name, min) {
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return { ok: false, message: `--${name} must be a non-negative integer` };
  const n = Number(s);
  if (n < min) return { ok: false, message: `--${name} must be >= ${min}` };
  return { ok: true, value: n };
}

/**
 * @param {Record<string, unknown> | undefined} flags
 * @returns {{ ok: true, limit: number, offset: number, all: boolean } | { ok: false, message: string }}
 */
export function parsePaging(flags = {}) {
  const all = flags.all === true;
  let limit = DEFAULT_PAGE_LIMIT;
  let offset = 0;
  if (flags.limit != null && flags.limit !== true) {
    const p = parseInt0(flags.limit, "limit", 1);
    if (!p.ok) return p;
    limit = p.value;
  }
  if (flags.offset != null && flags.offset !== true) {
    const p = parseInt0(flags.offset, "offset", 0);
    if (!p.ok) return p;
    offset = p.value;
  }
  if (all && (flags.limit != null || flags.offset != null)) {
    return { ok: false, message: "--all cannot be combined with --limit or --offset" };
  }
  return { ok: true, limit: all ? Infinity : limit, offset, all };
}

/**
 * Page envelope fields. `limit` is null for --all.
 * @param {{ total: number, offset: number, limit: number, returned: number }} p
 */
export function pageMeta({ total, offset, limit, returned }) {
  const end = offset + returned;
  const truncated = end < total;
  return {
    total,
    offset,
    limit: Number.isFinite(limit) ? limit : null,
    returned,
    truncated,
    nextOffset: truncated ? end : null,
  };
}

/**
 * Local day bounds for YYYY-MM-DD, or an instant for a full ISO timestamp.
 * @param {string} raw
 * @returns {{ startMs: number, endMs: number | null } | null}
 */
export function parseDateBound(raw) {
  const s = String(raw).trim();
  const day = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const y = Number(day[1]);
    const m = Number(day[2]);
    const d = Number(day[3]);
    const start = new Date(y, m - 1, d);
    if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) return null;
    return { startMs: start.getTime(), endMs: new Date(y, m - 1, d + 1).getTime() };
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return { startMs: t, endMs: null };
}

/**
 * @param {Record<string, unknown> | undefined} flags
 * @returns {{ ok: true, sinceMs?: number, untilMs?: number, since?: string, on?: string } | { ok: false, message: string }}
 */
export function parseDateWindow(flags = {}) {
  /** @type {{ ok: true, sinceMs?: number, untilMs?: number, since?: string, on?: string }} */
  const out = { ok: true };
  if (typeof flags.since === "string") {
    const b = parseDateBound(flags.since);
    if (!b) return { ok: false, message: "--since must be YYYY-MM-DD or an ISO timestamp" };
    out.sinceMs = b.startMs;
    out.since = flags.since;
  }
  if (typeof flags.on === "string") {
    const b = parseDateBound(flags.on);
    if (!b || b.endMs == null) return { ok: false, message: "--on must be YYYY-MM-DD" };
    out.sinceMs = Math.max(out.sinceMs ?? b.startMs, b.startMs);
    out.untilMs = b.endMs;
    out.on = flags.on;
  }
  return out;
}

/**
 * Concept time: frontmatter timestamp, else mtime.
 * @param {{ timestamp?: string, mtime?: number }} c
 */
export function itemTimeMs(c) {
  if (c.timestamp) {
    const t = Date.parse(c.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  return c.mtime ?? 0;
}

/**
 * @template {{ timestamp?: string, mtime?: number }} T
 * @param {T[]} items
 * @param {{ sinceMs?: number, untilMs?: number }} win
 * @returns {T[]}
 */
export function filterByWindow(items, win) {
  if (win.sinceMs == null && win.untilMs == null) return items;
  return items.filter((c) => {
    const t = itemTimeMs(c);
    if (win.sinceMs != null && t < win.sinceMs) return false;
    if (win.untilMs != null && t >= win.untilMs) return false;
    return true;
  });
}

/**
 * ISO strings for output rows.
 * @param {{ timestamp?: string, mtime?: number }} c
 */
export function timeFields(c) {
  const t = itemTimeMs(c);
  return {
    timestamp: c.timestamp || "",
    updated: t ? new Date(t).toISOString() : "",
  };
}
