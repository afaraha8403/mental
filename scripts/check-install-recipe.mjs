#!/usr/bin/env node
/**
 * Release/CI check: docs match install recipes, and this OS can invoke the CLI
 * without spawning a .mjs file as argv0.
 *
 *   node scripts/check-install-recipe.mjs
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { NAME, PKG_ROOT, VERSION } from "../bin/lib/pkg.mjs";
import {
  allRecipes,
  invokeArgv,
  packageSpecPath,
  unixAgentLines,
  win32SpawnCommand,
  windowsAgentLines,
  windowsUpgradeLines,
} from "../bin/lib/install-recipe.mjs";

const ROOT = PKG_ROOT;

function fail(msg) {
  process.stderr.write(`check-install-recipe: ${msg}\n`);
  process.exit(1);
}

function run(command, args, opts = {}) {
  if (/\.mjs$/i.test(command)) {
    fail(`refusing to spawn .mjs as argv0: ${command}`);
  }
  const exe = win32SpawnCommand(command, process.platform);
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(exe),
    windowsHide: process.platform === "win32",
  });
  if (r.error || r.status !== 0) {
    fail(
      `${command} ${args.join(" ")} exited ${r.status}${r.error ? ` (${r.error.message})` : ""}\n${r.stdout || ""}\n${r.stderr || ""}`,
    );
  }
  return r;
}

function mustContain(label, text, line) {
  if (!text.includes(line)) fail(`${label} missing ${JSON.stringify(line)}`);
}

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const installDoc = readFileSync(join(ROOT, "docs", "install.md"), "utf8");
const setup = readFileSync(join(ROOT, "skills", "mental-setup", "SKILL.md"), "utf8");
for (const [label, text] of [
  ["README", readme],
  ["docs/install.md", installDoc],
  ["skills/mental-setup", setup],
]) {
  for (const line of [...windowsAgentLines(), ...unixAgentLines()]) {
    mustContain(label, text, line);
  }
  for (const line of windowsUpgradeLines()) mustContain(label, text, line);
}

for (const r of allRecipes()) {
  if (r.lines[0] !== `npm i -g ${NAME}`) fail(`${r.id} missing npm i -g`);
  if (r.lines.some((l) => /\.mjs/i.test(l))) fail(`${r.id} names a .mjs file`);
}

const local = run(process.execPath, [join(PKG_ROOT, "bin", "cli.mjs"), "--version"]);
if (local.stdout.trim() !== VERSION) {
  fail(`local CLI version ${local.stdout.trim()} != ${VERSION}`);
}

const prefix = mkdtempSync(join(tmpdir(), "mental-recipe-"));
run("npm", [
  "install",
  "-g",
  "--prefix",
  prefix,
  "--no-fund",
  "--no-audit",
  "--no-package-lock",
  packageSpecPath(PKG_ROOT),
]);

const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
const env = {
  ...process.env,
  npm_config_prefix: prefix,
  PATH: `${binDir}${delimiter}${process.env.PATH || ""}`,
};

if (process.platform === "win32") {
  const cmd = join(prefix, "mental.cmd");
  const repair = join(prefix, "mental-repair.cmd");
  if (!existsSync(cmd)) fail(`npm prefix missing mental.cmd at ${cmd}`);
  if (!existsSync(repair)) fail(`npm prefix missing mental-repair.cmd at ${repair}`);
  const ver = run(cmd, ["--version"], { env });
  if (ver.stdout.trim() !== VERSION) fail(`mental.cmd version ${ver.stdout.trim()}`);
  run(repair, ["--json"], { env });
  const powerShell = run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "mental --version"],
    { env },
  );
  if (powerShell.stdout.trim() !== VERSION) {
    fail(`PowerShell bare mental version ${powerShell.stdout.trim()}`);
  }
  const commandPrompt = run("cmd.exe", ["/d", "/s", "/c", "mental --version"], { env });
  if (commandPrompt.stdout.trim() !== VERSION) {
    fail(`cmd bare mental version ${commandPrompt.stdout.trim()}`);
  }
  const gitBash = run("bash.exe", ["--noprofile", "--norc", "-c", "mental --version"], { env });
  if (gitBash.stdout.trim() !== VERSION) {
    fail(`Git Bash bare mental version ${gitBash.stdout.trim()}`);
  }
} else {
  const bin = join(prefix, "bin", "mental");
  if (!existsSync(bin)) fail(`npm prefix missing mental at ${bin}`);
  const ver = run(bin, ["--version"], { env });
  if (ver.stdout.trim() !== VERSION) fail(`mental version ${ver.stdout.trim()}`);
  const unix = invokeArgv(["--version"], { platform: process.platform, shell: "bash" });
  if (unix.command !== "mental") fail(`unix invoke is ${unix.command}`);
  run(bin, unix.args, { env });
}

process.stdout.write(
  `check-install-recipe: ok ${VERSION} recipes=${allRecipes().length} platform=${process.platform}\n`,
);
