/**
 * Git helpers: origin identity, worktree root, lightweight snapshots.
 *
 * Origin is a *hint* for Mental bindings, never the id. Canonical form is
 * `host/owner/repo` (no scheme, no `.git`, no userinfo).
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
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
 * Drop the Windows `\\?\` device prefix `GetFinalPathNameByHandle` adds.
 * @param {string} p
 */
function stripWin32DevicePrefix(p) {
  if (p.startsWith("\\\\?\\UNC\\")) return `\\\\${p.slice(8)}`;
  if (p.startsWith("\\\\?\\")) return p.slice(4);
  return p;
}

/** Reject cmd-FOR junk (`D:\"C:\Users\..."`) and other non-paths. */
function isSaneAbs(p) {
  if (!p || /["<>|*?]/.test(p)) return false;
  if (process.platform === "win32") return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
  return p.startsWith("/");
}

/**
 * Native realpath: POSIX realpath(3), Windows GetFinalPathNameByHandle
 * (expands 8.3). Never use `cmd for %~fI` — Node's quoting of `/c` pollutes
 * the result (`D:\"C:\Users\RUNNER~1\..."`).
 *
 * @param {string} p
 * @returns {string | null}
 */
function nativeRealpath(p) {
  const impl = typeof realpathSync.native === "function" ? realpathSync.native : realpathSync;
  try {
    const out = stripWin32DevicePrefix(impl(p));
    return isSaneAbs(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Stable absolute path. macOS `/var` → `/private/var`. Windows 8.3
 * (`RUNNER~1`) → long name so string equality and `path.relative` agree
 * with `git rev-parse --show-toplevel`.
 *
 * @param {string} input
 * @returns {string}
 */
export function canonicalPath(input) {
  const abs = resolve(String(input));
  const hit = nativeRealpath(abs);
  if (hit) return hit;
  try {
    const js = realpathSync(abs);
    if (isSaneAbs(js)) return js;
  } catch {
    // dest may not exist yet (export --out); canonicalize the parent
  }
  const parent = nativeRealpath(dirname(abs));
  if (parent) return join(parent, basename(abs));
  try {
    const jsParent = realpathSync(dirname(abs));
    if (isSaneAbs(jsParent)) return join(jsParent, basename(abs));
  } catch {
    // keep resolve()
  }
  return abs;
}

/**
 * True when both paths are the same directory/file (8.3 vs long on NTFS).
 * `ino === 0` is treated as unknown (some Windows volumes).
 *
 * @param {string} a
 * @param {string} b
 */
export function sameIdentity(a, b) {
  try {
    const sa = statSync(a);
    const sb = statSync(b);
    return Number(sa.ino) !== 0 && sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

/**
 * True when `child` is `parent` or a descendant. Uses `path.relative` first,
 * then NTFS identity walk so `RUNNER~1` vs `runneradmin` still refuses
 * export `--out` inside the worktree.
 *
 * @param {string} parent
 * @param {string} child
 */
export function isInsideDir(parent, child) {
  const rel = relative(parent, child);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return true;
  let dir = child;
  try {
    statSync(dir);
  } catch {
    dir = dirname(dir);
  }
  dir = resolve(dir);
  const parentAbs = resolve(parent);
  const { root } = parse(dir);
  while (true) {
    if (sameIdentity(parentAbs, dir)) return true;
    if (dir === root || dirname(dir) === dir) return false;
    dir = dirname(dir);
  }
}

/**
 * Walk cwd → filesystem root for `.git` (dir or file).
 * @param {string} start
 * @returns {string | null}
 */
function walkUpGit(start) {
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
 * Walk from `cwd` to the filesystem root looking for `.git` (dir or file).
 * Prefer `git rev-parse --show-toplevel` when git works (correct for worktrees).
 * When walk-up and git name the same directory, keep walk-up's spelling so
 * 8.3 cwd stays 8.3 if native realpath did not expand it.
 *
 * @param {string} cwd
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string | null}
 */
export function findGitRoot(cwd, { env = process.env } = {}) {
  const start = resolve(cwd);
  const walked = walkUpGit(start);
  if (gitAvailable()) {
    const r = runGit(start, ["rev-parse", "--show-toplevel"], { env });
    if (r.status === 0) {
      const top = (r.stdout || "").trim();
      if (top) {
        const gitTop = canonicalPath(top);
        if (walked && sameIdentity(walked, gitTop)) return canonicalPath(walked);
        return gitTop;
      }
    }
  }
  return walked ? canonicalPath(walked) : null;
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
