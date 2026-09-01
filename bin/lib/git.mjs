/**
 * Git helpers: origin identity, worktree root, lightweight snapshots.
 *
 * Origin is a *hint* for Mental bindings, never the id. Canonical form is
 * `host/owner/repo` (no scheme, no `.git`, no userinfo).
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
export function runGit(cwd, args, { env = process.env } = {}) {
  return spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env,
  });
}

export function gitAvailable() {
  const r = spawnSync("git", ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

/**
 * Strip a trailing `.git` (case-insensitive) and slashes from a path segment.
 * @param {string} path
 */
function stripGitSuffix(path) {
  return path.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
}

/**
 * Normalize a git remote URL to `host/owner/repo` (or `host/path`).
 * `git@github.com:org/repo.git` ≡ `https://github.com/org/repo`.
 *
 * @param {string | null | undefined} input
 * @returns {string | null}
 */
export function normalizeOrigin(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);

  // SCP-like: [user@]host:path  (not a URL, not a Windows drive)
  if (!hasScheme && !/^[A-Za-z]:[\\/]/.test(s)) {
    const scp = /^(?:[^@]+@)?([^:]+):(.+)$/;
    const m = s.match(scp);
    if (m && m[2] != null && !m[2].startsWith("//")) {
      const host = m[1].toLowerCase();
      const path = stripGitSuffix(m[2].replace(/^\/+/, ""));
      return path ? `${host}/${path}` : host;
    }
  }

  let urlStr = s;
  if (!hasScheme) urlStr = `https://${s}`;

  let u;
  try {
    u = new URL(urlStr);
  } catch {
    return null;
  }

  const host = (u.hostname || "").toLowerCase();
  if (!host) return null;
  let path = stripGitSuffix((u.pathname || "").replace(/^\/+/, ""));
  return path ? `${host}/${path}` : host;
}

/**
 * Stable absolute path. `realpath` covers macOS `/var` → `/private/var`.
 * On Windows, also expand 8.3 names (`RUNNER~1` → `runneradmin`) so
 * `path.relative` and string equality agree with `git rev-parse --show-toplevel`.
 *
 * @param {string} input
 * @returns {string}
 */
export function canonicalPath(input) {
  let abs = resolve(String(input));
  try {
    abs = realpathSync(abs);
  } catch {
    // dest may not exist yet (export --out); keep resolve()
  }
  if (process.platform === "win32") {
    const long = win32LongPath(abs);
    if (long) abs = long;
  }
  return abs;
}

/**
 * `%~fI` expands 8.3 components. `realpathSync` on GitHub Actions Windows
 * often leaves `C:\Users\RUNNER~1\...` while git reports `runneradmin`.
 *
 * @param {string} abs
 * @returns {string | null}
 */
function win32LongPath(abs) {
  const comspec = process.env.ComSpec || "cmd.exe";
  const quoted = abs.replace(/"/g, "");
  const r = spawnSync(comspec, ["/d", "/s", "/c", `for %I in ("${quoted}") do @echo %~fI`], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.error || r.status !== 0) return null;
  const line = (r.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line || null;
}

/**
 * Walk from `cwd` to the filesystem root looking for `.git` (dir or file).
 * Prefer `git rev-parse --show-toplevel` when git works (correct for worktrees).
 *
 * @param {string} cwd
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string | null}
 */
export function findGitRoot(cwd, { env = process.env } = {}) {
  const start = resolve(cwd);
  if (gitAvailable()) {
    const r = runGit(start, ["rev-parse", "--show-toplevel"], { env });
    if (r.status === 0) {
      const top = (r.stdout || "").trim();
      if (top) return canonicalPath(top);
    }
  }
  let dir = start;
  const { root } = parse(dir);
  while (true) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      try {
        const st = statSync(gitPath);
        if (st.isDirectory() || st.isFile()) return canonicalPath(dir);
      } catch {
        // ignore
      }
    }
    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {string} cwd
 * @param {string} [name]
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string | null}
 */
export function getRemoteUrl(cwd, name = "origin", { env = process.env } = {}) {
  const r = runGit(cwd, ["remote", "get-url", name], { env });
  if (r.status !== 0) return null;
  const url = (r.stdout || "").trim();
  return url || null;
}

/**
 * Lightweight git snapshot for `mental status`. Missing git → null fields.
 *
 * @param {string | null} gitRoot
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
export function gitSnapshot(gitRoot, { env = process.env } = {}) {
  if (!gitRoot || !gitAvailable()) {
    return { branch: null, dirty: false, porcelain: "", recent: [] };
  }
  const branchR = runGit(gitRoot, ["rev-parse", "--abbrev-ref", "HEAD"], { env });
  const branch = branchR.status === 0 ? (branchR.stdout || "").trim() || null : null;
  const st = runGit(gitRoot, ["status", "--porcelain"], { env });
  const porcelain = st.status === 0 ? st.stdout || "" : "";
  const log = runGit(gitRoot, ["log", "-5", "--oneline"], { env });
  const recent =
    log.status === 0
      ? (log.stdout || "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  return { branch, dirty: porcelain.trim().length > 0, porcelain, recent };
}

/**
 * Unique commit calendar dates (git log --date=short). Empty if git fails.
 * Does not convert commits into hours.
 * @param {string | null} gitRoot
 * @param {{ since?: string, until?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function commitShortDates(gitRoot, { since, until, env = process.env } = {}) {
  if (!gitRoot) return [];
  const args = ["log", "--format=%ad", "--date=short"];
  if (since) args.push(`--since=${since} 00:00:00`);
  if (until) args.push(`--until=${until} 23:59:59`);
  const log = runGit(gitRoot, args, { env });
  if (log.status !== 0) return [];
  const days = new Set();
  for (const line of (log.stdout || "").split(/\r?\n/)) {
    const d = line.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
  }
  return [...days].sort();
}
