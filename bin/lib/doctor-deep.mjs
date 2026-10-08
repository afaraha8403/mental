/**
 * Jev-assisted `mental doctor` checks. Everything here is advisory (warn-level) and fails open:
 * no key, no network, a spent budget or a bad answer means "no extra checks", never a doctor failure.
 *
 * Shape of every check: a free pre-filter picks a few candidates, one Jev question per candidate
 * shares a single state, and only confident answers (`pick` / THRESHOLDS) become a finding.
 */
import { listConcepts } from "./index.mjs";
import { latestJournalHandoff } from "./okf.mjs";
import { scanStale } from "./stale.mjs";
import { THRESHOLDS, choice, noul, pick, usageToday } from "./jev.mjs";
import { sigTokens } from "./jev-assist.mjs";

const MAX_ITEMS = 8;
const MAX_PAIRS = 8;
const MAX_TAGS = 25;
const MIN_TAG_FILES = 3;
const BODY_CHARS = 400;
const TITLES_IN_CONTEXT = 12;

/** Loose pre-filter only. A hit means "worth asking", never "is a secret". */
const SECRETISH = /(api[_ -]?key|secret|token|passw(or)?d|bearer|credential|private key|BEGIN [A-Z ]*KEY|\bsk-[A-Za-z0-9]|\bgh[pousr]_|AKIA[0-9A-Z]{8})/i;

/** @param {string} s */
function oneLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/** Long opaque runs are what a credential looks like. They never leave the machine. */
function redact(s) {
  return oneLine(s)
    .replace(/-----BEGIN[\s\S]*?(-----END[^-]*-----|$)/g, "[REDACTED]")
    .replace(/\b(sk|gh[pousr]|xox[bap]|AKIA)[-_A-Za-z0-9]{8,}/g, "[REDACTED]")
    .replace(/[A-Za-z0-9+/_=-]{24,}/g, "[REDACTED]");
}

/** @param {{ title: string, description?: string, body: string }} c */
function brief(c) {
  return {
    title: c.title,
    description: c.description || undefined,
    excerpt: oneLine(c.body).slice(0, BODY_CHARS) || undefined,
  };
}

/** @param {Array<{ path: string, title: string }>} items */
function sample(items, n = 3) {
  const names = items.slice(0, n).map((i) => i.title || i.path);
  return names.join(", ") + (items.length > n ? `, +${items.length - n}` : "");
}

/**
 * @param {string} id
 * @param {boolean} ok
 * @param {string} message
 * @param {"info" | "warn"} [level]
 */
function mk(id, ok, message, level = "warn") {
  return { id, ok, level: ok ? "info" : level, message };
}

/** @param {{ decide: Function }} jev @param {object} state @param {Record<string, any>} questions */
async function ask(jev, state, questions) {
  try {
    return await jev.decide(state, questions);
  } catch {
    return { ok: false, reason: "error", answers: {} };
  }
}

/** Stale open attention/decisions: still relevant, or resolved/obsolete by now? */
async function staleTriage(jev, root, days, context) {
  const stale = scanStale(root, { days });
  const all = [...stale.attention, ...stale.decisions].slice(0, MAX_ITEMS);
  if (all.length === 0) return { ran: false, checks: [] };
  const byPath = new Map(listConcepts(root).map((c) => [c.path, c]));
  const items = {};
  const questions = {};
  all.forEach((s, i) => {
    const c = byPath.get(s.path);
    items[`s${i}`] = { status: s.status, ...(c ? brief(c) : { title: s.title }) };
    questions[`s${i}`] = choice(
      `Given \`recent\`, what is the state of \`items.s${i}\`?`,
      {
        relevant: "still open and still needs attention",
        resolved: "the recent work shows it was already done or answered",
        obsolete: "no longer applies; the plan or code moved on",
      },
    );
  });
  const r = await ask(jev, { items, recent: context }, questions);
  const done = [];
  all.forEach((s, i) => {
    const a = r.answers[`s${i}`];
    const verdict = a ? pick(a) : null;
    if (verdict === "resolved" || verdict === "obsolete") done.push({ ...s, verdict });
  });
  const checks = done.length
    ? [mk("jev-stale", false, `${done.length} of ${all.length} stale item(s) look resolved or obsolete (${sample(done)}). Close or supersede them.`)]
    : [];
  return { ran: true, r, checks };
}

