/**
 * Jev-assisted helpers (search recovery, similar-to, link suggestions).
 *
 * Shape of every helper: free pre-filter proposes candidates, Jev gates each with a Noul,
 * the result is advisory. Failure of Jev (network, auth, timeout) returns the baseline
 * behaviour. Nothing here writes a file except `applyLinks`, which only runs on `relink --apply`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { listConcepts, searchBundle, tokenizeQuery, extractLinks } from "./index.mjs";
import { THRESHOLDS } from "./jev.mjs";

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "not", "but", "you", "all", "can",
  "has", "have", "will", "its", "our", "your", "use", "using", "new", "add", "fix", "mental",
]);
const SEARCH_CANDIDATES = 12;
const SIMILAR_CANDIDATES = 8;
const LINK_CANDIDATES = 10;
const BODY_CHARS = 500;

/** @param {string} s */
export function sigTokens(s) {
  return [
    ...new Set(
      tokenizeQuery(String(s || "").toLowerCase()).filter((t) => t.length >= 4 && !STOP.has(t)),
    ),
  ];
}

/** @param {string} a @param {string} b @param {number} max */
function withinEdits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Non-journal concepts: journal files are append-only history, not subjects. */
function subjects(root) {
  return listConcepts(root).filter((c) => c.type !== "Journal");
}

/**
 * Free query variants: bundle words within a typo of a query word, or sharing a stem prefix.
 * @param {ReturnType<typeof listConcepts>} concepts
 * @param {string[]} tokens
 */
export function queryVariants(concepts, tokens) {
  const vocab = new Set();
  for (const c of concepts) {
    for (const t of sigTokens(`${c.title} ${c.description} ${c.tags.join(" ")}`)) vocab.add(t);
  }
  const out = new Set();
  for (const t of tokens) {
    if (t.length < 4) continue;
    const maxEdits = t.length >= 8 ? 2 : 1;
    const stem = t.length >= 6 ? t.slice(0, 5) : "";
    for (const w of vocab) {
      if (w === t) continue;
      if ((stem && w.startsWith(stem)) || withinEdits(t, w, maxEdits)) out.add(w);
    }
  }
  return [...out];
}

/** @param {{ title: string, description: string, body: string }} c */
function brief(c) {
  return {
    title: c.title,
    description: c.description || undefined,
    excerpt: c.body.replace(/\s+/g, " ").trim().slice(0, BODY_CHARS) || undefined,
  };
}

/**
 * #64: when a search finds nothing, widen it for free and let Jev gate each candidate.
 * Returns null when there is nothing to offer or Jev is unavailable (baseline behaviour wins).
 *
 * @param {{ jev: { gate: Function }, root: string, id: string | null, home: string | null, env: NodeJS.ProcessEnv,
 *   queries: string[], filters: { type?: string, status?: string, tag?: string, kind?: string } }} o
 */
export async function recoverSearch({ jev, root, id, home, env, queries, filters }) {
  const concepts = subjects(root);
  const base = [...new Set(queries.flatMap((q) => tokenizeQuery(q.toLowerCase())))];
  const variants = queryVariants(concepts, base.filter((t) => t.length >= 4));
  const widened = [...new Set([...base, ...variants])];
  if (widened.length === 0) return null;
  const found = searchBundle({ root, id, home, env, q: widened.join(" "), any: true, limit: SEARCH_CANDIDATES, ...filters });
  const cand = found.hits.filter((h) => h.type !== "Journal").slice(0, SEARCH_CANDIDATES);
  if (cand.length === 0) return null;

  const byPath = new Map(concepts.map((c) => [c.path, c]));
  const state = {
    query: queries.join(" | "),
    candidates: Object.fromEntries(
      cand.map((h, i) => {
        const c = byPath.get(h.path);
        return [`c${i}`, c ? brief(c) : { title: h.title, excerpt: h.snippet || undefined }];
      }),
    ),
  };
  const questions = Object.fromEntries(
    cand.map((_, i) => [
      `c${i}`,
      `Would someone searching for \`query\` want to see \`candidates.c${i}\`? Answer yes if it covers the same subject even when worded differently.`,
    ]),
  );
  const r = await jev.gate(state, questions);
  if (!r.ok && Object.values(r.scores).every((s) => s == null)) return { ok: false, reason: r.reason || "unavailable", hits: [], variants };
  const hits = cand
    .map((h, i) => ({ ...h, score: r.scores[`c${i}`] }))
    .filter((h) => typeof h.score === "number" && h.score >= THRESHOLDS.relevant)
    .sort((a, b) => b.score - a.score);
  return { ok: true, hits, variants };
}

/**
 * #64: before a write, find existing files the new title+body probably duplicates.
 * Exact title matches are updates, not duplicates.
 *
 * @param {{ jev: { gate: Function }, root: string, title: string, body?: string, type?: string }} o
 * @returns {Promise<Array<{ path: string, type: string, title: string, score: number }>>}
 */
