/**
 * Doctor probes for host plugin caches and copied skills.
 * Never writes those directories. Fail open if the host CLI is missing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { skillMetadataVersion } from "./lockstep.mjs";
import { userInstallTargets } from "./install-skills.mjs";
import { cmpSemver } from "./update.mjs";
import { CMD } from "./pkg.mjs";

export const HOST_PLUGIN_TIMEOUT_MS = 2000;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function skipHostPluginCheck(env = process.env) {
  const v = env.MENTAL_SKIP_HOST_PLUGIN_CHECK;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {{ id: string, ok: boolean, message: string, level?: string }} row
 */
function row(id, ok, message, level = "error") {
  return { id, ok, level, message };
}

/**
 * @param {unknown} parsed
 * @returns {{ id: string, version: string } | null}
 */
export function findMentalPlugin(parsed) {
  /** @type {unknown[]} */
  let list = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object") {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if (Array.isArray(o.installed)) list = o.installed;
    else if (Array.isArray(o.plugins)) list = o.plugins;
  }
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = /** @type {Record<string, unknown>} */ (item);
    const id = String(rec.id ?? rec.name ?? rec.pluginId ?? "");
    const version = typeof rec.version === "string" ? rec.version : "";
    const needle = id.toLowerCase();
    if (!version) continue;
    if (needle === "mental" || needle.startsWith("mental@") || needle.includes("mental@mental")) {
      return { id: id || "mental", version };
    }
  }
  return null;
}

/**
 * @param {{
 *   command: string,
 *   args: string[],
 *   env: NodeJS.ProcessEnv,
 *   timeoutMs?: number,
 *   spawn?: typeof spawnSync,
 * }} opts
 * @returns {{ ok: boolean, parsed: unknown | null }}
 */
function spawnJson(opts) {
  const spawn = opts.spawn ?? spawnSync;
  try {
    const r = spawn(opts.command, opts.args, {
      encoding: "utf8",
      env: opts.env,
      timeout: opts.timeoutMs ?? HOST_PLUGIN_TIMEOUT_MS,
    });
    if (r.status !== 0 || r.error) return { ok: false, parsed: null };
    const text = (r.stdout || "").trim();
    if (!text) return { ok: false, parsed: null };
    return { ok: true, parsed: JSON.parse(text) };
  } catch {
    return { ok: false, parsed: null };
  }
}

/**
 * @param {{
 *   home: string,
 *   env?: NodeJS.ProcessEnv,
 *   version: string,
 *   spawn?: typeof spawnSync,
 * }} opts
 * @returns {Array<{ id: string, ok: boolean, message: string, level: string }>}
 */
export function hostPluginChecks(opts) {
  const env = opts.env ?? process.env;
  const version = opts.version;
  /** @type {Array<{ id: string, ok: boolean, message: string, level: string }>} */
  const checks = [];
  if (skipHostPluginCheck(env)) return checks;

  const spawn = opts.spawn ?? spawnSync;

  const claude = spawnJson({
    command: "claude",
    args: ["plugin", "list", "--json"],
    env,
    spawn,
  });
  if (claude.ok) {
    const hit = findMentalPlugin(claude.parsed);
    if (hit) {
      const behind = cmpSemver(hit.version, version) < 0;
      checks.push(
        row(
          "claude-plugin",
          !behind,
          behind
            ? `Claude plugin ${hit.version}; CLI ${version}. Run \`claude plugin marketplace update mental\` then \`claude plugin update mental@mental\` (restart Claude Code). \`mental install\` does not refresh that cache.`
            : `Claude plugin ${hit.version} (CLI ${version})`,
          behind ? "warn" : "info",
        ),
      );
    }
  }

  const copilot = spawnJson({
    command: "copilot",
    args: ["plugin", "list", "--json"],
    env,
    spawn,
  });
  if (copilot.ok) {
    const hit = findMentalPlugin(copilot.parsed);
    if (hit) {
      const behind = cmpSemver(hit.version, version) < 0;
      checks.push(
        row(
          "copilot-plugin",
          !behind,
          behind
            ? `Copilot plugin ${hit.version}; CLI ${version}. Run \`copilot plugin marketplace update\` then \`copilot plugin update mental\`. \`mental install\` does not refresh that cache.`
            : `Copilot plugin ${hit.version} (CLI ${version})`,
          behind ? "warn" : "info",
        ),
      );
    }
  }

  const targets = userInstallTargets(opts.home).skills;
  /** @type {string | null} */
  let worst = null;
  let seen = false;
  for (const dest of targets) {
    const file = join(dest, "SKILL.md");
    if (!existsSync(file)) continue;
    seen = true;
    try {
      const v = skillMetadataVersion(readFileSync(file, "utf8"));
      if (!v) continue;
      if (worst === null || cmpSemver(v, worst) < 0) worst = v;
    } catch {
      // fail open per copy
    }
  }
  if (seen && worst) {
    const behind = cmpSemver(worst, version) < 0;
    checks.push(
      row(
        "skills-version",
        !behind,
        behind
          ? `skill ${worst}; CLI ${version}. Run \`${CMD} install\`.`
          : `skill ${worst} (CLI ${version})`,
        behind ? "warn" : "info",
      ),
    );
  }

  return checks;
}
