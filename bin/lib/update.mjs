/**
 * Fail-open npm update check. Live `npm view` is not on the heartbeat hot path.
 *
 * Discovery TTL (24h) applies when the cache says this CLI is current or ahead —
 * so a ship is visible by the next day. Behind TTL (7d) applies only while already
 * nagging, so ordinary commands do not keep hitting npm. TTY nags once per day;
 * `--json` still attaches `update` on every envelope. `MENTAL_SKIP_UPDATE_CHECK=1`
 * skips. `MENTAL_NPM_LATEST` pins a version (tests).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { NAME, PKG_ROOT, VERSION } from "./pkg.mjs";
import { cacheMentalDir } from "./watermark.mjs";

/** How often to re-ask npm when this CLI thinks it is current. */
export const UPDATE_DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
/** How often to re-ask npm while already behind (nag from cache). */
export const UPDATE_BEHIND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** TTY prints the hint at most this often. JSON is not throttled. */
export const UPDATE_TTY_NAG_TTL_MS = 24 * 60 * 60 * 1000;
/** Alias of the behind TTL (older tests import this name). */
export const UPDATE_CACHE_TTL_MS = UPDATE_BEHIND_TTL_MS;
export const UPDATE_REFRESH_TIMEOUT_MS = 1200;

/**
 * @param {string} v
 * @returns {{ major: number, minor: number, patch: number, pre: string[] | null }}
 */
function parseSemver(v) {
  const s = String(v).trim().replace(/^v/i, "");
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (m) {
    return {
      major: Number.parseInt(m[1], 10),
      minor: Number.parseInt(m[2], 10),
      patch: Number.parseInt(m[3], 10),
      pre: m[4] ? m[4].split(".") : null,
    };
  }
  const loose = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (loose) {
    return {
      major: Number.parseInt(loose[1], 10),
      minor: Number.parseInt(loose[2], 10),
      patch: Number.parseInt(loose[3], 10),
      pre: null,
    };
  }
  return { major: 0, minor: 0, patch: 0, pre: null };
}

/**
 * @param {string[] | null} a
 * @param {string[] | null} b
 * @returns {-1 | 0 | 1}
 */
function cmpPre(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const da = /^\d+$/.test(a[i]);
    const db = /^\d+$/.test(b[i]);
    if (da && db) {
      const na = Number.parseInt(a[i], 10);
      const nb = Number.parseInt(b[i], 10);
      if (na > nb) return 1;
      if (na < nb) return -1;
      continue;
    }
    if (da) return -1;
    if (db) return 1;
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

/**
 * Compare two semver strings. Prerelease is less than the matching release.
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function cmpSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return cmpPre(pa.pre, pb.pre);
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
 * @returns {{ latest: string | null, checkedAt: string, lastNaggedAt: string | null } | null}
 */
export function readUpdateCache(env = process.env) {
  const file = updateCachePath(env);
  if (!file || !existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.checkedAt !== "string" || !parsed.checkedAt) return null;
    let latest = null;
    if (typeof parsed.latest === "string" && /^\d+\.\d+\.\d+/.test(parsed.latest)) {
      latest = parsed.latest.split(/\s+/)[0];
    }
    const lastNaggedAt =
      typeof parsed.lastNaggedAt === "string" && parsed.lastNaggedAt ? parsed.lastNaggedAt : null;
    return { latest, checkedAt: parsed.checkedAt, lastNaggedAt };
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ latest?: string | null, checkedAt?: string, lastNaggedAt?: string | null }} patch
 * @returns {{ latest: string | null, checkedAt: string, lastNaggedAt: string | null, path: string } | null}
 */
