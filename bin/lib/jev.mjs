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
  /** Link: propose as a link. */
  link: 0.9,
  /** Link: show as "maybe". Below this is silent. */
  linkMaybe: 0.5,
};

/** Reminder cadence for an unconfigured Jev. */
export const HINT_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

const CACHE_FILE = "jev-cache.json";
const HINT_FILE = "jev-hint.json";
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
  const ctx = { key, url, model, doFetch, timeoutMs, backoffMs };
  return {
    source: r.source || "config",
    ask: (state, questions) => askJev(ctx, state, questions),
    gate: (state, questions) => gateNoul(ctx, home, env, state, questions),
  };
}

/**
 * One System One request. Never throws.
 * @returns {Promise<{ ok: true, answers: Record<string, any> } | { ok: false, reason: string }>}
 */
async function askJev(ctx, state, questions) {
  if (typeof ctx.doFetch !== "function") return { ok: false, reason: "no-fetch" };
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
          await sleep(ctx.backoffMs * 2 ** attempt);
          continue;
        }
        return { ok: false, reason: `http-${res.status}` };
      }
      if (!res.ok) return { ok: false, reason: `http-${res.status}` };
      const json = await res.json();
      authScheme = scheme;
      if (!json || typeof json.answers !== "object") return { ok: false, reason: "bad-response" };
      return { ok: true, answers: json.answers };
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
 * Batch Noul questions that share one state. Cached by (state, instructions).
 * @param {Record<string, string>} questions id → yes/no instructions
 * @returns {Promise<{ ok: boolean, reason?: string, scores: Record<string, number | null> }>}
 */
async function gateNoul(ctx, home, env, state, questions) {
  const ids = Object.keys(questions);
  /** @type {Record<string, number | null>} */
  const scores = Object.fromEntries(ids.map((id) => [id, null]));
  if (ids.length === 0) return { ok: true, scores };

  const cache = readCache(home, env);
  const stateHash = hash(JSON.stringify(state));
  /** @type {string[]} */
  const missing = [];
  for (const id of ids) {
    const k = hash(`${stateHash}|${questions[id]}`);
    if (typeof cache.items[k] === "number") scores[id] = cache.items[k];
    else missing.push(id);
  }
  if (missing.length === 0) return { ok: true, scores };

  let failed = null;
  for (let i = 0; i < missing.length; i += BATCH_MAX) {
    const slice = missing.slice(i, i + BATCH_MAX);
    const qs = Object.fromEntries(slice.map((id) => [id, { type: "noul", instructions: questions[id] }]));
    const r = await askJev(ctx, state, qs);
    if (!r.ok) {
      failed = r.reason;
      break;
    }
    for (const id of slice) {
      const p = r.answers?.[id]?.noul;
      if (typeof p === "number" && Number.isFinite(p)) {
        scores[id] = p;
        cache.items[hash(`${stateHash}|${questions[id]}`)] = p;
      }
    }
  }
  writeCache(home, env, cache);
  return failed ? { ok: false, reason: failed, scores } : { ok: true, scores };
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
    if (parsed && typeof parsed.items === "object") return { items: parsed.items };
  } catch {
    // missing or corrupt → empty
  }
  return { items: {} };
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
