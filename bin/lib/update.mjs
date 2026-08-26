/**
 * Fail-open npm update check. Heartbeat does not call this (must stay cheap).
 * `MENTAL_SKIP_UPDATE_CHECK=1` skips. `MENTAL_NPM_LATEST` pins a version (tests).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { NAME, PKG_ROOT } from "./pkg.mjs";

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
 * @param {{ env?: NodeJS.ProcessEnv, name?: string, timeoutMs?: number }} [opts]
 * @returns {{ skipped: boolean, latest: string | null }}
 */
export function checkForUpdate(opts = {}) {
  const env = opts.env ?? process.env;
  if (skipUpdateCheck(env)) return { skipped: true, latest: null };
  const pinned = env.MENTAL_NPM_LATEST;
  if (typeof pinned === "string" && /^\d+\.\d+\.\d+/.test(pinned.trim())) {
    return { skipped: false, latest: pinned.trim().split(/\s+/)[0] };
  }
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
  return { skipped: false, latest: v };
}

/**
 * @param {string} current
 * @param {string} latest
 * @param {string} [pkg]
 */
export function updateHint(current, latest, pkg = NAME) {
  return `CLI ${current}; npm ${latest}. Run \`mental install\` or \`npm i -g --force ${pkg}\`.`;
}
