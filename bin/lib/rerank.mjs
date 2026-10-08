/**
 * Optional search re-rank. A decision model scores each hit 0 to 3 against the query; only the order
 * and an annotation change. Hits are never dropped or invented, and any failure keeps the original order.
 */
import { THRESHOLDS, score } from "./jev.mjs";
import { redact } from "./jev-assist.mjs";

export const MAX_RERANK = 20;
const LEVELS = ["off topic", "weak", "relevant", "exactly it"];

/**
 * @template {{ type: string, title: string, snippet?: string }} H
 * @param {{ jev: { decide: Function }, queries: string[], hits: H[] }} o
 * @returns {Promise<{ ok: boolean, hits: Array<H & { relevance?: number }> }>}
 */
export async function rerankHits({ jev, queries, hits }) {
  if (hits.length < 2) return { ok: false, hits };
  const targets = hits.slice(0, MAX_RERANK);
  const state = {
    query: queries.map(redact).join(" | "),
    hits: Object.fromEntries(targets.map((h, i) => [`h${i}`, { type: h.type, title: redact(h.title), snippet: redact(h.snippet || "") || undefined }])),
  };
  const questions = Object.fromEntries(
    targets.map((_, i) => [`h${i}`, score(`How well does \`hits.h${i}\` answer \`query\`?`, LEVELS)]),
  );
  let r;
  try {
    r = await jev.decide(state, questions);
  } catch {
    return { ok: false, hits };
  }
  const rel = targets.map((_, i) => {
    const a = r?.answers?.[`h${i}`];
    if (!a || typeof a.score !== "number") return null;
    if (typeof a.confidence === "number" && a.confidence < THRESHOLDS.pick) return null;
    return Math.max(0, Math.min(3, Math.round(a.score)));
  });
  if (rel.every((v) => v == null)) return { ok: false, hits };
  const ranked = hits.map((h, i) => ({ ...h, ...(i < rel.length && rel[i] != null ? { relevance: rel[i] } : {}), _i: i }));
  ranked.sort((a, b) => (b.relevance ?? 1.5) - (a.relevance ?? 1.5) || a._i - b._i);
  return { ok: true, hits: ranked.map(({ _i, ...h }) => h) };
}
