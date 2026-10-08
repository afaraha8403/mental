/**
 * Jev (TypeSafe System One) — OPTIONAL typed-judgment gate.
 *
 * Mental works fully without it. With a key it can gate fuzzy-search candidates,
 * flag near-duplicates, and score link suggestions. Jev answers yes/no probabilities;
 * it never generates text, and nothing here writes on its answer.
 *
 * Rules: fail open, short timeout, never print the key, never block a write.
 * Key: config first (`mental option jev key`), env fallback (MENTAL_JEV_KEY, TYPESAFE_API_KEY).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, resolveJev } from "./config.mjs";
import { cacheMentalDir } from "./watermark.mjs";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
/** Pinned so scores stay comparable. Override with MENTAL_JEV_MODEL. */
export const JEV_MODEL = "jev-latest";
export const JEV_SIGNUP_URL = "https://typesafe.ai";

/** Probability cut-offs. One place so they can be tuned without touching call sites. */
export const THRESHOLDS = {
  /** Search: keep a fuzzy candidate. Low on purpose; gates over-admit then rank. */
  relevant: 0.5,
  /** Write: flag as "similar to". */
  similar: 0.7,
  /** Link: propose as a link. Calibrated live: genuine links score ~0.75-0.8, unrelated files stay under 0.2. */
  link: 0.75,
  /** Secret guard: high bar so a mention of "password" never raises an alarm. */
  secret: 0.9,
  /** Link: show as "maybe". Below this is silent. */
  linkMaybe: 0.5,
  /** Choice/Score: minimum model confidence before an answer is acted on or shown as a pick. */
  pick: 0.5,
};

/** Request budget, in estimated tokens. Docs: 64K per request, 32K for state + longest question. */
const TOTAL_TOKENS_MAX = 48_000;
const STATE_TOKENS_MAX = 24_000;
const RETRY_WAIT_MAX_MS = 1500;
const USAGE_DAYS = 30;

/** Reminder cadence for an unconfigured Jev. */
export const HINT_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

const CACHE_FILE = "jev-cache.json";
const HINT_FILE = "jev-hint.json";
const USAGE_FILE = "jev-usage.json";
const CACHE_MAX = 500;
const BATCH_MAX = 25;

let authScheme = /** @type {"bearer" | "raw"} */ ("bearer");

/**
 * @param {string | null} home
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fetch?: typeof fetch, url?: string, timeoutMs?: number, backoffMs?: number }} [opts]
 * @returns {{ ask: Function, gate: Function, source: string } | null} null when Jev is off or unkeyed
 */
export function getJev(home, env = process.env, opts = {}) {
  const r = resolveJev(home, env);
  if (!r.key) return null;
  const key = r.key;
  const url = opts.url || env.MENTAL_JEV_URL || JEV_URL;
  const model = env.MENTAL_JEV_MODEL || JEV_MODEL;
  const doFetch = opts.fetch || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const backoffMs = opts.backoffMs ?? 250;
  const cfg = home ? loadConfig(home) : null;
  const dailyTokens = cfg && !cfg.corrupt ? cfg.jev.dailyTokens : null;
  const ctx = { key, url, model, doFetch, timeoutMs, backoffMs, home, env, dailyTokens };
  return {
    source: r.source || "config",
    ask: (state, questions) => askJev(ctx, state, questions),
    decide: (state, questions) => decide(ctx, state, questions),
    gate: (state, questions) => gateNoul(ctx, state, questions),
  };
}

