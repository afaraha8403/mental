/**
 * Derived SQLite index for an OKF bundle.
 * Markdown remains SoT. Deleting the db must not lose knowledge.
 *
 * Path: ${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { parseFrontmatter } from "./okf.mjs";

const require = createRequire(import.meta.url);
/** Bump when the concepts table shape changes; mismatch drops and recreates. */
export const INDEX_VERSION = "3";

const SNIPPET_CHARS = 160;

/**
 * @param {string} home
 * @param {string} id
 * @param {NodeJS.ProcessEnv} [env]
 */
export function indexPath(home, id, env = process.env) {
  const xdg = env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.trim() ? env.XDG_CACHE_HOME : join(home, ".cache");
  return join(xdg, "mental", `${id}.sqlite`);
}

function loadDatabaseSync() {
  try {
    const mod = require("node:sqlite");
    return mod.DatabaseSync ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {Array<{ type: string, status: string, tags: string[], kind?: string }>} items
 * @param {{ type?: string, status?: string, tag?: string, kind?: string }} [filters]
 */
export function filterConcepts(items, { type, status, tag, kind } = {}) {
  let out = items;
  if (type) out = out.filter((c) => c.type.toLowerCase() === String(type).toLowerCase());
  if (status) out = out.filter((c) => c.status === status);
  if (tag) out = out.filter((c) => c.tags.includes(String(tag)));
  if (kind) out = out.filter((c) => String(c.kind || "").toLowerCase() === String(kind).toLowerCase());
  return out;
}

/**
 * Bundle-relative dest for a markdown link. `./` and `../` resolve against
 * the source file; anything else is treated as already bundle-relative (OKF).
 * @param {string} src
 * @param {string} dest
 */
export function normalizeDest(src, dest) {
  let d = String(dest || "")
    .split("#")[0]
    .trim()
    .replace(/\\/g, "/");
  if (!d) return "";
  if (d.startsWith("/")) d = d.slice(1);
  if (d.startsWith("./") || d.startsWith("../")) {
    const srcDir = src.includes("/") ? src.slice(0, src.lastIndexOf("/")) : "";
    const segs = [...(srcDir ? srcDir.split("/") : []), ...d.split("/")];
    const parts = [];
    for (const s of segs) {
      if (s === "." || s === "") continue;
      if (s === "..") parts.pop();
      else parts.push(s);
    }
    d = parts.join("/");
  }
  if (d && !d.endsWith(".md")) d += ".md";
  return d;
}

/**
 * @param {string} root bundle directory
 * @returns {Array<{
 *   path: string,
 *   type: string,
 *   title: string,
 *   description: string,
 *   status: string,
 *   kind: string,
 *   from: string,
 *   against: string,
 *   tags: string[],
 *   mtime: number,
 *   body: string,
 *   searchable: string,
 *   abs: string,
 * }>}
 */
export function listConcepts(root) {
  /** @type {ReturnType<typeof listConcepts>} */
  const out = [];
  if (!existsSync(root)) return out;
  walk(root, root, out);
  return out;
}

/**
 * @param {string} base
 * @param {string} dir
 * @param {ReturnType<typeof listConcepts>} out
 */
function walk(base, dir, out) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || name === "status") continue;
    const abs = join(dir, name);
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
    if (!name.endsWith(".md")) continue;
    const rel = relative(base, abs).split("\\").join("/");
    if (rel === "index.md" || rel === "log.md") continue;
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(text);
    const type = String(data.type || inferType(rel));
    const title = String(data.title || rel.replace(/\.md$/, ""));
    const description = data.description ? String(data.description) : "";
    const searchable = [title, description, body].filter(Boolean).join("\n");
    out.push({
      path: rel,
      type,
      title,
      description,
      status: String(data.status || ""),
      kind: data.kind ? String(data.kind) : "",
      from: data.from ? String(data.from) : "",
      against: data.against ? String(data.against) : "",
      tags: Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? [String(data.tags)] : [],
      mtime: Math.floor(st.mtimeMs),
      body,
      searchable,
      abs,
    });
  }
}