function persistUpdateCache(env, patch) {
  const file = updateCachePath(env);
  if (!file) return null;
  try {
    const prev = readUpdateCache(env);
    const latest = "latest" in patch ? (patch.latest ?? null) : (prev?.latest ?? null);
    const checkedAt = "checkedAt" in patch ? patch.checkedAt : prev?.checkedAt;
    if (!checkedAt) return null;
    let lastNaggedAt;
    if ("lastNaggedAt" in patch) lastNaggedAt = patch.lastNaggedAt ?? null;
    else if (prev && latest !== prev.latest) lastNaggedAt = null;
    else lastNaggedAt = prev?.lastNaggedAt ?? null;
    mkdirSync(dirname(file), { recursive: true });
    /** @type {{ latest: string | null, checkedAt: string, lastNaggedAt?: string }} */
    const payload = { latest, checkedAt };
    if (lastNaggedAt) payload.lastNaggedAt = lastNaggedAt;
    writeFileSync(file, `${JSON.stringify(payload)}\n`);
    return { latest, checkedAt, lastNaggedAt, path: file };
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null} latest
 * @param {number} [now]
 */
export function writeUpdateCache(env, latest, now = Date.now()) {
  return persistUpdateCache(env, {
    latest: latest ?? null,
    checkedAt: new Date(now).toISOString(),
  });
}

/**
 * Bump `checkedAt` without changing `latest`. Failed refreshes use this so the
 * next command does not pay another npm timeout.
 * @param {NodeJS.ProcessEnv} env
 * @param {number} [now]
 */
export function touchUpdateCache(env, now = Date.now()) {
  const prev = readUpdateCache(env);
  return persistUpdateCache(env, {
    latest: prev?.latest ?? null,
    checkedAt: new Date(now).toISOString(),
  });
}

/**
 * Record that the TTY already printed the hint. Does not bump `checkedAt`.
 * @param {NodeJS.ProcessEnv} env
 * @param {number} [now]
 */
export function markTtyNagged(env, now = Date.now()) {
  if (!readUpdateCache(env)) return null;
  return persistUpdateCache(env, { lastNaggedAt: new Date(now).toISOString() });
}

/**
 * TTY-only throttle. JSON callers must not use this — agents still see `update`
 * on every envelope and mention once per session in the skill.
 * @param {{ current: string, latest: string, hint: string } | null} notice
 * @param {{ env?: NodeJS.ProcessEnv, now?: number, nagTtlMs?: number }} [opts]
 * @returns {{ current: string, latest: string, hint: string } | null}
 */
export function takeTtyNag(notice, opts = {}) {
  if (!notice) return null;
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const nagTtl = opts.nagTtlMs ?? UPDATE_TTY_NAG_TTL_MS;
  const cached = readUpdateCache(env);
  const last = cached?.lastNaggedAt ? Date.parse(cached.lastNaggedAt) : NaN;
  const age = Number.isFinite(last) ? now - last : Infinity;
  if (age <= nagTtl) return null;
  markTtyNagged(env, now);
  return notice;
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
    if (r.status !== 0) {
      if (opts.cache !== false) touchUpdateCache(env, opts.now);
      return { skipped: false, latest: null };
    }
    const v = (r.stdout || "").trim().split(/\s+/)[0];
    if (!/^\d+\.\d+\.\d+/.test(v)) {
      if (opts.cache !== false) touchUpdateCache(env, opts.now);
      return { skipped: false, latest: null };
    }
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
  return `CLI ${current}; npm ${latest}. Run \`npm i -g ${pkg}\`, then \`mental install\`, then \`mental doctor\`. Existing Windows installs from Mental 0.8.1 or older run \`mental-repair.cmd\` once after npm updates.`;
}

/**
 * Cheap notice for every CLI/MCP envelope. Refreshes npm when the cache is older
 * than the discovery TTL (current) or the behind TTL (already nagging). Null when
 * this CLI is current or the check is skipped.
 *
 * @param {{ env?: NodeJS.ProcessEnv, version?: string, now?: number, ttlMs?: number, timeoutMs?: number }} [opts]
 * @returns {{ current: string, latest: string, hint: string } | null}
 */
export function peekUpdateNotice(opts = {}) {
  const env = opts.env ?? process.env;
  if (skipUpdateCheck(env)) return null;
  const current = opts.version ?? VERSION;
  const now = opts.now ?? Date.now();
  const cached = readUpdateCache(env);
  const checked = cached ? Date.parse(cached.checkedAt) : NaN;
  const age = Number.isFinite(checked) ? now - checked : Infinity;
  const knownBehind = Boolean(cached?.latest) && cmpSemver(cached.latest, current) > 0;
  const ttl = opts.ttlMs ?? (knownBehind ? UPDATE_BEHIND_TTL_MS : UPDATE_DISCOVERY_TTL_MS);
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
