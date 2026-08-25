/**
 * Deterministic active-bundle resolution. Exclusive nearest-wins — no overlay.
 *
 * Order: --dir / MENTAL_DIR → opted-in ./.mental/ (`mental local`) → git binding
 * → personal ~/.mental.
 *
 * Leftover Balakit `./.mental` (no `.mental-local` marker) is imported into
 * `~/.mental/projects/<uuid>/` on write resolve. Source is never deleted.
 */
import { statSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { findGitRoot, getRemoteUrl } from "./git.mjs";
import {
  projectSliceDir,
  recordLegacyImport,
  resolveOrCreateBinding,
  userMentalDir,
} from "./bindings.mjs";
import { importLegacyBundle, isOptedInLocal } from "./import-legacy.mjs";
import { reindexBundle } from "./index.mjs";

/**
 * @typedef {'env' | 'local' | 'home' | 'personal'} ResolveMode
 *
 * @typedef {{
 *   from: string,
 *   to: string,
 *   copied: string[],
 *   skipped: number,
 *   error?: string,
 * }} ImportResult
 *
 * @typedef {{
 *   root: string,
 *   id: string | null,
 *   mode: ResolveMode,
 *   reason: string,
 *   gitRoot: string | null,
 *   imported?: ImportResult | null,
 *   indexed?: { ok: boolean, path: string | null, concepts: number, backend: string, error?: string },
 * }} WhereData
 */

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk cwd → git root (or filesystem root, stop at $HOME) for a project
 * `.mental/` directory. Never treat the user store `~/.mental` as a local
 * project bundle (that would silently overlay every non-git cwd under home).
 *
 * @param {string} cwd
 * @param {{ home: string, gitRoot: string | null }} opts
 * @returns {string | null} absolute path to the `.mental` directory
 */
export function findLocalMental(cwd, { home, gitRoot }) {
  const start = resolve(cwd);
  const homeAbs = resolve(home);
  const userStore = resolve(userMentalDir(home));
  const gitAbs = gitRoot ? resolve(gitRoot) : null;
  const { root: fsRoot } = parse(start);

  let dir = start;
  while (true) {
    const candidate = join(dir, ".mental");
    if (isDir(candidate)) {
      const abs = resolve(candidate);
      if (abs !== userStore) return abs;
    }

    if (gitAbs && dir === gitAbs) break;
    if (dir === homeAbs) break;
    if (dir === fsRoot) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * @param {{
 *   gitRoot: string,
 *   home: string,
 *   env: NodeJS.ProcessEnv,
 *   write: boolean,
 * }} opts
 */
function bindGit({ gitRoot, home, env, write }) {
  const origin = getRemoteUrl(gitRoot, "origin", { env });
  const upstream = getRemoteUrl(gitRoot, "upstream", { env });
  return resolveOrCreateBinding({
    gitRoot,
    origin,
    upstream,
    home,
    write,
  });
}

/**
 * Copy leftover `./.mental` into the UUID slice. Fail open: import errors
 * do not block resolve.
 *
 * @param {{ leftover: string, dest: string, home: string, id: string }} opts
 * @returns {ImportResult}
 */
function importLeftover({ leftover, dest, home, id }) {
  try {
    const result = importLegacyBundle(leftover, dest);
    recordLegacyImport(home, id, leftover, { copied: result.copied });
    return result;
  } catch (err) {
    return {
      from: leftover,
      to: dest,
      copied: [],
      skipped: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {WhereData} data
 * @param {{ write: boolean, home: string, env: NodeJS.ProcessEnv }} ctx
 */
function withIndex(data, { write, home, env }) {
  if (write && data.id && home) {
    data.indexed = reindexBundle({ root: data.root, id: data.id, home, env });
  }
  return { ok: true, data };
}

/**
 * @param {{
 *   cwd?: string,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   dir?: string | null,
 *   write?: boolean,
 * }} [opts]
 * @returns {{ ok: true, data: WhereData } | { ok: false, error: { code: string, message: string } }}
 */
export function resolveBundle({
  cwd = process.cwd(),
  home = process.env.HOME ?? process.env.USERPROFILE ?? null,
  env = process.env,
  dir = null,
  write = true,
} = {}) {
  const gitRoot = findGitRoot(cwd, { env });

  const dirOverride = dir || env.MENTAL_DIR || null;
  if (dirOverride) {
    const abs = resolve(cwd, dirOverride);
    if (!isDir(abs)) {
      return {
        ok: false,
        error: {
          code: "env-dir-missing",
          message: `MENTAL_DIR / --dir is not a directory: ${abs}`,
        },
      };
    }
    return {
      ok: true,
      data: {
        root: abs,
        id: null,
        mode: "env",
        reason: dir ? `--dir ${abs}` : `MENTAL_DIR=${abs}`,
        gitRoot,
      },
    };
  }

  if (!home) {
    return {
      ok: false,
      error: {
        code: "no-home",
        message: "HOME is unset; Mental will not write. Set HOME or MENTAL_DIR.",
      },
    };
  }

  const leftover = findLocalMental(cwd, { home, gitRoot });
  const optedIn = Boolean(leftover && isOptedInLocal(leftover));

  if (optedIn && leftover) {
    let id = null;
    let reason = `walk-up found opted-in ${leftover}`;
    if (gitRoot) {
      try {
        const bound = bindGit({ gitRoot, home, env, write });
        if (!bound.ok) {
          return { ok: false, error: { code: bound.code, message: bound.message } };
        }
        if (bound.id) {
          id = bound.id;
          reason = `${reason}; ${bound.reason}`;
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "bindings",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }
    return withIndex(
      {
        root: leftover,
        id,
        mode: "local",
        reason,
        gitRoot,
      },
      { write, home, env },
    );
  }

  if (gitRoot) {
    try {
      const bound = bindGit({ gitRoot, home, env, write });
      if (!bound.ok) {
        return { ok: false, error: { code: bound.code, message: bound.message } };
      }
      if (!bound.id) {
        return {
          ok: true,
          data: {
            root: join(userMentalDir(home), "projects"),
            id: null,
            mode: "home",
            reason: leftover
              ? `${bound.reason}; leftover ${leftover} imports on next write`
              : bound.reason,
            gitRoot,
          },
        };
      }
      const dest = projectSliceDir(home, bound.id);
      /** @type {ImportResult | null} */
      let imported = null;
      let reason = bound.reason;
      if (write && leftover) {
        imported = importLeftover({ leftover, dest, home, id: bound.id });
        const n = imported.copied.length;
        reason =
          n > 0
            ? `${bound.reason}; imported ${n} leftover file(s) from ${leftover}`
            : imported.error
              ? `${bound.reason}; leftover import failed: ${imported.error}`
              : `${bound.reason}; leftover ${leftover} already imported`;
      } else if (leftover) {
        reason = `${bound.reason}; leftover ${leftover} imports on next write`;
      }
      return withIndex(
        {
          root: dest,
          id: bound.id,
          mode: "home",
          reason,
          gitRoot,
          imported,
        },
        { write, home, env },
      );
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "bindings",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return {
    ok: true,
    data: {
      root: userMentalDir(home),
      id: null,
      mode: "personal",
      reason: leftover
        ? `not a git repo; leftover ${leftover} not imported (need a git root)`
        : "not a git repo; personal ~/.mental",
      gitRoot: null,
    },
  };
}
