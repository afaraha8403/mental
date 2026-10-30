/**
 * Opt-in `Mental-Decision:` commit trailer. Off until `mental option trailer on`.
 * The hook never fails the commit.
 */
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { writeAtomic } from "./atomic.mjs";
import { isFeatureOn } from "./config.mjs";
import { runGit } from "./git.mjs";
import { listMarkdownRecursive, parseFrontmatter } from "./okf.mjs";

export const TRAILER_MARK = "# mental-trailer";

const HOOK_BODY = `#!/bin/sh
${TRAILER_MARK}
# Failure here must not block the commit. An existing hook is chained.
status=0
if [ -f "$0.chain" ]; then
  /bin/sh "$0.chain" "$@"
  status=$?
fi
msg="$1"
if [ -z "$msg" ] || [ ! -f "$msg" ]; then
  exit $status
fi
out=$(mental trailer --json 2>/dev/null) || exit $status
printf '%s\\n' "$out" | tr ',' '\\n' | sed -n 's/.*"\\([^"]*\\/decisions\\/[^"]*\\)".*/\\1/p' | while IFS= read -r val; do
  [ -n "$val" ] || continue
  git interpret-trailers --in-place --if-exists replace --trailer "Mental-Decision: $val" "$msg" 2>/dev/null || true
done
exit $status
`;

/**
 * @param {string} gitRoot
 * @param {NodeJS.ProcessEnv} [env]
 */
export function gitHooksDir(gitRoot, env = process.env) {
  const r = runGit(gitRoot, ["rev-parse", "--git-path", "hooks"], { env });
  const raw = r.status === 0 ? (r.stdout || "").trim() : "hooks";
  if (!raw) return join(gitRoot, ".git", "hooks");
  return isAbsolute(raw) ? raw : join(gitRoot, raw);
}

/**
 * @param {string} gitRoot
 * @param {NodeJS.ProcessEnv} [env]
 */
export function trailerHookPath(gitRoot, env = process.env) {
  return join(gitHooksDir(gitRoot, env), "prepare-commit-msg");
}

/**
 * @param {string} gitRoot
 * @param {NodeJS.ProcessEnv} [env]
 */
export function trailerHookInstalled(gitRoot, env = process.env) {
  if (!gitRoot) return false;
  const file = trailerHookPath(gitRoot, env);
  if (!existsSync(file)) return false;
  try {
    return readFileSync(file, "utf8").includes(TRAILER_MARK);
  } catch {
    return false;
  }
}

/**
 * @param {string} gitRoot
 * @param {NodeJS.ProcessEnv} [env]
 */
export function installTrailerHook(gitRoot, env = process.env) {
  if (!gitRoot) return { ok: false, error: { code: "usage", message: "trailer hook needs a git repo" } };
  const file = trailerHookPath(gitRoot, env);
  if (existsSync(file)) {
    let cur = "";
    try {
      cur = readFileSync(file, "utf8");
    } catch {
      cur = "";
    }
    if (!cur.includes(TRAILER_MARK)) {
      const chain = `${file}.chain`;
      if (!existsSync(chain)) renameSync(file, chain);
    }
  }
  writeAtomic(file, HOOK_BODY);
  try {
    chmodSync(file, 0o755);
  } catch {
    // Windows ignores the executable bit; Git still runs a hook that starts with #!.
  }
  return { ok: true, path: file };
}

/**
 * @param {string} gitRoot
 * @param {NodeJS.ProcessEnv} [env]
 */
export function removeTrailerHook(gitRoot, env = process.env) {
  if (!gitRoot) return { ok: true, removed: false };
  const file = trailerHookPath(gitRoot, env);
  if (!existsSync(file)) return { ok: true, removed: false, path: file };
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    return { ok: true, removed: false, path: file };
  }
  if (!cur.includes(TRAILER_MARK)) return { ok: true, removed: false, path: file };
  unlinkSync(file);
  const chain = `${file}.chain`;
  if (existsSync(chain)) renameSync(chain, file);
  return { ok: true, removed: true, path: file };
}

/**
 * Decisions created or updated since the last commit. The trailer is an id and
 * a relative path, never the decision text.
 * @param {{ root: string | null, id: string | null, gitRoot: string | null, home: string | null, env?: NodeJS.ProcessEnv }} opts
 * @returns {string[]}
 */
export function decisionTrailers({ root, id, gitRoot, home, env = process.env }) {
  if (!root || !id || !gitRoot || !home) return [];
  if (!isFeatureOn(home, "trailer", id)) return [];
  const last = runGit(gitRoot, ["log", "-1", "--format=%cI"], { env });
  const since = last.status === 0 ? Date.parse((last.stdout || "").trim()) : NaN;
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const file of listMarkdownRecursive(dir)) {
    let text = "";
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    const { data } = parseFrontmatter(text);
    const ts = Date.parse(String(data.timestamp || ""));
    if (Number.isFinite(since) && !(Number.isFinite(ts) && ts > since)) continue;
    out.push(`${id}/decisions/${file}`);
  }
  return out;
}
