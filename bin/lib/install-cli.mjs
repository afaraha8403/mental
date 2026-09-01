/**
 * Legacy CLI launcher inspection and transactional repair.
 *
 * npm is the sole owner of current `mental` launchers. Mental 0.7/0.8 also
 * wrote launchers under `~/.local/bin`; on Windows an extensionless symlink to
 * `cli.mjs` can open the system file chooser before Node starts.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CMD, VERSION } from "./pkg.mjs";

const OWNED_TARGET_RE =
  /(?:^|[/\\])node_modules[/\\](?:@balacode[/\\]mental|@mental[/\\]cli)[/\\]bin[/\\]cli\.mjs$/i;
const OWNED_BODY_RE =
  /(?:@balacode[/\\]mental|@mental[/\\]cli)[/\\]bin[/\\]cli\.mjs/i;
const RAW_CLI_MARKERS = [
  "mental — local-first OKF continuity CLI",
  'from "./lib/entry.mjs"',
];

function readSmall(file) {
  try {
    return readFileSync(file, "utf8").slice(0, 64 * 1024);
  } catch {
    return "";
  }
}

function samePath(a, b, platform = process.platform) {
  const left = resolve(a);
  const right = resolve(b);
  return platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/**
 * @param {string} file
 * @returns {{ owned: boolean, unsafe: boolean, kind: string }}
 */
export function classifyLegacyBin(file) {
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return { owned: false, unsafe: false, kind: "missing" };
  }
  if (st.isSymbolicLink()) {
    const target = readlinkSync(file);
    const owned = OWNED_TARGET_RE.test(target.replace(/\\/g, "/"));
    return {
      owned,
      unsafe: owned && /\.mjs$/i.test(target),
      kind: owned ? "mental-symlink" : "unknown-symlink",
    };
  }
  if (!st.isFile()) return { owned: false, unsafe: false, kind: "unknown" };
  const body = readSmall(file);
  const rawCli =
    /\.mjs$/i.test(file) && RAW_CLI_MARKERS.every((marker) => body.includes(marker));
  const shim = OWNED_BODY_RE.test(body.replace(/\\/g, "/"));
  return {
    owned: rawCli || shim,
    unsafe: rawCli || (/[/\\]cli\.mjs/i.test(body) && !/\bnode(?:\.exe)?\b/i.test(body)),
    kind: rawCli ? "mental-mjs" : shim ? "mental-shim" : "unknown-file",
  };
}

/**
 * Inspect only Mental's former private bin directory. The active npm bin can
 * equal this directory on Unix; callers pass `excludeDir` to preserve it.
 *
 * @param {string} home
 * @param {{ cmd?: string, excludeDir?: string | null, platform?: string }} [opts]
 */
export function inspectLegacyBins(home, opts = {}) {
  const cmd = opts.cmd ?? CMD;
  const dir = join(home, ".local", "bin");
  if (opts.excludeDir && samePath(dir, opts.excludeDir, opts.platform)) {
    return { dir, owned: [], unknown: [] };
  }
  const owned = [];
  const unknown = [];
  for (const name of [cmd, `${cmd}.cmd`, `${cmd}.ps1`, `${cmd}.mjs`]) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      try {
        lstatSync(path);
      } catch {
        continue;
      }
    }
    const found = { path, ...classifyLegacyBin(path) };
    (found.owned ? owned : unknown).push(found);
  }
  return { dir, owned, unknown };
}

export function npmGlobalBinDir(prefix, platform = process.platform) {
  return platform === "win32" ? prefix : join(prefix, "bin");
}

function runNpm(args, env, platform = process.platform) {
  const command = platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(command, args, {
    encoding: "utf8",
    env,
    shell: platform === "win32",
    windowsHide: platform === "win32",
  });
}

export function npmGlobalPrefix(env = process.env, platform = process.platform) {
  const r = runNpm(["prefix", "-g"], env, platform);
  if (r.error || r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

export function pathHasDir(pathValue, dir, platform = process.platform) {
  const parts = String(pathValue || "")
    .split(delimiter)
    .filter(Boolean);
  return parts.some((part) => samePath(part.replace(/^"|"$/g, ""), dir, platform));
}

function defaultVerify(npmBinDir, env, platform) {
  const executable = join(npmBinDir, platform === "win32" ? `${CMD}.cmd` : CMD);
  const r = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    env,
    shell: platform === "win32",
    windowsHide: platform === "win32",
  });
  return !r.error && r.status === 0 && (r.stdout || "").trim() === VERSION;
}

function stamp(now) {
  return new Date(now).toISOString().replace(/[:.]/g, "-");
}

/**
 * Quarantine fingerprinted legacy launchers, then verify npm's launcher.
 * Verification failure restores every moved path.
 *
 * @param {{
 *   home: string,
 *   env?: NodeJS.ProcessEnv,
 *   platform?: string,
 *   npmBinDir?: string | null,
 *   verify?: (npmBinDir: string) => boolean,
 *   now?: number,
 * }} opts
 */
export function repairLegacyBins(opts) {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const prefix = opts.npmBinDir ? null : npmGlobalPrefix(env, platform);
  const npmBinDir =
    opts.npmBinDir ?? (prefix ? npmGlobalBinDir(prefix, platform) : null);
  const base = {
    npmBinDir,
    moved: [],
    restored: [],
    unknown: [],
    quarantine: null,
  };
  if (!npmBinDir) return { ...base, ok: false, reason: "npm-prefix-unavailable" };
  if (!pathHasDir(env.PATH, npmBinDir, platform)) {
    return { ...base, ok: false, reason: "npm-bin-not-on-path" };
  }

  const scan = inspectLegacyBins(opts.home, {
    excludeDir: npmBinDir,
    platform,
  });
  base.unknown = scan.unknown;
  let quarantine = null;
  try {
    if (scan.owned.length) {
      quarantine = join(
        opts.home,
        ".mental",
        "migrations",
        "cli-shims",
        stamp(opts.now ?? Date.now()),
      );
      mkdirSync(quarantine, { recursive: true });
      for (const item of scan.owned) {
        const to = join(quarantine, item.path.slice(dirname(item.path).length + 1));
        renameSync(item.path, to);
        base.moved.push({ from: item.path, to, unsafe: item.unsafe, kind: item.kind });
      }
      base.quarantine = quarantine;
    }
  } catch (err) {
    rollback(base);
    return {
      ...base,
      ok: false,
      reason: "quarantine-failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const verified = (opts.verify ?? ((dir) => defaultVerify(dir, env, platform)))(
    npmBinDir,
  );
  if (!verified) {
    rollback(base);
    return { ...base, ok: false, reason: "npm-launcher-failed" };
  }
  return { ...base, ok: true, reason: base.moved.length ? "repaired" : "clean" };
}

function rollback(result) {
  for (const item of [...result.moved].reverse()) {
    try {
      if (!existsSync(item.from)) {
        mkdirSync(dirname(item.from), { recursive: true });
        renameSync(item.to, item.from);
        result.restored.push(item.from);
      }
    } catch {
      // Keep the quarantined file: never overwrite a path created mid-repair.
    }
  }
  result.moved = result.moved.filter((item) => existsSync(item.to));
  if (result.quarantine && result.moved.length === 0) {
    rmSync(result.quarantine, { recursive: true, force: true });
    result.quarantine = null;
  }
}