export async function findSimilar({ jev, root, title, body = "" }) {
  const want = sigTokens(title);
  if (want.length === 0) return [];
  const norm = title.trim().toLowerCase();
  const scored = [];
  for (const c of subjects(root)) {
    if (c.title.trim().toLowerCase() === norm) continue;
    const have = new Set(sigTokens(`${c.title} ${c.description}`));
    const shared = want.filter((t) => have.has(t)).length;
    if (shared === 0) continue;
    scored.push({ c, rank: shared / Math.min(want.length, have.size || 1) + shared * 0.1 });
  }
  scored.sort((a, b) => b.rank - a.rank);
  const cand = scored.slice(0, SIMILAR_CANDIDATES).map((s) => s.c);
  if (cand.length === 0) return [];
  const state = {
    new: { title, excerpt: body.replace(/\s+/g, " ").trim().slice(0, BODY_CHARS) || undefined },
    candidates: Object.fromEntries(cand.map((c, i) => [`c${i}`, brief(c)])),
  };
  const questions = Object.fromEntries(
    cand.map((_, i) => [
      `c${i}`,
      `Is \`candidates.c${i}\` already recording essentially the same thing as \`new\`, so the author should update it instead of adding another?`,
    ]),
  );
  const r = await jev.gate(state, questions);
  return cand
    .map((c, i) => ({ path: c.path, type: c.type, title: c.title, score: r.scores[`c${i}`] }))
    .filter((s) => typeof s.score === "number" && s.score >= THRESHOLDS.similar)
    .sort((a, b) => b.score - a.score);
}

/** @param {string} a @param {string} b */
function linked(a, b, srcA, srcB) {
  return extractLinks(srcA, a).some((l) => l.dest === srcB) || extractLinks(srcB, b).some((l) => l.dest === srcA);
}

/**
 * #65: files that probably relate to `target` but are not linked yet.
 * Propose at >= link, maybe at >= linkMaybe, silent below.
 *
 * @param {{ jev: { gate: Function }, root: string, path: string }} o
 * @returns {Promise<{ ok: boolean, reason?: string, proposed: Array<{ path: string, type: string, title: string, score: number }>, maybe: Array<{ path: string, type: string, title: string, score: number }> }>}
 */
export async function suggestLinks({ jev, root, path }) {
  const all = subjects(root);
  const target = all.find((c) => c.path === path);
  const empty = { ok: true, proposed: [], maybe: [] };
  if (!target) return empty;
  const tTags = new Set(target.tags.map((t) => t.toLowerCase()));
  const tTokens = new Set(sigTokens(`${target.title} ${target.description}`));
  const scored = [];
  for (const c of all) {
    if (c.path === target.path) continue;
    if (linked(target.body, c.body, target.path, c.path)) continue;
    const sharedTags = c.tags.filter((t) => tTags.has(t.toLowerCase())).length;
    const sharedWords = sigTokens(`${c.title} ${c.description}`).filter((t) => tTokens.has(t)).length;
    const sameAgainst = target.against && c.against === target.against ? 1 : 0;
    const rank = sharedTags * 2 + sharedWords + sameAgainst;
    if (rank >= 2) scored.push({ c, rank });
  }
  scored.sort((a, b) => b.rank - a.rank || b.c.mtime - a.c.mtime);
  const cand = scored.slice(0, LINK_CANDIDATES).map((s) => s.c);
  if (cand.length === 0) return empty;

  const state = {
    file: { type: target.type, ...brief(target) },
    candidates: Object.fromEntries(cand.map((c, i) => [`c${i}`, { type: c.type, ...brief(c) }])),
  };
  const questions = Object.fromEntries(
    cand.map((_, i) => [
      `c${i}`,
      `Does \`candidates.c${i}\` have a direct relationship to \`file\` (decided because of it, blocks it, same thread of work, supersedes it, or is evidence for it) rather than merely sharing a topic?`,
    ]),
  );
  const r = await jev.gate(state, questions);
  const rows = cand
    .map((c, i) => ({ path: c.path, type: c.type, title: c.title, score: r.scores[`c${i}`] }))
    .filter((s) => typeof s.score === "number" && s.score >= THRESHOLDS.linkMaybe)
    .sort((a, b) => b.score - a.score);
  return {
    ok: r.ok,
    reason: r.reason,
    proposed: rows.filter((s) => s.score >= THRESHOLDS.link),
    maybe: rows.filter((s) => s.score < THRESHOLDS.link),
  };
}

/**
 * Append accepted links as ordinary markdown. Caller reindexes.
 * @param {string} abs file to edit
 * @param {Array<{ path: string, title: string }>} links
 */
export function applyLinks(abs, links) {
  let text = readFileSync(abs, "utf8");
  const fresh = links.filter((l) => !text.includes(`(${l.path})`));
  if (fresh.length === 0) return 0;
  const bullets = fresh.map((l) => `- [${l.title.replace(/[[\]]/g, "")}](${l.path})`).join("\n");
  const headings = [...text.matchAll(/^## .*$/gm)];
  const idx = headings.findIndex((h) => /^## Related\b/.test(h[0]));
  if (idx >= 0) {
    const next = headings[idx + 1];
    const end = next ? next.index : text.length;
    const section = text.slice(headings[idx].index, end).replace(/\s*$/, "");
    const tail = next ? `\n\n${text.slice(end)}` : "\n";
    text = `${text.slice(0, headings[idx].index)}${section}\n${bullets}${tail}`;
  } else {
    text = `${text.replace(/\s*$/, "\n")}\n## Related\n\n${bullets}\n`;
  }
  writeFileSync(abs, text);
  return fresh.length;
}