/** Decision log: pairs that share vocabulary and may contradict or supersede each other. */
async function decisionConflicts(jev, root) {
  const decisions = listConcepts(root).filter((c) => c.type === "Decision" && c.status !== "superseded");
  if (decisions.length < 2) return { ran: false, checks: [] };
  const toks = decisions.map((d) => new Set(sigTokens(`${d.title} ${d.description}`)));
  const scored = [];
  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      let shared = 0;
      for (const t of toks[i]) if (toks[j].has(t)) shared++;
      if (shared >= 2) scored.push({ i, j, shared });
    }
  }
  scored.sort((a, b) => b.shared - a.shared);
  const pairs = scored.slice(0, MAX_PAIRS);
  if (pairs.length === 0) return { ran: false, checks: [] };
  const state = { pairs: Object.fromEntries(pairs.map((p, k) => [`p${k}`, { a: brief(decisions[p.i]), b: brief(decisions[p.j]) }])) };
  const questions = Object.fromEntries(
    pairs.map((_, k) => [
      `p${k}`,
      noul(`Do \`pairs.p${k}.a\` and \`pairs.p${k}.b\` contradict each other, or does one replace the other? Answer no if they only cover related topics.`),
    ]),
  );
  const r = await ask(jev, state, questions);
  const hits = pairs
    .map((p, k) => ({ p, s: r.answers[`p${k}`]?.p }))
    .filter((x) => typeof x.s === "number" && x.s >= THRESHOLDS.similar);
  const checks = hits.length
    ? [
        mk(
          "jev-decisions",
          false,
          `${hits.length} decision pair(s) may conflict or overlap (${hits
            .slice(0, 2)
            .map((h) => `"${decisions[h.p.i].title}" vs "${decisions[h.p.j].title}"`)
            .join("; ")}). Supersede one with \`mental decide\`.`,
        ),
      ]
    : [];
  return { ran: true, r, checks };
}

/** Latest journal handoff: does it give the next agent an exact resume point? */
async function handoffQuality(jev, root) {
  let h;
  try {
    h = latestJournalHandoff(root);
  } catch {
    return { ran: false, checks: [] };
  }
  if (!h.file) return { ran: false, checks: [] };
  if (!h.resume) {
    return { ran: false, checks: [mk("jev-handoff", false, `latest handoff (${h.file}) has no Resume: line, so the next session cannot pick up exactly.`)] };
  }
  const state = { handoff: { outcome: h.outcome || undefined, resume: h.resume, against: h.against || undefined } };
  const questions = {
    quality: choice("How precisely does `handoff.resume` tell a fresh engineer where to continue?", {
      exact: "names a concrete next step: a file, command, test, or decision to act on",
      vague: "points at an area or a goal but not a concrete next step",
      missing: "says nothing actionable",
    }),
  };
  const r = await ask(jev, state, questions);
  const verdict = r.answers.quality ? pick(r.answers.quality) : null;
  const checks =
    verdict === "vague" || verdict === "missing"
      ? [mk("jev-handoff", false, `latest handoff Resume line is ${verdict}: "${oneLine(h.resume).slice(0, 80)}". Name the file, command or next step.`)]
      : [];
  return { ran: true, r, checks };
}

/** Untagged files: propose an existing topic tag (never writes it). */
async function untaggedTopics(jev, root) {
  const concepts = listConcepts(root).filter((c) => c.type !== "Journal");
  const counts = new Map();
  for (const c of concepts) for (const t of c.tags) counts.set(t, (counts.get(t) || 0) + 1);
  // A topic needs a few files behind it; a one-off tag is noise Jev would be forced to pick.
  const vocab = [...counts.entries()]
    .filter(([, n]) => n >= MIN_TAG_FILES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS)
    .map(([t]) => t);
  const untagged = concepts.filter((c) => c.tags.length === 0).slice(0, MAX_ITEMS);
  if (vocab.length === 0 || untagged.length === 0) return { ran: false, checks: [] };
  const criteria = Object.fromEntries([...vocab.map((t) => [t, null]), ["none", "no listed topic fits"]]);
  const state = { files: Object.fromEntries(untagged.map((c, i) => [`u${i}`, brief(c)])) };
  const questions = Object.fromEntries(
    untagged.map((_, i) => [`u${i}`, choice(`Which topic fits \`files.u${i}\` best?`, criteria)]),
  );
  const r = await ask(jev, state, questions);
  const hits = untagged
    .map((c, i) => ({ c, tag: r.answers[`u${i}`] ? pick(r.answers[`u${i}`], THRESHOLDS.similar) : null }))
    .filter((x) => x.tag && x.tag !== "none");
  const checks = hits.length
    ? [mk("jev-untagged", false, `topic suggestions: ${hits.slice(0, 3).map((h) => `${h.c.title} -> ${h.tag}`).join(", ")}${hits.length > 3 ? `, +${hits.length - 3}` : ""}. Add with --tag on an update.`)]
    : [];
  return { ran: true, r, checks };
}

