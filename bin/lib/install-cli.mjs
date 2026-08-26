/**
 * Put `mental` on PATH. Last `mental install` (or `npm i -g @balacode/mental`) wins.
 *
 * `npm install -g` this package into the active npm prefix, then expose the
 * same binary at `~/.local/bin/mental` when that dir is the user's PATH bin
 * and differs from the npm prefix (as on this machine).
 */
import { chmodSync, existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CMD, PKG_ROOT } from "./pkg.mjs";

function runNpm(args, env) {
  return spawnSync("npm", args, { encoding: "utf8", env });
}

function npmGlobalPrefix(env) {
  const r = runNpm(["prefix", "-g"], env);
  const p = (r.stdout || "").trim();
  return p || null;
}

function npmGlobalBin(prefix) {
  // Unix npm: <prefix>/bin/<cmd>
  return join(prefix, "bin", CMD);
}

function replaceWithSymlink(dest, target) {
  mkdirSync(dirname(dest), { recursive: true });
  try {
    unlinkSync(dest);
  } catch {
    // missing
  }
  symlinkSync(target, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // symlink chmod is a no-op on some systems
  }
}

/**
 * @param {{ home: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{
 *   ok: boolean,
 *   bin: string | null,
 *   target: string | null,
 *   npm: boolean,
 *   message: string,
 * }}
 */
export function installGlobalCli({ home, env = process.env }) {
  const npm = runNpm(
    ["install", "-g", "--no-fund", "--no-audit", "--no-package-lock", PKG_ROOT],
    env,
  );
  const prefix = npmGlobalPrefix(env);
  const npmBin = prefix ? npmGlobalBin(prefix) : null;
  const pathBin = join(home, ".local", "bin", CMD);
  const fallback = join(PKG_ROOT, "bin", "cli.mjs");
  const target =
    npmBin && existsSync(npmBin) ? resolve(npmBin) : resolve(fallback);

  try {
    if (resolve(pathBin) !== target) replaceWithSymlink(pathBin, target);
    else if (!existsSync(pathBin) && existsSync(target)) replaceWithSymlink(pathBin, target);
  } catch (err) {
    return {
      ok: false,
      bin: pathBin,
      target,
      npm: npm.status === 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const bin = existsSync(pathBin) ? pathBin : existsSync(target) ? target : null;
  const ok = Boolean(bin);
  return {
    ok,
    bin,
    target,
    npm: npm.status === 0,
    message: ok
      ? `${CMD} → ${target}`
      : (npm.stderr || npm.stdout || "failed to install CLI on PATH").trim(),
  };
}

/**
 * @param {string} dest
 */
export function isMentalBin(dest) {
  try {
    return existsSync(dest) || lstatSync(dest).isSymbolicLink();
  } catch {
    return false;
  }
}
