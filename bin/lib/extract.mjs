/**
 * Meeting-dump extraction. A decision model sorts each sentence of pasted notes or a transcript into
 * action / decision / concern / fact / noise. Only the confident action, decision and concern lines are
 * proposed as residue; the raw text is never stored and nothing is written without `--apply`.
 */
import { THRESHOLDS, choice, pick } from "./jev.mjs";
import { oneLine, redact } from "./jev-assist.mjs";

export const MAX_LINES = 60;
const MIN_CHARS = 20;
const MAX_CHARS = 300;
const TITLE_CHARS = 80;

export const KINDS = {
  action: "someone has to do something, or a next step was agreed",
  decision: "a choice was made or a direction settled",
  concern: "a risk, blocker, worry or open problem was raised",
  fact: "information worth knowing that needs no follow-up",
  noise: "greeting, filler, scheduling chatter or anything else not worth keeping",
};

/** What each kept kind becomes on `--apply`. */
export const TARGET = {
  action: { type: "attention", kind: "thread" },
  concern: { type: "attention", kind: "concern" },
  decision: { type: "decision", kind: "open" },
};

/**
 * Sentence-sized lines from free text, speaker labels and bullets removed.
 * @param {string} text
 */
export function splitLines(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || "").split(/\r?\n+/)) {
    const line = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
      .replace(/^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?[A-Z][\w .'-]{0,24}:\s+/, "")
      .trim();
    for (const piece of line.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)) {
      const s = piece.trim();
      if (s.length < MIN_CHARS) continue;
      const clipped = s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s;
      const key = clipped.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clipped);
    }
  }
  return out;
}

/**
 * @param {{ jev: { decide: Function }, text: string }} o
 * @returns {Promise<{ ok: boolean, reason?: string, lines: number, considered: number, proposals: Array<{ kind: string, text: string, title: string, confidence: number }>, skipped: number }>}
 */
export async function extractResidue({ jev, text }) {
  const all = splitLines(text);
  const lines = all.slice(0, MAX_LINES);
  const out = { ok: true, lines: all.length, considered: lines.length, proposals: [], skipped: 0 };
  if (lines.length === 0) return out;
  const state = { lines: Object.fromEntries(lines.map((l, i) => [`s${i}`, redact(l)])) };
  const questions = Object.fromEntries(
    lines.map((_, i) => [`s${i}`, choice(`What does \`lines.s${i}\` contribute to someone continuing this work later? Prefer noise when unsure.`, KINDS)]),
  );
  const r = await jev.decide(state, questions);
  if (!r.ok && Object.values(r.answers).every((a) => a == null)) return { ...out, ok: false, reason: r.reason || "unavailable" };
  for (const [i, l] of lines.entries()) {
    const a = r.answers[`s${i}`];
    const kind = a ? pick(a, THRESHOLDS.similar) : null;
    if (!kind || !(kind in TARGET)) {
      out.skipped++;
      continue;
    }
    const clean = redact(l);
    out.proposals.push({ kind, text: clean, title: oneLine(clean).slice(0, TITLE_CHARS), confidence: a.confidence });
  }
  return out;
}