/** @param {string} instructions @param {{ true?: string, false?: string }} [criteria] */
export function noul(instructions, criteria) {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

/** @param {string} instructions @param {Record<string, string | null>} criteria option → description */
export function choice(instructions, criteria) {
  return { type: "choice", instructions, criteria };
}

/** @param {string} instructions @param {string[]} levels lowest first (2-10) */
export function score(instructions, levels) {
  return { type: "score", instructions, criteria: levels };
}

/**
 * One answer in a provider-neutral shape. Noul has no model confidence, so it is derived
 * from the probability (0 at a coin flip, 1 when certain). Null when the answer is malformed.
 * @param {any} raw
 * @param {"noul" | "choice" | "score"} type
 */
export function normalize(raw, type) {
  if (!raw || typeof raw !== "object") return null;
  const conf = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (type === "noul") {
    const p = raw.noul;
    if (typeof p !== "number" || !Number.isFinite(p)) return null;
    return { type, p, confidence: Math.abs(2 * p - 1) };
  }
  if (type === "choice") {
    if (typeof raw.choice !== "string") return null;
    return { type, choice: raw.choice, probabilities: raw.probabilities || {}, confidence: conf(raw.confidence) };
  }
  if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return null;
  return { type, score: raw.score, legend: raw.legend ?? null, probabilities: raw.probabilities || {}, confidence: conf(raw.confidence) };
}

/**
 * The chosen option only when the model is confident enough, else null.
 * @param {{ choice?: string, confidence?: number | null } | null | undefined} answer
 */
export function pick(answer, minConfidence = THRESHOLDS.pick) {
  if (!answer || typeof answer.choice !== "string") return null;
  return typeof answer.confidence === "number" && answer.confidence >= minConfidence ? answer.choice : null;
}

/** Rough token estimate; deliberately pessimistic so requests stay under the documented limits. */
export function estTokens(x) {
  const s = typeof x === "string" ? x : JSON.stringify(x ?? "");
  return Math.ceil(s.length / 3.5);
}

/** @param {{ headers?: { get?: (n: string) => string | null } }} res */
function retryAfterMs(res) {
  try {
    const ms = Number(res.headers?.get?.("retry-after-ms"));
    if (Number.isFinite(ms) && ms >= 0) return ms;
    const s = Number(res.headers?.get?.("retry-after"));
    if (Number.isFinite(s) && s >= 0) return s * 1000;
  } catch {
    // header unreadable → default backoff
  }
  return null;
}

/** @param {number} [now] */
function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Local usage ledger (tokens by day). Rebuildable; never contains content.
 * @param {string | null} home
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ model: string | null, days: Record<string, { requests: number, input: number, output: number }> }}
 */
export function readUsage(home, env = process.env) {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(home, env, USAGE_FILE), "utf8"));
    if (parsed && typeof parsed.days === "object") return { model: parsed.model || null, days: parsed.days };
  } catch {
    // none yet
  }
  return { model: null, days: {} };
}

/** @param {string | null} home @param {NodeJS.ProcessEnv} [env] @param {number} [now] */
export function usageToday(home, env = process.env, now = Date.now()) {
  return readUsage(home, env).days[dayKey(now)] || { requests: 0, input: 0, output: 0 };
}

function recordUsage(ctx, usage, model) {
  try {
    const u = readUsage(ctx.home, ctx.env);
    const k = dayKey();
    const day = u.days[k] || { requests: 0, input: 0, output: 0 };
    day.requests += 1;
    day.input += Number(usage?.input_tokens) || 0;
    day.output += Number(usage?.output_tokens) || 0;
    u.days[k] = day;
    for (const old of Object.keys(u.days).sort().slice(0, -USAGE_DAYS)) delete u.days[old];
    mkdirSync(cacheMentalDir(ctx.home, ctx.env), { recursive: true });
    writeFileSync(cacheFile(ctx.home, ctx.env, USAGE_FILE), JSON.stringify({ model: model || u.model, days: u.days }));
  } catch {
    // ledger is best-effort
  }
}

/**
 * One System One request. Never throws.
 * @returns {Promise<{ ok: true, answers: Record<string, any>, model: string | null } | { ok: false, reason: string }>}
 */
