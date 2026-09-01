import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalPath } from "../bin/lib/git.mjs";

export const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

export function tempHome(prefix = "mental-") {
  return canonicalPath(mkdtempSync(join(tmpdir(), prefix)));
}

/**
 * Isolated git env so tests never read or write the machine gitconfig.
 * @param {string} home
 */
export function gitEnv(home) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Mental Test",
    GIT_AUTHOR_EMAIL: "mental@test.local",
    GIT_COMMITTER_NAME: "Mental Test",
    GIT_COMMITTER_EMAIL: "mental@test.local",
    npm_config_prefix: join(home, ".local"),
    npm_config_update_notifier: "false",
    MENTAL_SKIP_UPDATE_CHECK: "1",
    MENTAL_SKIP_HOST_PLUGIN_CHECK: "1",
  };
  delete env.NO_COLOR;
  if (env.TERM === "dumb") delete env.TERM;
  return env;
}

export function git(cwd, args, home) {
  const r = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: gitEnv(home),
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return r;
}

/**
 * @param {string} home
 * @param {string} cwd
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [extraEnv]
 */
export function mental(home, cwd, args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...gitEnv(home), ...extraEnv },
  });
}

/**
 * @param {string} home
 * @param {{ origin?: string | null, name?: string, nested?: string }} [opts]
 */
export function initRepo(home, { origin = "git@github.com:afaraha8403/mental.git", name = "repo", nested } = {}) {
  const root = join(home, "work", name);
  mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"], home);
  git(root, ["config", "user.email", "mental@test.local"], home);
  git(root, ["config", "user.name", "Mental Test"], home);
  writeFileSync(join(root, "README.md"), "# test\n");
  git(root, ["add", "README.md"], home);
  git(root, ["commit", "-m", "init"], home);
  if (origin) git(root, ["remote", "add", "origin", origin], home);
  let cwd = root;
  if (nested) {
    cwd = join(root, nested);
    mkdirSync(cwd, { recursive: true });
  }
  return { root, cwd };
}
