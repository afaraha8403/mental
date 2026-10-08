/**
 * Topic tags for untagged files, chosen by Jev (optional). Pure proposal + one surgical write.
 *
 * Vocabulary = tags already on a few files, plus a bootstrap of frequent title words so a repo
 * with no tags at all still gets topics. Jev picks one per file or "none"; low confidence is dropped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { listConcepts } from "./index.mjs";
import { THRESHOLDS, choice, pick } from "./jev.mjs";
import { oneLine, redact, sigTokens } from "./jev-assist.mjs";

export const MIN_TAG_FILES = 2;
export const MAX_VOCAB = 20;
export const DEFAULT_LIMIT = 40;
const MIN_WORD_FILES = 3;
const MAX_WORD_SHARE = 0.4;
const BODY_CHARS = 300;
const TAG_SLUG = /^[a-z0-9_-]{2,32}$/;
// Common title words that describe an action or state, not a topic.
const GENERIC = new Set(
  "still stop stops optional update updates updated should must needs need check checks wall cross glance first last into only more most make makes made using use used uses when before after than then have has not does doesn real part new old stale open done late early plan plans rule rules wrapper line value values option options default defaults live user users file files stays stay keep keeps skip skips real".split(
    " ",
  ),
);

/** @param {string} root */
function subjects(root) {
  return listConcepts(root).filter((c) => c.type !== "Journal");
}

/**
 * @param {ReturnType<typeof listConcepts>} concepts
 * @returns {{ existing: string[], bootstrap: string[] }}
 */
export function buildVocab(concepts) {
  const tagFiles = new Map();
  for (const c of concepts) for (const t of new Set(c.tags)) tagFiles.set(t, (tagFiles.get(t) || 0) + 1);
  const existing = [...tagFiles.entries()]
    .filter(([t, n]) => n >= MIN_TAG_FILES && TAG_SLUG.test(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VOCAB)
    .map(([t]) => t);

  const df = new Map();
  for (const c of concepts) for (const w of sigTokens(c.title)) df.set(w, (df.get(w) || 0) + 1);
  const ceiling = Math.max(MIN_WORD_FILES, Math.floor(concepts.length * MAX_WORD_SHARE));
  const taken = new Set(existing);
  const bootstrap = [...df.entries()]
    .filter(([w, n]) => n >= MIN_WORD_FILES && n <= ceiling && TAG_SLUG.test(w) && !GENERIC.has(w) && !taken.has(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, MAX_VOCAB - existing.length))
    .map(([w]) => w);
  return { existing, bootstrap };
}

/**
 * @param {{ jev: { decide: Function }, root: string, path?: string, limit?: number }} o
 * @returns {Promise<{ ok: boolean, reason?: string, vocab: { existing: string[], bootstrap: string[] }, untagged: number, proposals: Array<{ path: string, title: string, tag: string, isNew: boolean, confidence: number }> }>}
 */
export async function proposeTags({ jev, root, path, limit = DEFAULT_LIMIT }) {
  const all = subjects(root);
  const vocab = buildVocab(all);
  // Clef allows at most 255 options per choice; "none" takes one.
  const names = [...vocab.existing, ...vocab.bootstrap].slice(0, 200);
  const pool = all.filter((c) => c.tags.length === 0 && (!path || c.path === path));
  const targets = pool.slice(0, limit);
  const out = { ok: true, vocab, untagged: pool.length, proposals: [] };
  if (names.length === 0 || targets.length === 0) return out;

  const criteria = Object.fromEntries([...names.map((t) => [t, null]), ["none", "no listed topic fits"]]);
  const state = {
    files: Object.fromEntries(
      targets.map((c, i) => [
        `u${i}`,
        { title: redact(c.title), description: redact(c.description) || undefined, excerpt: redact(c.body).slice(0, BODY_CHARS) || undefined },
      ]),
    ),
  };
  const questions = Object.fromEntries(
    targets.map((_, i) => [`u${i}`, choice(`Which single topic does \`files.u${i}\` belong to? Answer none unless one clearly fits.`, criteria)]),
  );
  const r = await jev.decide(state, questions);
  if (!r.ok && Object.values(r.answers).every((a) => a == null)) return { ...out, ok: false, reason: r.reason || "unavailable" };
  const isNew = new Set(vocab.bootstrap);
  for (const [i, c] of targets.entries()) {
    const a = r.answers[`u${i}`];
    const tag = a ? pick(a, THRESHOLDS.similar) : null;
    if (!tag || tag === "none" || !names.includes(tag)) continue;
    out.proposals.push({ path: c.path, title: oneLine(c.title), tag, isNew: isNew.has(tag), confidence: a.confidence });
  }
  out.proposals.sort((a, b) => b.confidence - a.confidence);
  return out;
}

/**
 * Add one tag to a file that has none. Edits only the `tags` line (or inserts it), leaving the rest
 * of the frontmatter byte-for-byte as it was. Returns false when the file already has tags.
 * @param {string} abs
 * @param {string} tag
 */
export function applyTag(abs, tag) {
  if (!TAG_SLUG.test(tag)) return false;
  const text = readFileSync(abs, "utf8");
  const m = text.match(/^---(\r?\n)([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!m) return false;
  const nl = m[1];
  const lines = m[2].split(/\r?\n/);
  const at = lines.findIndex((l) => /^tags:/.test(l));
  if (at >= 0) {
    if (!/^tags:\s*(\[\s*\])?\s*$/.test(lines[at])) return false;
    lines[at] = `tags: [${tag}]`;
  } else {
    lines.push(`tags: [${tag}]`);
  }
  const head = `---${nl}${lines.join(nl)}${nl}---`;
  writeFileSync(abs, head + text.slice(m[0].length));
  return true;
}