async function askJev(ctx, state, questions) {
  if (typeof ctx.doFetch !== "function") return { ok: false, reason: "no-fetch" };
  if (ctx.dailyTokens && usageToday(ctx.home, ctx.env).input >= ctx.dailyTokens) return { ok: false, reason: "budget" };
  const body = JSON.stringify({ state, model: ctx.model, questions });
  let scheme = authScheme;
  let triedOther = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ctx.timeoutMs);
    try {
      const res = await ctx.doFetch(ctx.url, {
        method: "POST",
        headers: {
          Authorization: scheme === "bearer" ? `Bearer ${ctx.key}` : ctx.key,
          "Content-Type": "application/json",
        },
        body,
        signal: ac.signal,
      });
      if (res.status === 401 && !triedOther) {
        // Docs mask the header value; accept either scheme and remember the winner.
        triedOther = true;
        scheme = scheme === "bearer" ? "raw" : "bearer";
        attempt--;
        continue;
      }
      if (res.status === 401) return { ok: false, reason: "auth" };
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        if (attempt < 2) {
          await sleep(Math.min(retryAfterMs(res) ?? ctx.backoffMs * 2 ** attempt, RETRY_WAIT_MAX_MS));
          continue;
        }
        return { ok: false, reason: `http-${res.status}` };
      }
      if (!res.ok) return { ok: false, reason: `http-${res.status}` };
      const json = await res.json();
      authScheme = scheme;
      if (!json || typeof json.answers !== "object") return { ok: false, reason: "bad-response" };
      recordUsage(ctx, json.usage, json.model);
      return { ok: true, answers: json.answers, model: typeof json.model === "string" ? json.model : null };
    } catch (err) {
      const aborted = err && typeof err === "object" && /** @type {{ name?: string }} */ (err).name === "AbortError";
      if (attempt < 2 && !aborted) {
        await sleep(ctx.backoffMs * 2 ** attempt);
        continue;
      }
      return { ok: false, reason: aborted ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: "network" };
}

/**
 * Typed questions sharing one state, in as few requests as the limits allow.
 * Answers are cached by (state, question, model); a new model version drops the cache.
 *
 * @param {Record<string, { type: "noul" | "choice" | "score", instructions: string, criteria?: any }>} questions
 * @returns {Promise<{ ok: boolean, reason?: string, answers: Record<string, ReturnType<typeof normalize>> }>}
 */
async function decide(ctx, state, questions) {
  const ids = Object.keys(questions);
  /** @type {Record<string, ReturnType<typeof normalize>>} */
  const answers = Object.fromEntries(ids.map((id) => [id, null]));
  if (ids.length === 0) return { ok: true, answers };

  const stateTokens = estTokens(state);
  const longest = Math.max(...ids.map((id) => estTokens(questions[id])));
  if (stateTokens + longest > STATE_TOKENS_MAX) return { ok: false, reason: "too-large", answers };

  const cache = readCache(ctx.home, ctx.env);
  const stateHash = hash(JSON.stringify(state));
  const keyOf = (id) => hash(`${stateHash}|${JSON.stringify(questions[id])}`);
  /** @type {string[]} */
  const missing = [];
  for (const id of ids) {
    const hit = cache.items[keyOf(id)];
    if (hit && typeof hit === "object" && hit.type === questions[id].type) answers[id] = hit;
    else missing.push(id);
  }
  if (missing.length === 0) return { ok: true, answers };

  let failed = null;
  let i = 0;
  while (i < missing.length) {
    const slice = [];
    let tokens = stateTokens;
    while (i < missing.length && slice.length < BATCH_MAX) {
      const t = estTokens(questions[missing[i]]);
      if (slice.length > 0 && tokens + t > TOTAL_TOKENS_MAX) break;
      slice.push(missing[i]);
      tokens += t;
      i++;
    }
    const r = await askJev(ctx, state, Object.fromEntries(slice.map((id) => [id, questions[id]])));
    if (!r.ok) {
      failed = r.reason;
      break;
    }
    if (r.model && cache.model && r.model !== cache.model) cache.items = {};
    if (r.model) cache.model = r.model;
    for (const id of slice) {
      const a = normalize(r.answers?.[id], questions[id].type);
      if (a) {
        answers[id] = a;
        cache.items[keyOf(id)] = a;
      }
    }
  }
  writeCache(ctx.home, ctx.env, cache);
  return failed ? { ok: false, reason: failed, answers } : { ok: true, answers };
}

