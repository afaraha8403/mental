/**
 * Decision-model repair of historical data, run from `mental doctor`.
 *
 * Preview by default: proposes topic tags for untagged files and high-confidence links for a capped
 * number of files per run. `apply` writes them through the same primitives as `retag` / `relink`
 * (one tag line, one `## Related` bullet list). Never throws: a missing key, a spent budget or a bad
 * answer yields an empty plan, so doctor stays deterministic.
 *
 * History is walked a few files per run. A file with nothing to propose is remembered (by mtime)
 * in a rebuildable cache, so repeated runs move on to older files instead of re-asking.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listConcepts } from "./index.mjs";
import { suggestLinks, applyLinks } from "./jev-assist.mjs";
import { isStale, markStale } from "./supersede.mjs";
import { proposeTags, applyTag } from "./retag.mjs";
import { cacheMentalDir } from "./watermark.mjs";

export const DEFAULT_REPAIR_FILES = 10;
export const MAX_REPAIR_FILES = 200;
const STATE_FILE = "doctor-repair.json";

const MARKABLE_TYPES = new Set(["Note", "Decision"]);

/** @param {{ timestamp?: string, mtime: number }} c */
function when(c) {
  const t = Date.parse(c.timestamp || "");
  return Number.isFinite(t) ? t : c.mtime;
}

/**
 * Split model link proposals into plain links and "this replaces that" findings. The model's word
 * only says the two overlap; which one is current is decided by date (newer wins). Two notes or
 * decisions become a stale proposal; anything else keeps a correctly worded link.
 * @param {{ path: string, title: string, type: string, timestamp?: string, mtime: number }} c
 * @param {Array<{ path: string, title: string, type: string, score: number, relation?: string }>} proposed
 * @param {Map<string, { path: string, title: string, type: string, status?: string, timestamp?: string, mtime: number }>} byPath
 */
function splitSupersedes(c, proposed, byPath) {
  const links = [];
  const stale = [];
  for (const p of proposed) {
    if (p.relation !== "supersedes") {
      links.push(p);
      continue;
    }
    const other = byPath.get(p.path);
    const [a, b] = other ? [when(c), when(other)] : [0, 0];
    if (!other || a === b) {
      links.push({ ...p, relation: "related" });
      continue;
    }
    const cNewer = a > b;
    const markable = MARKABLE_TYPES.has(c.type) && MARKABLE_TYPES.has(p.type) && !isStale(c.status) && !isStale(other.status);
    if (markable) {
      const [older, newer] = cNewer ? [other, c] : [c, other];
      stale.push({ path: older.path, title: older.title, type: older.type, by: newer.path, byTitle: newer.title, score: p.score });
    } else {
      links.push(cNewer ? p : { ...p, relation: undefined, label: "superseded by" });
    }
  }
  return { links, stale };
}

/** @param {string} home @param {NodeJS.ProcessEnv} env */
function stateFile(home, env) {
  return join(cacheMentalDir(home, env), STATE_FILE);
}

