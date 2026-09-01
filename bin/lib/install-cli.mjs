/**
 * Put `mental` on PATH. Last `mental install` (or `npm i -g @balacode/mental`) wins.
 *
 * `npm install -g` this package into the active npm prefix, then expose the
 * same binary at `~/.local/bin/mental` (Unix) or `mental.cmd` + `mental.ps1`
 * (Windows) when that dir differs from the npm prefix. Windows also drops the
 * leftover extensionless `mental` → `cli.mjs` symlink 0.7.x wrote.
 *
 * Never spawn a `.mjs` file as argv0. Windows has no shebang and ShellExecutes
 * unknown extensions ("how do you want to open this file?").
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix as posixPath, resolve, win32 as win32Path } from "node:path";
import { spawnSync } from "node:child_process";
import { CMD, NAME, PKG_ROOT } from "./pkg.mjs";

function runNpm(args, env) {
  // CreateProcess cannot run npm.cmd without a shell.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npm, args, {
    encoding: "utf8",
    env,
    shell: process.platform === "win32",
    windowsHide: process.platform === "win32",
  });
}

function unlinkQuiet(dest) {
  try {
    unlinkSync(dest);
  } catch {
    // missing
  }
}

/**
 * Path helpers for the given OS. Tests pass `win32` while running on Unix.
 *
 * @param {string} [platform]
 */
export function pathFor(platform = process.platform) {
  return platform === "win32" ? win32Path : posixPath;
}

/**
 * npm global bin directory. Unix is `<prefix>/bin`; Windows is the prefix.
 *
 * @param {string} prefix
 * @param {string} [platform]
 */
export function npmGlobalBinDir(prefix, platform = process.platform) {
  const p = pathFor(platform);
  return platform === "win32" ? prefix : p.join(prefix, "bin");
}

/**
 * Path to the `mental` executable npm writes.
 * Windows: `<prefix>/mental.cmd` (never the raw `.mjs`).
 *
 * @param {string} prefix
 * @param {string} [cmd]
 * @param {string} [platform]
 */
export function npmGlobalBinPath(prefix, cmd = CMD, platform = process.platform) {
  const p = pathFor(platform);
  const dir = npmGlobalBinDir(prefix, platform);
  return platform === "win32" ? p.join(dir, `${cmd}.cmd`) : p.join(dir, cmd);
}

/**
 * User PATH shim Mental also writes (`~/.local/bin`).
 *
 * @param {string} home
 * @param {string} [cmd]
 * @param {string} [platform]
 */
export function userPathBin(home, cmd = CMD, platform = process.platform) {
  const p = pathFor(platform);
  const dir = p.join(home, ".local", "bin");
  return platform === "win32" ? p.join(dir, `${cmd}.cmd`) : p.join(dir, cmd);
}

/**
 * `cli.mjs` inside a global `node_modules` tree (`npm root -g`).
 *
 * @param {string} globalNodeModules
 * @param {string} [name]
 * @param {string} [platform]
 */
export function npmGlobalCliScript(globalNodeModules, name = NAME, platform = process.platform) {
  const p = pathFor(platform);
  const segs = name.startsWith("@") ? name.split("/") : [name];
  return p.join(globalNodeModules, ...segs, "bin", "cli.mjs");
}

/**
 * argv for invoking the CLI without ShellExecute of a `.mjs` file.
 *
 * @param {string} scriptPath
 * @param {string[]} [args]
 * @returns {{ command: string, args: string[] }}
 */
export function cliInvoke(scriptPath, args = []) {
  return { command: process.execPath, args: [scriptPath, ...args] };
}

/**
 * Spawn `node cli.mjs …`. Never uses the `.mjs` path as the executable.
 *
 * @param {string} scriptPath
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptionsWithStringEncoding} [opts]
 */
export function spawnCli(scriptPath, args, opts) {
  const inv = cliInvoke(scriptPath, args);
  return spawnSync(inv.command, inv.args, opts);
}

/**
 * cmd.exe shim body: run Node with the CLI script. `%*` forwards argv.
 *
 * @param {string} nodePath
 * @param {string} scriptPath
 */
export function windowsCmdShim(nodePath, scriptPath) {
  return `@echo off\r\n"${nodePath}" "${scriptPath}" %*\r\n`;
}

/**
 * PowerShell shim. Single-quoted paths so `$` / spaces stay literal.
 *
 * @param {string} nodePath
 * @param {string} scriptPath
 */