/**
 * Yes/no gate over many questions that share one state.
 * @param {Record<string, string>} questions id → yes/no instructions
 * @returns {Promise<{ ok: boolean, reason?: string, scores: Record<string, number | null> }>}
 */
async function gateNoul(ctx, state, questions) {
  const specs = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, noul(q)]));
  const r = await decide(ctx, state, specs);
  const scores = Object.fromEntries(
    Object.entries(r.answers).map(([id, a]) => [id, a && a.type === "noul" ? a.p : null]),
  );
  return r.ok ? { ok: true, scores } : { ok: false, reason: r.reason, scores };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} s */
export function hash(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function cacheFile(home, env, name) {
  return join(cacheMentalDir(home, env), name);
}

/** Rebuildable; deleting it loses nothing. */
function readCache(home, env) {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(home, env, CACHE_FILE), "utf8"));
    if (parsed && typeof parsed.items === "object") return { model: parsed.model || null, items: parsed.items };
  } catch {
    // missing or corrupt → empty
  }
  return { model: null, items: {} };
}

function writeCache(home, env, cache) {
  try {
    const keys = Object.keys(cache.items);
    if (keys.length > CACHE_MAX) {
      for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete cache.items[k];
    }
    mkdirSync(cacheMentalDir(home, env), { recursive: true });
    writeFileSync(cacheFile(home, env, CACHE_FILE), JSON.stringify(cache));
  } catch {
    // cache is best-effort
  }
}

/**
 * @typedef {{
 *   optional: true,
 *   configured: false,
 *   text: string,
 *   enable: string,
 *   mute: string,
 *   url: string,
 *   agent: string,
 * }} JevHint
 */

/**
 * Rate-limited reminder that Jev exists. Null when configured, muted, or not due.
 * `consume` stamps the surface so the same hint is not repeated until the cadence elapses.
 * Never call from dashboard polling.
 *
 * @param {{ home: string | null, env?: NodeJS.ProcessEnv, surface: "heartbeat" | "search", now?: number, consume?: boolean }} o
 * @returns {JevHint | null}
 */
export function jevHint({ home, env = process.env, surface, now = Date.now(), consume = true }) {
  if (!home) return null;
  if (env.MENTAL_NO_HINTS === "1") return null;
  const cfg = loadConfig(home);
  if (cfg.corrupt || cfg.jev.enabled === false) return null;
  if (resolveJev(home, env).configured) return null;

  const file = cacheFile(home, env, HINT_FILE);
  /** @type {Record<string, number>} */
  let state = {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object") state = parsed;
  } catch {
    // first time
  }
  const last = Number(state[surface]);
  if (Number.isFinite(last) && now - last < HINT_EVERY_MS) return null;

  if (consume) {
    try {
      mkdirSync(cacheMentalDir(home, env), { recursive: true });
      writeFileSync(file, JSON.stringify({ ...state, [surface]: now }));
    } catch {
      // cannot record → stay quiet rather than nag on every call
      return null;
    }
  }
  return {
    optional: true,
    configured: false,
    text:
      "Optional: Jev (TypeSafe) is not set up. With a key, search recovers mis-worded queries, writes flag near-duplicates, and show suggests links. Mental works fully without it.",
    enable: "mental option jev key <KEY>",
    mute: "mental option jev off",
    url: JEV_SIGNUP_URL,
    agent:
      "Tell the user this exists and where to get a key. Do not sign up, set a key, or enable it yourself.",
  };
}

/** @param {JevHint} h */
export function formatJevHint(h) {
  return `${h.text} Key: ${h.url} → ${h.enable} (or env MENTAL_JEV_KEY). Mute: ${h.mute}. Agents: relay this to the user; do not enable it yourself.`;
}
