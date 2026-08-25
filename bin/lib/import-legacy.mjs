/**
 * Ingest leftover Balakit `./.mental` into the home UUID slice.
 *
 * Not a raw copy: files are classified onto canonical OKF paths and
 * frontmatter is normalized (`type`, `title`, `status`, `timestamp`, `tags`).
 * Source is never deleted. Dest files that already exist are not overwritten.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseFrontmatter, slugify, stringifyFrontmatter } from "./okf.mjs";

/** Written by `mental local`. Leftover Balakit bundles do not have this. */
export const LOCAL_STORE_MARKER = ".mental-local";

const SKIP_NAMES = new Set([LOCAL_STORE_MARKER, ".DS_Store"]);
const SKIP_DIR_NAMES = new Set(["status"]);

const DEFAULT_STATUS = {
  Note: "active",
  Journal: "active",
  Decision: "decided",
  Attention: "open",
  Status: "active",
};

/**
 * @param {string} dir absolute path to a `.mental` directory
 */
export function isOptedInLocal(dir) {
  return existsSync(join(dir, LOCAL_STORE_MARKER));
}

/**
 * Mark `./.mental` as the explicit project-local store (`mental local`).
 * @param {string} dir
 */
export function markOptedInLocal(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LOCAL_STORE_MARKER), "local\n");
}

/**
 * @param {string} rel posix relative path from leftover root
 * @returns {{ dest: string, type: string } | null}
 */
export function classifyLegacyPath(rel) {
  const posix = rel.split("\\").join("/");
  const top = posix.split("/")[0];
  if (SKIP_NAMES.has(top) || SKIP_DIR_NAMES.has(top)) return null;
  if (!posix.endsWith(".md")) return null;
  if (posix === "index.md") return { dest: "index.md", type: "Status" };
  if (posix.startsWith("notes/")) return { dest: posix, type: "Note" };
  if (posix.startsWith("decisions/")) return { dest: posix, type: "Decision" };
  if (posix.startsWith("attention/")) return { dest: posix, type: "Attention" };
  if (posix.startsWith("journal/")) return { dest: posix, type: "Journal" };
  if (posix === "journal.md") return { dest: "journal/imported-root.md", type: "Journal" };
  if (!posix.includes("/")) return { dest: `notes/${posix}`, type: "Note" };
  return { dest: posix, type: "Note" };
}

function titleFrom(data, body, dest) {
  if (data.title) return String(data.title);
  const h = body.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  const base = dest.split("/").pop() || dest;
  return slugify(base.replace(/\.md$/, "")).replace(/-/g, " ");
}

/**
 * @param {string} type
 * @param {Record<string, string | string[]>} data
 * @param {string} body
 * @param {string} dest
 * @param {Date} now
 */
export function normalizeLegacyMarkdown(type, data, body, dest, now = new Date()) {
  const title = titleFrom(data, body, dest);
  /** @type {Record<string, string | string[] | undefined>} */
  const next = {
    type,
    title,
    description: data.description ? String(data.description) : title,
    tags: Array.isArray(data.tags)
      ? data.tags
      : data.tags
        ? [String(data.tags)]
        : type === "Journal"
          ? ["journal"]
          : type === "Status"
            ? ["index"]
            : [],
    timestamp: data.timestamp ? String(data.timestamp) : now.toISOString(),
    status: String(data.status || DEFAULT_STATUS[type] || "active"),
  };
  for (const [k, v] of Object.entries(data)) {
    if (next[k] == null && v != null) next[k] = v;
  }
  return stringifyFrontmatter(next, body);
}

/**
 * @param {string} src leftover bundle directory
 * @param {string} dest `~/.mental/projects/<uuid>`
 * @param {{ now?: Date }} [opts]
 * @returns {{ from: string, to: string, copied: string[], skipped: number }}
 */
export function importLegacyBundle(src, dest, { now = new Date() } = {}) {
  const from = resolve(src);
  const to = resolve(dest);
  if (from === to) return { from, to, copied: [], skipped: 0 };
  mkdirSync(to, { recursive: true });
  const files = listMd(from);
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  /** @type {string[]} */
  const copied = [];
  let skipped = 0;
  const claimed = new Set();
  for (const rel of files) {
    const classified = classifyLegacyPath(rel);
    if (!classified) continue;
    if (claimed.has(classified.dest) || existsSync(join(to, classified.dest))) {
      skipped += 1;
      continue;
    }
    const text = readFileSync(join(from, rel), "utf8");
    const { data, body } = parseFrontmatter(text);
    const type = String(data.type || classified.type);
    const markdown = normalizeLegacyMarkdown(type, data, body, classified.dest, now);
    const destFile = join(to, classified.dest);
    mkdirSync(dirname(destFile), { recursive: true });
    writeFileSync(destFile, markdown);
    copied.push(classified.dest);
    claimed.add(classified.dest);
  }
  return { from, to, copied, skipped };
}

function rank(rel) {
  const p = rel.split("\\").join("/");
  if (p.startsWith("notes/")) return 0;
  if (p.startsWith("decisions/")) return 1;
  if (p.startsWith("attention/")) return 2;
  if (p.startsWith("journal/")) return 3;
  if (p === "index.md") return 4;
  return 4;
}

/**
 * @param {string} dir
 * @returns {string[]} posix relative paths
 */
function listMd(dir) {
  /** @type {string[]} */
  const out = [];
  walk(dir, dir, out);
  return out;
}

function walk(base, dir, out) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const abs = join(dir, name);
    const rel = relative(base, abs).split("\\").join("/");
    const top = rel.split("/")[0];
    if (SKIP_NAMES.has(name) || SKIP_NAMES.has(top) || SKIP_DIR_NAMES.has(top)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(base, abs, out);
      continue;
    }
    if (name.endsWith(".md")) out.push(rel);
  }
}