/** Notes that mention credentials: redacted before they are sent, and the findings name paths only. */
async function secretGuard(jev, root) {
  const cand = listConcepts(root)
    .filter((c) => SECRETISH.test(`${c.title}\n${c.description}\n${c.body}`))
    .slice(0, MAX_ITEMS);
  if (cand.length === 0) return { ran: false, checks: [] };
  const state = {
    files: Object.fromEntries(
      cand.map((c, i) => [`f${i}`, { title: redact(c.title), excerpt: redact(`${c.description} ${c.body}`).slice(0, BODY_CHARS) }]),
    ),
  };
  const questions = Object.fromEntries(
    cand.map((_, i) => [
      `f${i}`,
      noul(`Does \`files.f${i}\` look like it records an actual credential, key, password or private personal data (redacted values count)? Answer no if it only discusses secrets in general.`),
    ]),
  );
  const r = await ask(jev, state, questions);
  const hits = cand.filter((_, i) => {
    const s = r.answers[`f${i}`]?.p;
    return typeof s === "number" && s >= THRESHOLDS.secret;
  });
  const checks = hits.length
    ? [mk("jev-secrets", false, `${hits.length} file(s) may hold a credential or private data (${hits.slice(0, 3).map((c) => c.path).join(", ")}${hits.length > 3 ? `, +${hits.length - 3}` : ""}). Remove it and rotate the key.`)]
    : [];
  return { ran: true, r, checks };
}

/** @param {string | undefined} reason */
function failure(reason) {
  switch (reason) {
    case "auth":
      return "key rejected (check `mental option jev status`)";
    case "budget":
      return "daily token budget reached; content checks skipped";
    case "timeout":
    case "network":
      return "unreachable; content checks skipped";
    case "too-large":
      return "bundle context too large to check";
    default:
      return reason ? `unavailable (${reason}); content checks skipped` : "unavailable";
  }
}

/**
 * @param {{ jev: { source: string, decide: Function } | null, home: string | null, env?: NodeJS.ProcessEnv,
 *   root: string | null, slice: boolean, days: number }} o
 *   `slice` false means the personal slice, which is never sent to a model.
 * @returns {Promise<Array<{ id: string, ok: boolean, level: string, message: string }>>}
 */
export async function deepChecks({ jev, home, env = process.env, root, slice, days }) {
  if (!jev) return [];
  const checks = [];
  if (!root || !slice) {
    checks.push(mk("jev", true, `on (${jev.source}); personal notes are never sent to a model`, "info"));
    return checks;
  }
  const recent = {
    latestHandoff: (() => {
      try {
        const h = latestJournalHandoff(root);
        return { outcome: h.outcome || undefined, resume: h.resume || undefined };
      } catch {
        return {};
      }
    })(),
    recentTitles: listConcepts(root)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, TITLES_IN_CONTEXT)
      .map((c) => c.title),
  };
  const runs = await Promise.all([
    staleTriage(jev, root, days, recent),
    decisionConflicts(jev, root),
    handoffQuality(jev, root),
    untaggedTopics(jev, root),
    secretGuard(jev, root),
  ]);
  const failed = runs.map((x) => x.r).find((r) => r && !r.ok);
  const asked = runs.filter((x) => x.ran).length;
  for (const x of runs) checks.push(...x.checks);
  const spent = home ? usageToday(home, env).input : 0;
  const spentNote = spent > 0 ? `, ${spent} tokens today` : "";
  if (failed) checks.unshift(mk("jev", false, failure(failed.reason)));
  else checks.unshift(mk("jev", true, `on (${jev.source}); ${asked} content check(s) ran${spentNote}`, "info"));
  return checks;
}
