/**
 * Pulse watermark — rebuildable cache, not source of truth.
 * Path: ${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.pulse.json
 * Heartbeat reads it. Pulse / park / handoff write it after computing delta.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @param {string} home
 * @param {NodeJS.ProcessEnv} [env]
 */
export function cacheMentalDir(home, env = process.env) {
  const xdg = env.XDG_CACHE_HOME && String(env.XDG_CACHE_HOME).trim() ? env.XDG_CACHE_HOME : join(home, ".cache");
  return join(xdg, "mental");
}

/**
 * @param {string} home
 * @param {string} id
 * @param {NodeJS.ProcessEnv} [env]
 */
export function watermarkPath(home, id, env = process.env) {
  return join(cacheMentalDir(home, env), `${id}.pulse.json`);
}

/**
 * @param {string | null | undefined} home
 * @param {string | null | undefined} id
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ at: string } | null}
 */
export function readWatermark(home, id, env = process.env) {
  if (!home || !id) return null;
  const file = watermarkPath(home, id, env);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed.at !== "string" || !parsed.at) return null;
    return { at: parsed.at };
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} home
 * @param {string | null | undefined} id
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [at]
 * @returns {{ at: string, path: string } | null}
 */
export function writeWatermark(home, id, env = process.env, at = new Date().toISOString()) {
  if (!home || !id) return null;
  const file = watermarkPath(home, id, env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ at })}\n`);
  return { at, path: file };
}
