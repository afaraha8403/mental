/** Shared DOM, data, and formatting helpers for the dashboard. No dependencies. */

/** Same marks as CLI `kindMark` (journal, attention, decision, note). */
export const KIND = {
  Decision: { emoji: "🎯", label: "Decision", plural: "Decisions", color: "#38bdf8" },
  Attention: { emoji: "🚦", label: "Attention", plural: "Attention", color: "#f59e0b" },
  Note: { emoji: "📝", label: "Note", plural: "Notes", color: "#10b981" },
  Journal: { emoji: "📓", label: "Journal", plural: "Journals", color: "#a855f7" },
};

export const TYPES = ["Decision", "Attention", "Note", "Journal"];

/**
 * Tiny element builder. `h("div.card#x", { onclick, dataset, ... }, ...children)`.
 * Strings become text nodes (never HTML).
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param  {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const [, name = "div", rest = ""] = /^([a-z0-9-]*)(.*)$/i.exec(tag) || [];
  const el = document.createElement(name || "div");
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key === "style" && typeof value === "object") {
        for (const [prop, v] of Object.entries(value)) {
          if (prop.startsWith("--")) el.style.setProperty(prop, v);
          else el.style[prop] = v;
        }
      }
      else if (key === "class") el.className = `${el.className} ${value}`.trim();
      else if (key === "html") el.innerHTML = value;
      else if (key in el && typeof value !== "string") el[key] = value;
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Null-safe `replaceChildren`: skips null/false and flattens arrays like `h()`. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** @param {string} sel */
export const $ = (sel, root = document) => root.querySelector(sel);
/** @param {string} sel */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** @param {string} path */
export async function api(path) {
  try {
    const res = await fetch(path, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return { status: 0, body: { ok: false, error: { code: "offline", message: "Dashboard server is not reachable." } } };
  }
}

/** Type chip with emoji mark. */
export function kindChip(type, { compact = false } = {}) {
  const spec = KIND[type];
  if (!spec) return h("span.chip", null, type || "");
  return h(
    `span.chip.chip-kind.kind-${type.toLowerCase()}`,
    { title: spec.label },
    h("span.mark", { "aria-hidden": "true" }, spec.emoji),
    compact ? null : spec.label,
  );
}

export function statusChip(status) {
  if (!status) return null;
  return h(`span.chip.chip-status.status-${String(status).toLowerCase().replace(/[^a-z0-9-]/g, "")}`, null, status);
}

export function tagChip(tag, onClick) {
  return h(onClick ? "button.chip.chip-tag" : "span.chip.chip-tag", { type: onClick ? "button" : null, onclick: onClick }, `#${tag}`);
}

/** Parse `YYYY-MM-DD` from a store path like `decisions/2026-09-21-foo.md`. */
export function pathDate(path) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(String(path || ""));
  return m ? m[1] : "";
}

/** @param {string} value ISO instant or YYYY-MM-DD */
export function toDate(value) {
  if (!value) return null;
  const text = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

const RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" }) : null;

/** "3m ago", "yesterday", "2 wk. ago". */
export function relTime(value, now = Date.now()) {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return "";
  const sec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return "just now";
  const steps = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [86400 * 7, "day", 86400],
    [86400 * 30, "week", 86400 * 7],
    [86400 * 365, "month", 86400 * 30],
    [Infinity, "year", 86400 * 365],
  ];
  for (const [limit, unit, div] of steps) {
    if (abs < limit) {
      const n = Math.round(sec / div);
      return RTF ? RTF.format(n, unit) : `${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? "" : "s"} ${n < 0 ? "ago" : "from now"}`;
    }
  }
  return "";
}

/** Whole days since a date (0 = today). */
export function ageDays(value, now = Date.now()) {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return null;
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** "Today", "Yesterday", "Mon, Sep 21". */
export function dayLabel(ymd) {
  const age = ageDays(ymd);
  if (age === 0) return "Today";
  if (age === 1) return "Yesterday";
  const d = toDate(ymd);
  if (!d) return ymd;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export function clockTime(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
}

export function formatWhen(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

/** Skeleton placeholder rows. */
export function skeleton(rows = 3, cls = "") {
  return h(
    `div.skeleton-stack${cls ? `.${cls}` : ""}`,
    { "aria-hidden": "true" },
    Array.from({ length: rows }, (_, i) => h("div.skeleton", { style: { width: `${92 - ((i * 17) % 40)}%` } })),
  );
}

/**
 * Empty state with a CLI command to run.
 * @param {{ icon?: string, title: string, body?: string, cmd?: string }} spec
 */
export function emptyState({ icon = "✨", title, body = "", cmd = "" }) {
  return h(
    "div.empty",
    null,
    h("div.empty-icon", { "aria-hidden": "true" }, icon),
    h("p.empty-title", null, title),
    body ? h("p.empty-body", null, body) : null,
    cmd ? copyable(cmd, "code.empty-cmd") : null,
  );
}

/** Inline code that copies itself on click. */
export function copyable(text, tag = "code.copyable") {
  return h(
    tag,
    {
      tabindex: "0",
      role: "button",
      title: "Copy",
      onclick: () => copyText(text),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copyText(text);
        }
      },
    },
    text,
  );
}

let toastTimer = 0;
export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1600);
}

export async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} ✓`);
  } catch {
    toast("Copy failed — clipboard blocked");
  }
}

/** Debounce helper. */
export function debounce(fn, ms = 160) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

/**
 * Subsequence fuzzy score; higher is better, -1 means no match.
 * Rewards word starts and contiguous runs.
 */
export function fuzzyScore(query, text) {
  const q = String(query || "").toLowerCase().trim();
  const t = String(text || "").toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 || /\W/.test(t[direct - 1]) ? 200 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    run = found === ti ? run + 1 : 0;
    score += 10 + run * 5 + (found === 0 || /\W/.test(t[found - 1]) ? 15 : 0) - Math.min(found - ti, 10);
    ti = found + 1;
  }
  return score;
}

/** Tag slugs from a list item / graph node. */
export function tagsOf(node) {
  const raw = Array.isArray(node?.tags) ? node.tags : node?.tags ? [node.tags] : [];
  return [...new Set(raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
}

/** Count badge (hidden when zero). */
export function badge(n, cls = "") {
  return h(`span.badge${cls ? `.${cls}` : ""}`, { hidden: !n }, n > 99 ? "99+" : String(n || 0));
}

/** SVG icon set (stroke icons, 24 viewBox). */
const ICONS = {
  today: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  attention: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 13V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  library: '<path d="M4 19V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14"/><path d="M10 19V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11"/><path d="m15.5 7.8 3-.8a1 1 0 0 1 1.2.7l2.6 10a1 1 0 0 1-.7 1.2l-3 .8"/><path d="M3 19.5h18"/>',
  decisions: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  map: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="12" cy="11" r="1.6"/><path d="m7.8 7 3 2.8M16.2 8l-3 2.2M12 12.6v3.2"/>',
  sitdowns: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/>',
  projects: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z"/><path d="M12 14v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11.5 7.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

export function icon(name, size = 18) {
  const span = document.createElement("span");
  span.className = `icon icon-${name}`;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span;
}