function inferType(rel) {
  if (rel.startsWith("journal/")) return "Journal";
  if (rel.startsWith("decisions/")) return "Decision";
  if (rel.startsWith("notes/")) return "Note";
  if (rel.startsWith("attention/")) return "Attention";
  return "Note";
}

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/**
 * @param {string} src
 * @param {string} body
 * @returns {Array<{ src: string, dest: string, raw: string }>}
 */
export function extractLinks(src, body) {
  /** @type {Array<{ src: string, dest: string, raw: string }>} */
  const out = [];
  let m;
  const re = new RegExp(LINK_RE.source, "g");
  while ((m = re.exec(body))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("http:") || raw.startsWith("https:") || raw.startsWith("mailto:")) continue;
    const dest = normalizeDest(src, raw);
    if (!dest) continue;
    out.push({ src, dest, raw });
  }
  return out;
}

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS concepts (
    path TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    status TEXT,
    kind TEXT,
    from_val TEXT,
    against TEXT,
    tags_json TEXT,
    mtime INTEGER,
    body_text TEXT
  );
  CREATE TABLE IF NOT EXISTS links (
    src TEXT NOT NULL,
    dest TEXT NOT NULL,
    raw TEXT
  );
`;

const FTS_SQL = `CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(path, title, body_text);`;

/**
 * FTS5 is optional. Some Node `node:sqlite` builds ship without the module.
 * Concepts + links still index; search falls back to LIKE / file scan.
 * @param {import("node:sqlite").DatabaseSync} db
 */
function enableFts5(db) {
  try {
    db.exec(FTS_SQL);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @returns {boolean} whether FTS5 is available on this connection
 */
function ensureSchema(db) {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
  let version = "0";
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'version'").get();
    version = row?.value ? String(row.value) : "0";
  } catch {
    version = "0";
  }
  if (version !== INDEX_VERSION) {
    db.exec("DROP TABLE IF EXISTS concepts; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS concepts_fts;");
  }
  db.exec(SCHEMA_SQL);
  return enableFts5(db);
}

/**
 * @param {{ root: string, id: string, home: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: boolean, path: string | null, concepts: number, backend: "sqlite" | "none", fts5?: boolean, error?: string }}
 */
export function reindexBundle({ root, id, home, env = process.env }) {
  const file = indexPath(home, id, env);
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) {
    return { ok: false, path: file, concepts: 0, backend: "none", error: "node:sqlite unavailable" };
  }
  const concepts = listConcepts(root);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    const fts5 = ensureSchema(db);
    db.exec("DELETE FROM concepts; DELETE FROM links;");
    if (fts5) {
      try {
        db.exec("DELETE FROM concepts_fts;");
      } catch {
        // table missing on a partial previous build
      }
    }
    const insC = db.prepare(
      "INSERT INTO concepts (path, type, title, description, status, kind, from_val, against, tags_json, mtime, body_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insL = db.prepare("INSERT INTO links (src, dest, raw) VALUES (?, ?, ?)");
    const insF = fts5 ? db.prepare("INSERT INTO concepts_fts (path, title, body_text) VALUES (?, ?, ?)") : null;
    for (const c of concepts) {
      insC.run(
        c.path,
        c.type,
        c.title,
        c.description,
        c.status,
        c.kind,
        c.from,
        c.against,
        JSON.stringify(c.tags),
        c.mtime,
        c.searchable,
      );
      insF?.run(c.path, c.title, c.searchable);
      for (const l of extractLinks(c.path, c.body)) insL.run(l.src, l.dest, l.raw);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("version", INDEX_VERSION);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("root", root);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("builtAt", new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("fts5", fts5 ? "1" : "0");
    db.close();
    return { ok: true, path: file, concepts: concepts.length, backend: "sqlite", fts5 };
  } catch (err) {
    return {
      ok: false,
      path: file,
      concepts: concepts.length,
      backend: "none",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{
 *   type?: string,
 *   status?: string,
 *   tag?: string,
 *   kind?: string,
 * }} filters
 * @returns {{ sql: string, params: string[] }}
 */
function filterSql(filters) {
  /** @type {string[]} */
  const clauses = [];
  /** @type {string[]} */
  const params = [];
  if (filters.type) {
    clauses.push("lower(c.type) = lower(?)");
    params.push(filters.type);
  }
  if (filters.status) {
    clauses.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.kind) {
    clauses.push("lower(c.kind) = lower(?)");
    params.push(filters.kind);
  }
  if (filters.tag) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(c.tags_json) WHERE value = ?)");
    params.push(filters.tag);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
}

/**
 * @param {{
 *   root: string,
 *   id?: string | null,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   q: string,
 *   type?: string,
 *   status?: string,
 *   tag?: string,
 *   kind?: string,
 *   limit?: number,
 * }} opts
 */
export function searchBundle({
  root,
  id = null,
  home = null,
  env = process.env,
  q,
  type,
  status,
  tag,
  kind,
  limit = 50,
}) {
  const needle = q.trim().toLowerCase();
  const filters = { type, status, tag, kind };
  if (id && home) {
    const file = indexPath(home, id, env);
    const DatabaseSync = loadDatabaseSync();
    if (DatabaseSync && existsSync(file)) {
      maybeUpgradeIndex({ root, id, home, env, DatabaseSync, file });
      try {
        const found = searchSqlite(DatabaseSync, file, needle, { ...filters, limit });
        return { backend: "sqlite", hits: found.hits, total: found.total };
      } catch {
        // fall through to scan
      }
    }
  }
  const found = searchScan(listConcepts(root), needle, { ...filters, limit });
  return { backend: "scan", hits: found.hits, total: found.total };
}

/**
 * Rebuild if the on-disk schema predates INDEX_VERSION.
 * @param {{ root: string, id: string, home: string, env: NodeJS.ProcessEnv, DatabaseSync: typeof import("node:sqlite").DatabaseSync, file: string }} opts
 */
function maybeUpgradeIndex({ root, id, home, env, DatabaseSync, file }) {
  let version = "0";
  const db = new DatabaseSync(file);
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'version'").get();
    version = row?.value ? String(row.value) : "0";
  } catch {
    version = "0";
  } finally {
    db.close();
  }
  if (version !== INDEX_VERSION) reindexBundle({ root, id, home, env });
}

/**
 * @param {typeof import("node:sqlite").DatabaseSync} DatabaseSync
 */
function searchSqlite(DatabaseSync, file, needle, { type, status, tag, kind, limit }) {
  const db = new DatabaseSync(file);
  try {
    const { sql: extra, params: filterParams } = filterSql({ type, status, tag, kind });
    const like = db.prepare(
      `SELECT c.path AS path, c.type AS type, c.title AS title, c.description AS description,
              c.status AS status, c.kind AS kind, c.tags_json AS tags_json, c.body_text AS body_text
       FROM concepts c
       WHERE (lower(c.title) LIKE ? OR lower(c.body_text) LIKE ? OR lower(c.path) LIKE ?)${extra}
       ORDER BY CASE WHEN lower(c.title) LIKE ? THEN 0 ELSE 1 END, c.path`,
    );
    const pat = `%${needle}%`;
    let rows = [];
    try {
      const fts = db.prepare(
        `SELECT c.path AS path, c.type AS type, c.title AS title, c.description AS description,
                c.status AS status, c.kind AS kind, c.tags_json AS tags_json,
                snippet(concepts_fts, 2, '', '', '…', 32) AS snippet
         FROM concepts_fts
         JOIN concepts c ON c.path = concepts_fts.path
         WHERE concepts_fts MATCH ?${extra}
         ORDER BY bm25(concepts_fts)`,
      );
      const tokens = needle
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const q = tokens.length ? tokens.map((t) => `${t}*`).join(" AND ") : needle;
      rows = fts.all(q, ...filterParams);
    } catch {
      rows = [];
    }
    if (!rows || rows.length === 0) {
      try {
        rows = like.all(pat, pat, pat, ...filterParams, pat);
      } catch {
        rows = [];
      }
    }
    const mapped = (rows || []).map((r) => rowToHit(r, needle));
    return { hits: mapped.slice(0, limit), total: mapped.length };
  } finally {
    db.close();
  }
}

/**
 * @param {Record<string, unknown>} r
 * @param {string} needle
 */
function rowToHit(r, needle) {
  const body = String(r.body_text ?? r.snippet ?? "");
  const snippet = r.snippet != null && String(r.snippet).trim() ? String(r.snippet).trim() : scanSnippet(body, needle);
  return {
    path: String(r.path ?? ""),
    type: String(r.type ?? ""),
    title: String(r.title || ""),
    description: String(r.description || ""),
    status: String(r.status || ""),
    kind: String(r.kind || ""),
    tags: parseTagsJson(r.tags_json),
    snippet,
  };
}

function parseTagsJson(raw) {
  try {
    const v = JSON.parse(String(raw || "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} text
 * @param {string} needle
 */
function scanSnippet(text, needle, max = SNIPPET_CHARS) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  const i = needle ? lower.indexOf(needle) : 0;
  if (i < 0) return compact.slice(0, max);
  const start = Math.max(0, i - 40);
  let s = compact.slice(start, start + max);
  if (start > 0) s = `…${s}`;
  if (start + max < compact.length) s = `${s}…`;
  return s;
}

function searchScan(concepts, needle, { type, status, tag, kind, limit }) {
  const hits = filterConcepts(concepts, { type, status, tag, kind })
    .filter((c) => `${c.title}\n${c.searchable}`.toLowerCase().includes(needle))
    .map((c) => ({
      path: c.path,
      type: c.type,
      title: c.title,
      description: c.description,
      status: c.status,
      kind: c.kind,
      tags: c.tags,
      snippet: scanSnippet(c.searchable, needle),
    }))
    .sort((a, b) => {
      const at = a.title.toLowerCase().includes(needle) ? 0 : 1;
      const bt = b.title.toLowerCase().includes(needle) ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.path.localeCompare(b.path);
    });
  return { hits: hits.slice(0, limit), total: hits.length };
}

/**
 * Concepts that link to `path` (bundle-relative). SQLite first, file-scan fallback.
 * @param {{
 *   root: string,
 *   path: string,
 *   id?: string | null,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 * @returns {Array<{ path: string, type: string, title: string }>}
 */
export function listBacklinks({ root, path: rel, id = null, home = null, env = process.env }) {
  const target = normalizeDest("", rel) || rel;
  if (id && home) {
    const file = indexPath(home, id, env);
    const DatabaseSync = loadDatabaseSync();
    if (DatabaseSync && existsSync(file)) {
      maybeUpgradeIndex({ root, id, home, env, DatabaseSync, file });
      try {
        return backlinksSqlite(DatabaseSync, file, target);
      } catch {
        // fall through to scan
      }
    }
  }
  return backlinksScan(listConcepts(root), target);
}

/**
 * @param {typeof import("node:sqlite").DatabaseSync} DatabaseSync
 * @param {string} file
 * @param {string} target
 */
function backlinksSqlite(DatabaseSync, file, target) {
  const db = new DatabaseSync(file);
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT c.path AS path, c.type AS type, c.title AS title
         FROM links l
         JOIN concepts c ON c.path = l.src
         WHERE l.dest = ? AND l.src != ?
         ORDER BY c.path`,
      )
      .all(target, target);
    return (rows || []).map((r) => ({
      path: String(r.path ?? ""),
      type: String(r.type ?? ""),
      title: String(r.title || ""),
    }));
  } finally {
    db.close();
  }
}

/**
 * @param {ReturnType<typeof listConcepts>} concepts
 * @param {string} target
 */
function backlinksScan(concepts, target) {
  /** @type {Array<{ path: string, type: string, title: string }>} */
  const out = [];
  for (const c of concepts) {
    if (c.path === target) continue;
    if (extractLinks(c.path, c.body).some((l) => l.dest === target)) {
      out.push({ path: c.path, type: c.type, title: c.title });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Rebuild sqlite after an OKF write so the next search sees the new file.
 * @param {{ root: string, id: string | null, indexed?: object }} where
 * @param {string | null} home
 * @param {NodeJS.ProcessEnv} [env]
 */
export function refreshIndex(where, home, env = process.env) {
  if (!where?.id || !home) {
    return where?.indexed ?? { ok: false, path: null, concepts: 0, backend: "none" };
  }
  return reindexBundle({ root: where.root, id: where.id, home, env });
}