/** @returns {Record<string, Record<string, number>>} */
function readState(home, env) {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(home, env), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(home, env, state) {
  try {
    mkdirSync(cacheMentalDir(home, env), { recursive: true });
    writeFileSync(stateFile(home, env), JSON.stringify(state));
  } catch {
    /* progress is best-effort */
  }
}

/**
 * @param {{
 *   jev: { decide: Function, gate: Function },
 *   home: string,
 *   env?: NodeJS.ProcessEnv,
 *   root: string,
 *   apply?: boolean,
 *   files?: number,
 * }} o
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   apply: boolean,
 *   tags: { untagged: number, proposals: Array<{ path: string, title: string, tag: string, isNew: boolean, confidence: number }>, applied: number },
 *   links: { scanned: number, remaining: number, results: Array<{ path: string, title: string, proposed: Array<{ path: string, title: string, type: string, score: number, relation?: string }>, applied: number }>, applied: number },
 * }>}
 */
export async function repairHistory({ jev, home, env = process.env, root, apply = false, files = DEFAULT_REPAIR_FILES }) {
  const out = {
    ok: true,
    reason: undefined,
    apply,
    tags: { untagged: 0, proposals: [], applied: 0 },
    links: { scanned: 0, remaining: 0, results: [], applied: 0 },
    stale: { proposals: [], applied: 0 },
  };
  const fail = (reason) => {
    if (out.ok) {
      out.ok = false;
      out.reason = reason;
    }
  };

  try {
    const t = await proposeTags({ jev, root, limit: Math.max(files * 4, 40) });
    out.tags.untagged = t.untagged;
    out.tags.proposals = t.proposals;
    if (!t.ok) fail(t.reason || "unavailable");
    if (apply && t.proposals.length) {
      const byPath = new Map(listConcepts(root).map((c) => [c.path, c]));
      for (const p of t.proposals) {
        const c = byPath.get(p.path);
        if (c && applyTag(c.abs, p.tag)) out.tags.applied++;
      }
    }
  } catch {
    fail("error");
  }

  // A tag failure (auth, rate limit, budget) means links would fail the same way.
  if (out.ok) {
    const state = readState(home, env);
    const done = state[root] ?? {};
    const all = listConcepts(root)
      .filter((c) => c.type !== "Journal")
      .sort((a, b) => b.mtime - a.mtime);
    const byPath = new Map(all.map((c) => [c.path, c]));
    const todo = all.filter((c) => done[c.path] !== c.mtime && !isStale(c.status));
    out.links.remaining = todo.length;
    let touched = false;
    for (const c of todo.slice(0, files)) {
      let s;
      try {
        s = await suggestLinks({ jev, root, path: c.path });
      } catch {
        fail("error");
        break;
      }
      if (!s.ok) {
        fail(s.reason || "unavailable");
        break;
      }
      out.links.scanned++;
      out.links.remaining--;
      const { links, stale } = splitSupersedes(c, s.proposed, byPath);
      let applied = 0;
      let markedStale = 0;
      for (const st of stale) {
        if (out.stale.proposals.some((p) => p.path === st.path)) continue;
        out.stale.proposals.push(st);
        if (apply && markStale(root, st.path, { status: "superseded", by: st.by }).ok) {
          markedStale++;
          out.stale.applied++;
        }
      }
      if (apply && links.length) applied = applyLinks(c.abs, links);
      if (links.length || applied) {
        out.links.results.push({ path: c.path, title: c.title, proposed: links, applied });
        out.links.applied += applied;
      }
      // Dry runs only skip files that have nothing to propose, so --apply still sees the rest.
      if ((links.length === 0 && stale.length === 0) || apply) {
        done[c.path] = applied || markedStale ? Math.floor(statSync(c.abs).mtimeMs) : c.mtime;
        touched = true;
      }
    }
    if (touched) {
      state[root] = done;
      writeState(home, env, state);
    }
  }
  return out;
}

/**
 * One-line summary for the doctor check.
 * @param {Awaited<ReturnType<typeof repairHistory>>} r
 */
export function summarizeRepair(r) {
  const tags = r.apply ? r.tags.applied : r.tags.proposals.length;
  const links = r.apply ? r.links.applied : r.links.results.reduce((n, x) => n + x.proposed.length, 0);
  const stale = r.apply ? r.stale.applied : r.stale.proposals.length;
  const left = r.links.remaining > 0 ? `; ${r.links.remaining} file(s) not checked for links yet` : "";
  if (r.apply) return `applied ${tags} tag(s), ${links} link(s) and ${stale} superseded mark(s) (${r.links.scanned} file(s) scanned${left})`;
  if (tags + links + stale === 0) return `nothing to repair (${r.links.scanned} file(s) scanned${left})`;
  const sample = [
    ...r.tags.proposals.slice(0, 2).map((p) => `tag ${p.tag}: ${p.title}`),
    ...r.links.results.slice(0, 2).map((x) => `link ${x.title} -> ${x.proposed[0].title}`),
    ...r.stale.proposals.slice(0, 2).map((p) => `stale ${p.title} <- ${p.byTitle}`),
  ].join("; ");
  return `${tags} tag(s), ${links} link(s) and ${stale} superseded mark(s) proposed (${sample}${left})`;
}
