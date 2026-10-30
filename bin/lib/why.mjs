/**
 * `mental why` — decisions and hops anchored to a path or commit.
 * Markdown stays the source of truth. The sqlite tables are a cache.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { blameLine, isAncestor, runGit } from "./git.mjs";
import { journalHops, listMarkdownRecursive, parseFrontmatter } from "./okf.mjs";

const SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * @param {string} stored
 * @param {string} query
 */
export function pathCovers(stored, query) {
  const s = String(stored || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  const q = String(query || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!s || !q) return false;
  return s === q || s.startsWith(`${q}/`) || q.startsWith(`${s}/`);
}

/**
 * @param {string} body
 */
export function hopAnchor(body) {
  const head = body.match(/^Head:\s*([0-9a-f]{7,40})\s*$/im)?.[1] || "";
  const paths = (body.match(/^Paths:\s*(.+)$/im)?.[1] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const refs = [...body.matchAll(/^Ref:\s*(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
  return { head, paths, refs };
}

/**
 * @param {Record<string, string | string[]>} data
 * @param {string} body
 */
export function conceptAnchor(data, body) {
  const head = data.head ? String(data.head) : "";
  const paths = Array.isArray(data.paths) ? data.paths.map(String) : [];
  const refs = Array.isArray(data.refs) ? data.refs.map(String) : hopAnchor(body).refs;
  return { head, paths, refs };
}

/**
 * @param {string} root
 * @returns {Array<{ path: string, type: string, title: string, head: string, paths: string[], refs: string[], timestamp: string }>}
 */
export function listAnchors(root) {
  /** @type {Array<{ path: string, type: string, title: string, head: string, paths: string[], refs: string[], timestamp: string }>} */
  const out = [];
  if (!root || !existsSync(root)) return out;
  for (const dir of ["decisions", "attention", "notes", "journal"]) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const file of listMarkdownRecursive(abs)) {
      let text = "";
      try {
        text = readFileSync(join(abs, file), "utf8");
      } catch {
        continue;
      }
      const { data, body } = parseFrontmatter(text);
      const type = String(data.type || dir);
      if (dir === "journal") {
        for (const hop of journalHops(body)) {
          const a = hopAnchor(hop.body);
          if (!a.head && a.paths.length === 0 && a.refs.length === 0) continue;
          out.push({
            path: `journal/${file}#${hop.fragment}`,
            type: "Journal",
            title: hop.title,
            head: a.head,
            paths: a.paths,
            refs: a.refs,
            timestamp: data.timestamp ? String(data.timestamp) : "",
          });
        }
        continue;
      }
      const a = conceptAnchor(data, body);
      if (!a.head && a.paths.length === 0 && a.refs.length === 0) continue;
      out.push({
        path: `${dir}/${file}`,
        type,
        title: String(data.title || file.replace(/\.md$/, "")),
        head: a.head,
        paths: a.paths,
        refs: a.refs,
        timestamp: data.timestamp ? String(data.timestamp) : "",
      });
    }
  }
  return out;
}

/**
 * @param {string | null} gitRoot
 * @param {string} sha
 * @param {NodeJS.ProcessEnv} env
 */
function trailersForSha(gitRoot, sha, env) {
  if (!gitRoot) return [];
  const r = runGit(gitRoot, ["log", "-1", "--format=%B", sha], { env });
  if (r.status !== 0) return [];
  /** @type {string[]} */
  const paths = [];
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const m = /^Mental-Decision:\s*\S+\/(\S+)\s*$/.exec(line.trim());
    if (m) paths.push(m[1]);
  }
  return paths;
}

/**
 * An anchor covers a commit when it is that commit, or it is the nearest
 * ancestor anchor (nothing else is anchored strictly between them).
 * @param {string | null} gitRoot
 * @param {string} anchor
 * @param {string} sha
 * @param {string[]} others
 * @param {NodeJS.ProcessEnv} env
 */
function sameCommit(a, b) {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const n = Math.min(x.length, y.length);
  if (n < 7) return false;
  return x.startsWith(y) || y.startsWith(x);
}

function anchorCovers(gitRoot, anchor, sha, others, env) {
  if (!anchor || !sha) return false;
  if (sameCommit(anchor, sha)) return true;
  if (!gitRoot) return false;
  if (!isAncestor(gitRoot, anchor, sha, env)) return false;
  for (const other of others) {
    if (!other || other === anchor) continue;
    if (isAncestor(gitRoot, anchor, other, env) && isAncestor(gitRoot, other, sha, env)) return false;
  }
  return true;
}

/**
 * @param {{ root: string, gitRoot?: string | null, target: string, env?: NodeJS.ProcessEnv }} opts
 */
export function whyQuery({ root, gitRoot = null, target, env = process.env }) {
  const raw = String(target || "").trim();
  /** @type {string | null} */
  let path = null;
  /** @type {string | null} */
  let sha = null;
  const line = /^(.*):(\d+)$/.exec(raw.replace(/\\/g, "/"));
  if (line && gitRoot) {
    const blamed = blameLine(gitRoot, line[1], Number(line[2]), env);
    if (blamed) {
      path = line[1];
      sha = blamed;
    }
  }
  if (!sha && SHA_RE.test(raw)) sha = raw;
  if (!path && !sha) path = raw.replace(/\\/g, "/");

  const anchors = listAnchors(root);
  const heads = [...new Set(anchors.map((a) => a.head).filter(Boolean))];
  /** @type {typeof anchors} */
  const hits = [];
  const seen = new Set();
  const push = (row) => {
    if (seen.has(row.path)) return;
    seen.add(row.path);
    hits.push(row);
  };

  for (const row of anchors) {
    if (path && (pathCovers(row.path, path) || row.paths.some((p) => pathCovers(p, path)))) push(row);
    if (sha && anchorCovers(gitRoot, row.head, sha, heads, env)) push(row);
  }

  if (sha) {
    for (const rel of trailersForSha(gitRoot, sha, env)) {
      const row = anchors.find((a) => a.path === rel || a.path.endsWith(`/${rel}`) || rel.endsWith(a.path));
      if (row) push(row);
      else if (existsSync(join(root, rel.split("#")[0]))) {
        push({ path: rel, type: "Decision", title: rel, head: sha, paths: [], refs: [], timestamp: "" });
      }
    }
  }

  hits.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)) || a.path.localeCompare(b.path));
  return { target: raw, path, sha, hits };
}

/**
 * @param {string} root
 * @param {string} dirName
 */
export function listMarkdownNames(root, dirName) {
  const dir = join(root, dirName);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
