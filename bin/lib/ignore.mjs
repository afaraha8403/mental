/**
 * Private-by-default git ignore for `.mental/` and `.mental-id`.
 *
 * v1: user global excludes only, via `mental doctor --fix-ignore`.
 * Agents must never edit `.gitignore`. Pattern inspired by Balakit's
 * exclude helpers; comments and product name are Mental's.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

export const MENTAL_IGNORE_LINE = ".mental/";
export const MENTAL_ID_IGNORE_LINE = ".mental-id";
export const MENTAL_IGNORE_COMMENT =
  "# mental: private continuity — never commit";

/**
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
export function runGitGlobal(args, { env = process.env } = {}) {
  return spawnSync("git", args, { encoding: "utf8", env });
}

export function gitAvailable({ env = process.env } = {}) {
  const r = runGitGlobal(["--version"], { env });
  return !r.error && r.status === 0;
}

export function expandHome(p, home) {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(home, p.slice(2));
  return p;
}

export function defaultExcludesFile(home, env = process.env) {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(home, ".config");
  return join(base, "git", "ignore");
}

/**
 * Resolve the active global excludes file.
 * Honors existing `core.excludesfile` (never overwrites the user's choice).
 */
export function resolveGlobalExcludesFile({
  create = false,
  home = homedir(),
  env = process.env,
} = {}) {
  if (!gitAvailable({ env })) return null;
  const configured = (runGitGlobal(["config", "--global", "--get", "core.excludesfile"], { env }).stdout || "").trim();
  if (configured) return { file: expandHome(configured, home), created: false };
  if (!create) return { file: defaultExcludesFile(home, env), created: false, unset: true };
  const file = defaultExcludesFile(home, env);
  runGitGlobal(["config", "--global", "core.excludesfile", file.split("\\").join("/")], { env });
  return { file, created: true };
}

function fileHasLine(cur, line) {
  return cur.split(/\r?\n/).some((l) => l.trim() === line);
}

/**
 * Idempotently append Mental ignore lines to the machine-wide git excludes.
 */
export function ensureMentalExcluded({ home = homedir(), env = process.env } = {}) {
  const resolved = resolveGlobalExcludesFile({ create: true, home, env });
  if (!resolved) return { ok: false, reason: "git-unavailable" };
  const { file, created } = resolved;
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    cur = "";
  }
  const needBundle = !fileHasLine(cur, MENTAL_IGNORE_LINE);
  const needId = !fileHasLine(cur, MENTAL_ID_IGNORE_LINE);
  if (needBundle || needId) {
    mkdirSync(dirname(file), { recursive: true });
    const gap = cur && !cur.endsWith("\n") ? "\n" : "";
    const bits = [MENTAL_IGNORE_COMMENT];
    if (needBundle) bits.push(MENTAL_IGNORE_LINE);
    if (needId) bits.push(MENTAL_ID_IGNORE_LINE);
    writeFileSync(file, `${cur}${gap}${bits.join("\n")}\n`);
  }
  return { ok: true, file, created, appended: needBundle || needId };
}

/**
 * Live check: is `.mental/` ignored in this worktree?
 */
export function checkMentalIgnored({ cwd, env = process.env } = {}) {
  if (!gitAvailable({ env })) return { ok: false, liveIgnored: null, reason: "git-unavailable" };
  const ci = spawnSync("git", ["-C", cwd, "check-ignore", "-q", "--", ".mental/probe"], {
    encoding: "utf8",
    env,
  });
  if (ci.status === 128) return { ok: false, liveIgnored: null, reason: "not-a-repo" };
  const liveIgnored = ci.status === 0;
  return { ok: liveIgnored, liveIgnored };
}

/**
 * Refuse to create a project-local `./.mental/` unless git will ignore it.
 * @param {string} cwd
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
export function assertLocalIgnorable(cwd, { env = process.env } = {}) {
  const check = checkMentalIgnored({ cwd, env });
  if (check.liveIgnored === true) return { ok: true };
  if (check.reason === "not-a-repo") return { ok: true };
  return {
    ok: false,
    error: {
      code: "not-ignored",
      message:
        "./.mental/ is not gitignored. Run `mental doctor --fix-ignore`, then retry. Mental will not create a project-local bundle that git would track.",
    },
  };
}
