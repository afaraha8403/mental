/**
 * Optional search re-rank. A decision model scores each hit 0 to 3 against the query; only the order
 * and an annotation change. Hits are never dropped or invented, and any failure keeps the original order.
 */
import { THRESHOLDS, score, choice, pick } from "./jev.mjs";
import { redact } from "./jev-assist.mjs";

export const MAX_RERANK = 20;
const LEVELS = ["off topic", "weak", "relevant", "exactly it"];
// What kind of file the asker most wants. A matching type earns half a relevance level, never a filter.
const INTENTS = {
  decision: "why something was chosen, ruled out or left open",
  attention: "open loops, risks, or things still to verify",
  note: "how something works, or reference knowledge",
  journal: "what happened and when",
  any: "no particular kind of file",
};
const INTENT_BONUS = 0.5;

/**
 * @template {{ type: string, title: string, snippet?: string }} H
 * @param {{ jev: { decide: Function }, queries: string[], hits: H[] }} o
 * @returns {Promise<{ ok: boolean, intent?: string, hits: Array<H & { relevance?: number }> }>}
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
  state.intent = "what kind of file the asker wants";
  questions.intent = choice("Which kind of file would best answer `query`? Answer any unless the wording clearly points at one kind.", INTENTS);
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
  const wanted = pick(r?.answers?.intent);
  const intent = wanted && wanted !== "any" && wanted in INTENTS ? wanted : null;
  const key = (h) => (h.relevance ?? 1.5) + (intent && String(h.type).toLowerCase() === intent ? INTENT_BONUS : 0);
  const ranked = hits.map((h, i) => ({ ...h, ...(i < rel.length && rel[i] != null ? { relevance: rel[i] } : {}), _i: i }));
  ranked.sort((a, b) => key(b) - key(a) || a._i - b._i);
  return { ok: true, ...(intent ? { intent } : {}), hits: ranked.map(({ _i, ...h }) => h) };
}
