/**
 * Fail-open npm update check. Live `npm view` is not on the heartbeat hot path:
 * commands read a 7-day cache and only refresh when it is missing or stale.
 * `MENTAL_SKIP_UPDATE_CHECK=1` skips. `MENTAL_NPM_LATEST` pins a version (tests).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { NAME, PKG_ROOT, VERSION } from "./pkg.mjs";
import { cacheMentalDir } from "./watermark.mjs";

export const UPDATE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const UPDATE_REFRESH_TIMEOUT_MS = 1200;

/**
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function cmpSemver(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/** True when running from a git checkout (not the published tarball). */
export function isDevCheckout() {
  return existsSync(join(PKG_ROOT, ".git"));
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function skipUpdateCheck(env = process.env) {
  const v = env.MENTAL_SKIP_UPDATE_CHECK;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function updateCachePath(env = process.env) {
  const home = env.HOME || env.USERPROFILE;
  if (!home) return null;
  return join(cacheMentalDir(home, env), "npm-latest.json");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ latest: string, checkedAt: string } | null}
 */
export function readUpdateCache(env = process.env) {
  const file = updateCachePath(env);
  if (!file || !existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.latest !== "string") return null;
    if (!/^\d+\.\d+\.\d+/.test(parsed.latest)) return null;
    if (typeof parsed.checkedAt !== "string" || !parsed.checkedAt) return null;
    return { latest: parsed.latest.split(/\s+/)[0], checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} latest
 * @param {number} [now]
 */
export function writeUpdateCache(env, latest, now = Date.now()) {
  const file = updateCachePath(env);
  if (!file || !latest) return null;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const checkedAt = new Date(now).toISOString();
    writeFileSync(file, `${JSON.stringify({ latest, checkedAt })}\n`);
    return { latest, checkedAt, path: file };
  } catch {
    return null;
  }
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, name?: string, timeoutMs?: number, cache?: boolean, now?: number }} [opts]
 * @returns {{ skipped: boolean, latest: string | null }}
 */
export function checkForUpdate(opts = {}) {
  const env = opts.env ?? process.env;
  if (skipUpdateCheck(env)) return { skipped: true, latest: null };
  const pinned = env.MENTAL_NPM_LATEST;
  let latest = null;
  if (typeof pinned === "string" && /^\d+\.\d+\.\d+/.test(pinned.trim())) {
    latest = pinned.trim().split(/\s+/)[0];
  } else {
    const name = opts.name ?? NAME;
    const timeout = opts.timeoutMs ?? 5000;
    const r = spawnSync("npm", ["view", name, "version"], {
      encoding: "utf8",
      env,
      timeout,
    });
    if (r.status !== 0) return { skipped: false, latest: null };
    const v = (r.stdout || "").trim().split(/\s+/)[0];
    if (!/^\d+\.\d+\.\d+/.test(v)) return { skipped: false, latest: null };
    latest = v;
  }
  if (latest && opts.cache !== false) writeUpdateCache(env, latest, opts.now);
  return { skipped: false, latest };
}

/**
 * @param {string} current
 * @param {string} latest
 * @param {string} [pkg]
 */
export function updateHint(current, latest, pkg = NAME) {
  return `CLI ${current}; npm ${latest}. Run \`mental install\` or \`npm i -g --force ${pkg}\`.`;
}

/**
 * Cheap notice for every CLI/MCP envelope. Reads the 7-day cache; refreshes only
 * when missing or stale (short timeout, fail open). Null when current or skipped.
 *
 * @param {{ env?: NodeJS.ProcessEnv, version?: string, now?: number, ttlMs?: number, timeoutMs?: number }} [opts]
 * @returns {{ current: string, latest: string, hint: string } | null}
 */
export function peekUpdateNotice(opts = {}) {
  const env = opts.env ?? process.env;
  if (skipUpdateCheck(env)) return null;
  const current = opts.version ?? VERSION;
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? UPDATE_CACHE_TTL_MS;
  const cached = readUpdateCache(env);
  const checked = cached ? Date.parse(cached.checkedAt) : NaN;
  const age = Number.isFinite(checked) ? now - checked : Infinity;
  const stale = !cached || age < 0 || age > ttl;
  let latest = cached?.latest ?? null;
  if (stale) {
    const upd = checkForUpdate({
      env,
      timeoutMs: opts.timeoutMs ?? UPDATE_REFRESH_TIMEOUT_MS,
      now,
    });
    if (upd.latest) latest = upd.latest;
  }
  if (!latest) return null;
  if (cmpSemver(latest, current) <= 0) return null;
  return { current, latest, hint: updateHint(current, latest) };
}
