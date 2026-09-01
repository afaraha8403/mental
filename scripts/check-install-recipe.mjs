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
  unixAgentLines,
  windowsAgentLines,
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
  const exe =
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(exe),
  });
  if (r.status !== 0) {
    fail(
      `${command} ${args.join(" ")} exited ${r.status}\n${r.stdout || ""}\n${r.stderr || ""}`,
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
  PKG_ROOT,
]);

const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
const env = {
  ...process.env,
  npm_config_prefix: prefix,
  PATH: `${binDir}${delimiter}${process.env.PATH || ""}`,
};

if (process.platform === "win32") {
  const cmd = join(prefix, "mental.cmd");
  if (!existsSync(cmd)) fail(`npm prefix missing mental.cmd at ${cmd}`);
  const ver = run(cmd, ["--version"], { env });
  if (ver.stdout.trim() !== VERSION) fail(`mental.cmd version ${ver.stdout.trim()}`);
  const npxInv = invokeArgv(["--version"], { platform: "win32", shell: "powershell" });
  run(npxInv.command, ["--yes", "--package", PKG_ROOT, "mental", "--version"], { env });
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
