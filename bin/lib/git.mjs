/**
 * Git helpers: origin identity, worktree root, lightweight snapshots.
 *
 * Origin is a *hint* for Mental bindings, never the id. Canonical form is
 * `host/owner/repo` (no scheme, no `.git`, no userinfo).
 */
import { existsSync, statSync } from "node:fs";
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
      if (top) return resolve(top);
    }
  }
  let dir = start;
  const { root } = parse(dir);
  while (true) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      try {
        const st = statSync(gitPath);
        if (st.isDirectory() || st.isFile()) return dir;
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