export function windowsPs1Shim(nodePath, scriptPath) {
  const n = String(nodePath).replace(/'/g, "''");
  const s = String(scriptPath).replace(/'/g, "''");
  return `#!/usr/bin/env pwsh\r\n& '${n}' '${s}' @args\r\n`;
}

/**
 * Git Bash shim. Forward slashes so `\n` in `node.exe` is not an escape.
 *
 * @param {string} nodePath
 * @param {string} scriptPath
 */
export function windowsGitBashShim(nodePath, scriptPath) {
  const n = bashSingleQuote(String(nodePath).replace(/\\/g, "/"));
  const s = bashSingleQuote(String(scriptPath).replace(/\\/g, "/"));
  return `#!/bin/sh\nexec ${n} ${s} "$@"\n`;
}

function bashSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Names 0.7.x left on PATH that Windows ShellExecutes as `cli.mjs`
 * (extensionless symlink, or a raw `.mjs` copy).
 *
 * @param {string} dir
 * @param {string} [cmd]
 */
export function windowsUnsafeBinPaths(dir, cmd = CMD) {
  return [join(dir, cmd), join(dir, `${cmd}.mjs`)];
}

/**
 * True when executing this path would open a `.mjs` (the Open With dialog).
 *
 * @param {string} dest
 */
export function isWindowsMjsBin(dest) {
  if (!dest) return false;
  if (/\.mjs$/i.test(dest)) return existsSync(dest);
  try {
    const st = lstatSync(dest);
    if (!st.isSymbolicLink()) return false;
    return /\.mjs$/i.test(readlinkSync(dest));
  } catch {
    return false;
  }
}

/**
 * Drop leftover `mental` → `cli.mjs` links so `mental` cannot ShellExecute.
 *
 * @param {string} dir
 * @param {string} [cmd]
 */
export function clearWindowsMjsLeftovers(dir, cmd = CMD) {
  for (const dest of windowsUnsafeBinPaths(dir, cmd)) {
    if (isWindowsMjsBin(dest)) unlinkQuiet(dest);
  }
}

/**
 * Write `mental.cmd` + `mental.ps1` + a Git Bash `mental` that all run Node.
 * Replaces the 0.7.x symlink to `cli.mjs`.
 *
 * @param {string} dir
 * @param {string} nodePath
 * @param {string} scriptPath
 * @param {string} [cmd]
 */
export function writeWindowsShims(dir, nodePath, scriptPath, cmd = CMD) {
  mkdirSync(dir, { recursive: true });
  for (const dest of windowsUnsafeBinPaths(dir, cmd)) unlinkQuiet(dest);
  unlinkQuiet(join(dir, `${cmd}.cmd`));
  unlinkQuiet(join(dir, `${cmd}.ps1`));
  writeFileSync(join(dir, `${cmd}.cmd`), windowsCmdShim(nodePath, scriptPath));
  writeFileSync(join(dir, `${cmd}.ps1`), windowsPs1Shim(nodePath, scriptPath));
  writeFileSync(join(dir, cmd), windowsGitBashShim(nodePath, scriptPath));
}

function npmGlobalPrefix(env) {
  const r = runNpm(["prefix", "-g"], env);
  const p = (r.stdout || "").trim();
  return p || null;
}

function npmGlobalRoot(env) {
  const r = runNpm(["root", "-g"], env);
  const p = (r.stdout || "").trim();
  return p || null;
}

function replaceWithUnixSymlink(dest, target) {
  mkdirSync(dirname(dest), { recursive: true });
  unlinkQuiet(dest);
  symlinkSync(target, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // symlink chmod is a no-op on some systems
  }
}

/**
 * @param {{ home: string, env?: NodeJS.ProcessEnv, spec?: string }} opts
 * @returns {{
 *   ok: boolean,
 *   bin: string | null,
 *   target: string | null,
 *   script: string,
 *   npm: boolean,
 *   message: string,
 * }}
 */
export function installGlobalCli({ home, env = process.env, spec = PKG_ROOT }) {
  const platform = process.platform;
  const prefix = npmGlobalPrefix(env);
  const npmBin = prefix ? npmGlobalBinPath(prefix, CMD, platform) : null;
  // npm 11 refuses to replace an existing global bin (EEXIST). Last install
  // wins: drop our previous `mental` link (often leftover @mental/cli).
  if (npmBin) unlinkQuiet(npmBin);
  if (platform === "win32" && prefix) unlinkQuiet(join(prefix, CMD));

  const npm = runNpm(
    [
      "install",
      "-g",
      "--force",
      "--no-fund",
      "--no-audit",
      "--no-package-lock",
      spec,
    ],
    env,
  );

  const pathBin = userPathBin(home, CMD, platform);
  const fallbackScript = join(PKG_ROOT, "bin", "cli.mjs");
  const globalRoot = npmGlobalRoot(env);
  const fromNpm = globalRoot ? npmGlobalCliScript(globalRoot, NAME, platform) : null;
  const script = resolve(fromNpm && existsSync(fromNpm) ? fromNpm : fallbackScript);
  const npmTarget = npmBin && existsSync(npmBin) ? resolve(npmBin) : null;

  try {
    if (platform === "win32") {
      // ~/.local/bin *and* the npm prefix: 0.7.x left `mental` → cli.mjs
      // in both, and PowerShell prefers that leftover over mental.cmd.
      writeWindowsShims(dirname(pathBin), process.execPath, script);
      if (prefix) writeWindowsShims(npmGlobalBinDir(prefix, platform), process.execPath, script);
    } else {
      const target = npmTarget || script;
      if (resolve(pathBin) !== target) replaceWithUnixSymlink(pathBin, target);
      else if (!existsSync(pathBin) && existsSync(target)) replaceWithUnixSymlink(pathBin, target);
    }
  } catch (err) {
    const bin = npmTarget || (existsSync(pathBin) ? pathBin : null);
    if (bin) {
      return {
        ok: true,
        bin,
        target: bin,
        script,
        npm: npm.status === 0,
        message: `${CMD} → ${bin}`,
      };
    }
    return {
      ok: false,
      bin: pathBin,
      target: npmTarget,
      script,
      npm: npm.status === 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const bin = existsSync(pathBin) ? pathBin : npmTarget;
  const ok = Boolean(bin);
  const target = npmTarget || bin;
  return {
    ok,
    bin,
    target,
    script,
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
