/**
 * Stale knowledge: mark a note or decision as superseded (replaced by a newer file) or obsolete (no
 * longer applies). Only frontmatter changes (`status`, `superseded_by`); the body, the timestamp and
 * the file itself stay, so history is never lost. Journals are append-only history and are never marked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { applyLinks } from "./jev-assist.mjs";
import { readBundleFile } from "./okf.mjs";

export const STALE_STATUSES = new Set(["superseded", "obsolete"]);
const MARKABLE = /^(notes|decisions)\/[^/]+\.md$/;

/** @param {unknown} status */
export function isStale(status) {
  return STALE_STATUSES.has(String(status || ""));
}

/**
 * Normalise a user-supplied path to `notes/x.md` or `decisions/x.md`.
 * @param {string} raw
 */
export function markablePath(raw) {
  const p = String(raw || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  const withExt = p.endsWith(".md") ? p : `${p}.md`;
  return MARKABLE.test(withExt) ? withExt : null;
}

/**
 * Set (string), remove (null) or leave (undefined) frontmatter keys, touching nothing else.
 * @param {string} abs
 * @param {Record<string, string | null | undefined>} edits
 */
function editFrontmatter(abs, edits) {
  const text = readFileSync(abs, "utf8");
  const m = text.match(/^---(\r?\n)([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!m) return false;
  const nl = m[1];
  const lines = m[2].split(/\r?\n/);
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (value === null) {
      if (at >= 0) lines.splice(at, 1);
    } else if (at >= 0) {
      lines[at] = `${key}: ${value}`;
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  writeFileSync(abs, `---${nl}${lines.join(nl)}${nl}---${text.slice(m[0].length)}`);
  return true;
}

/** @param {string} root @param {string} raw */
function load(root, raw) {
  const rel = markablePath(raw);
  if (!rel) {
    return { ok: false, error: { code: "usage", message: `${raw}: only notes/ and decisions/ files can be marked (journals stay as history)` } };
  }
  const got = readBundleFile(root, rel);
  if (!got.ok) return got;
  const type = String(got.data.data.type || "");
  return { ok: true, rel, abs: got.data.abs, data: got.data.data, type, title: String(got.data.data.title || rel) };
}

/**
 * Mark `path` superseded by `by`, obsolete, or (restore) active again.
 * @param {string} root
 * @param {string} path
 * @param {{ status?: "superseded" | "obsolete", by?: string, restore?: boolean }} opts
 * @returns {{ ok: true, path: string, status: string, previous: string, supersededBy?: string, changed: boolean }
 *   | { ok: false, error: { code: string, message: string } }}
 */
export function markStale(root, path, { status, by, restore = false } = {}) {
  const old = load(root, path);
  if (!old.ok) return old;
  const previous = String(old.data.status || (old.type === "Decision" ? "" : "active"));

  if (restore) {
    const next = old.type === "Decision" ? "decided" : "active";
    if (!isStale(previous)) return { ok: true, path: old.rel, status: previous, previous, changed: false };
    editFrontmatter(old.abs, { status: next, superseded_by: null });
    return { ok: true, path: old.rel, status: next, previous, changed: true };
  }

  let target = null;
  if (by) {
    target = load(root, by);
    if (!target.ok) return target;
    if (target.rel === old.rel) {
      return { ok: false, error: { code: "usage", message: "a file cannot supersede itself" } };
    }
    if (isStale(target.data.status)) {
      return { ok: false, error: { code: "usage", message: `${target.rel} is itself ${target.data.status}; point at the current file instead` } };
    }
  }
  const next = status === "obsolete" && !target ? "obsolete" : status || "superseded";
  if (next === "superseded" && !target) {
    return { ok: false, error: { code: "usage", message: "superseded needs the replacing file (--by <path>)" } };
  }
  const same = previous === next && (target ? String(old.data.superseded_by || "") === target.rel : true);
  if (same) return { ok: true, path: old.rel, status: next, previous, supersededBy: target?.rel, changed: false };
  editFrontmatter(old.abs, { status: next, superseded_by: target ? target.rel : undefined });
  if (target) {
    applyLinks(target.abs, [{ path: old.rel, title: old.title, label: "supersedes" }]);
  }
  return { ok: true, path: old.rel, status: next, previous, supersededBy: target?.rel, changed: true };
}

/**
 * `superseded_by` pointers for stale search hits. Cheap: only stale rows are read.
 * @param {string} root
 * @param {Array<{ path: string, status: string }>} hits
 * @returns {Map<string, string>}
 */
export function supersededByMap(root, hits) {
  const out = new Map();
  for (const h of hits) {
    if (!isStale(h.status) || !MARKABLE.test(h.path)) continue;
    const got = readBundleFile(root, h.path);
    if (!got.ok) continue;
    const by = got.data.data.superseded_by;
    if (typeof by === "string" && by) out.set(h.path, by);
  }
  return out;
}
