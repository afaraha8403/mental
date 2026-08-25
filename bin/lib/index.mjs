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
const INDEX_VERSION = "1";

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
 * @param {Array<{ type: string, status: string, tags: string[] }>} items
 * @param {{ type?: string, status?: string, tag?: string }} [filters]
 */
export function filterConcepts(items, { type, status, tag } = {}) {
  let out = items;
  if (type) out = out.filter((c) => c.type.toLowerCase() === String(type).toLowerCase());
  if (status) out = out.filter((c) => c.status === status);
  if (tag) out = out.filter((c) => c.tags.includes(String(tag)));
  return out;
}

/**
 * @param {string} root bundle directory
 * @returns {Array<{ path: string, type: string, title: string, status: string, tags: string[], mtime: number, body: string, abs: string }>}
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
      status: String(data.status || ""),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? [String(data.tags)] : [],
      mtime: Math.floor(st.mtimeMs),
      body: searchable,
      abs,
    });
  }
}

function inferType(rel) {
  if (rel.startsWith("journal/")) return "Journal";
  if (rel.startsWith("decisions/")) return "Decision";
  if (rel.startsWith("notes/")) return "Note";
  return "Note";
}

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function extractLinks(src, body) {
  /** @type {Array<{ src: string, dest: string, raw: string }>} */
  const out = [];
  let m;
  const re = new RegExp(LINK_RE.source, "g");
  while ((m = re.exec(body))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("http:") || raw.startsWith("https:") || raw.startsWith("mailto:")) continue;
    out.push({ src, dest: raw.split("#")[0], raw });
  }
  return out;
}

/**
 * @param {{ root: string, id: string, home: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: boolean, path: string | null, concepts: number, backend: "sqlite" | "none", error?: string }}
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
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS concepts (
        path TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT,
        status TEXT,
        tags_json TEXT,
        mtime INTEGER,
        body_text TEXT
      );
      CREATE TABLE IF NOT EXISTS links (
        src TEXT NOT NULL,
        dest TEXT NOT NULL,
        raw TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(path, title, body_text);
    `);
    db.exec("DELETE FROM concepts; DELETE FROM links; DELETE FROM concepts_fts;");
    const insC = db.prepare(
      "INSERT INTO concepts (path, type, title, status, tags_json, mtime, body_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insL = db.prepare("INSERT INTO links (src, dest, raw) VALUES (?, ?, ?)");
    const insF = db.prepare("INSERT INTO concepts_fts (path, title, body_text) VALUES (?, ?, ?)");
    for (const c of concepts) {
      insC.run(c.path, c.type, c.title, c.status, JSON.stringify(c.tags), c.mtime, c.body);
      insF.run(c.path, c.title, c.body);
      for (const l of extractLinks(c.path, c.body)) insL.run(l.src, l.dest, l.raw);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("version", INDEX_VERSION);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("root", root);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
      "builtAt",
      new Date().toISOString(),
    );
    db.close();
    return { ok: true, path: file, concepts: concepts.length, backend: "sqlite" };
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
 *   root: string,
 *   id?: string | null,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   q: string,
 *   type?: string,
 *   status?: string,
 *   tag?: string,
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
  limit = 50,
}) {
  const needle = q.trim().toLowerCase();
  if (id && home) {
    const file = indexPath(home, id, env);
    const DatabaseSync = loadDatabaseSync();
    if (DatabaseSync && existsSync(file)) {
      try {
        return { backend: "sqlite", hits: searchSqlite(DatabaseSync, file, needle, { type, status, tag, limit }) };
      } catch {
        // fall through to scan
      }
    }
  }
  return { backend: "scan", hits: searchScan(listConcepts(root), needle, { type, status, tag, limit }) };
}

/**
 * @param {typeof import("node:sqlite").DatabaseSync} DatabaseSync
 */
function searchSqlite(DatabaseSync, file, needle, { type, status, tag, limit }) {
  const db = new DatabaseSync(file);
  try {
    const like = db.prepare(
      `SELECT path, type, title, status, tags_json
       FROM concepts
       WHERE lower(title) LIKE ? OR lower(body_text) LIKE ? OR lower(path) LIKE ?
       LIMIT ?`,
    );
    const pat = `%${needle}%`;
    let rows = [];
    try {
      const fts = db.prepare(
        `SELECT c.path AS path, c.type AS type, c.title AS title, c.status AS status, c.tags_json AS tags_json
         FROM concepts_fts f
         JOIN concepts c ON c.path = f.path
         WHERE concepts_fts MATCH ?
         LIMIT ?`,
      );
      const tokens = needle.replace(/[^\p{L}\p{N}\s]+/gu, " ").trim().split(/\s+/).filter(Boolean);
      const q = tokens.length ? tokens.map((t) => `${t}*`).join(" AND ") : needle;
      rows = fts.all(q, limit);
    } catch {
      rows = [];
    }
    if (!rows || rows.length === 0) {
      rows = like.all(pat, pat, pat, limit);
    }
    return filterHits(
      (rows || []).map((r) => ({
        path: String(r.path ?? ""),
        type: String(r.type ?? ""),
        title: String(r.title || ""),
        status: String(r.status || ""),
        tags: parseTagsJson(r.tags_json),
      })),
      { type, status, tag, limit },
    );
  } finally {
    db.close();
  }
}

function parseTagsJson(raw) {
  try {
    const v = JSON.parse(String(raw || "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function searchScan(concepts, needle, { type, status, tag, limit }) {
  const hits = concepts
    .filter((c) => `${c.title}\n${c.body}`.toLowerCase().includes(needle))
    .map((c) => ({
      path: c.path,
      type: c.type,
      title: c.title,
      status: c.status,
      tags: c.tags,
    }));
  return filterHits(hits, { type, status, tag, limit });
}

function filterHits(hits, { type, status, tag, limit }) {
  let out = hits;
  if (type) out = out.filter((h) => h.type.toLowerCase() === type.toLowerCase());
  if (status) out = out.filter((h) => h.status === status);
  if (tag) out = out.filter((h) => h.tags.includes(tag));
  return out.slice(0, limit);
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
