import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  allRecipes,
  installLines,
  invokeArgv,
  isUnsafeWindowsLine,
  normalizeShell,
  packageSpecPath,
  unixAgentLines,
  win32SpawnCommand,
  windowsAgentLines,
  windowsUpgradeLines,
} from "../bin/lib/install-recipe.mjs";
import { NAME } from "../bin/lib/pkg.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function agentPaste(md) {
  const m = md.match(/#{2,} Paste this into your agent[\s\S]*?```text\r?\n([\s\S]*?)```/);
  assert.ok(m, "missing agent paste fence");
  return m[1];
}

test("normalizeShell maps pwsh, cmd.exe, zsh", () => {
  assert.equal(normalizeShell("pwsh"), "powershell");
  assert.equal(normalizeShell("PowerShell.exe"), "powershell");
  assert.equal(normalizeShell("cmd.exe"), "cmd");
  assert.equal(normalizeShell("zsh"), "bash");
  assert.equal(normalizeShell("sh"), "sh");
});

test("every fresh-install recipe is identical across powershell, cmd, bash, and sh", () => {
  const ids = allRecipes().map((r) => r.id);
  assert.ok(ids.includes("win-powershell"));
  assert.ok(ids.includes("win-cmd"));
  assert.ok(ids.includes("win-bash"));
  assert.ok(ids.includes("macos-bash"));
  assert.ok(ids.includes("linux-bash"));
  assert.ok(ids.includes("linux-sh"));
  for (const r of allRecipes()) {
    assert.deepEqual(r.lines, [
      `npm i -g ${NAME}`,
      "mental install",
      "mental doctor",
    ]);
    assert.doesNotMatch(r.lines.join("\n"), /\.mjs/);
  }
});

test("Windows CI spawn remaps npm/npx to .cmd and strips a trailing slash", () => {
  assert.equal(win32SpawnCommand("npx", "win32"), "npx.cmd");
  assert.equal(win32SpawnCommand("npm", "win32"), "npm.cmd");
  assert.equal(win32SpawnCommand("mental.cmd", "win32"), "mental.cmd");
  assert.equal(win32SpawnCommand("npx", "linux"), "npx");
  assert.equal(packageSpecPath("D:\\a\\mental\\mental\\"), "D:\\a\\mental\\mental");
  assert.equal(packageSpecPath("/tmp/mental/"), "/tmp/mental");
});

test("PowerShell fresh install uses the same bare mental command as Unix", () => {
  const lines = installLines({ platform: "win32", shell: "powershell" });
  assert.deepEqual(lines, windowsAgentLines());
  assert.deepEqual(lines, unixAgentLines());
  assert.equal(lines[1], "mental install");
  assert.equal(lines[2], "mental doctor");
  for (const line of lines) {
    assert.equal(isUnsafeWindowsLine(line), false, line);
  }
  const inv = invokeArgv(["install"], { platform: "win32", shell: "powershell" });
  assert.equal(inv.command, "mental");
  assert.doesNotMatch(inv.command, /\.mjs$/i);
});

test("cmd.exe fresh install also uses bare mental", () => {
  const lines = installLines({ platform: "win32", shell: "cmd" });
  assert.equal(lines[1], "mental install");
  assert.equal(isUnsafeWindowsLine(lines[1]), false);
  const inv = invokeArgv(["doctor"], { platform: "win32", shell: "cmd" });
  assert.equal(inv.command, "mental");
});

test("Unix and Git Bash recipes use mental", () => {
  assert.deepEqual(unixAgentLines(), [
    `npm i -g ${NAME}`,
    "mental install",
    "mental doctor",
  ]);
  for (const opts of [
    { platform: "darwin", shell: "bash" },
    { platform: "linux", shell: "sh" },
    { platform: "win32", shell: "bash" },
  ]) {
    const inv = invokeArgv(["install"], opts);
    assert.equal(inv.command, "mental");
    assert.equal(inv.line, "mental install");
  }
});

test("only raw .mjs invocation is unsafe in the npm-owned launcher model", () => {
  assert.equal(isUnsafeWindowsLine("mental install"), false);
  assert.equal(isUnsafeWindowsLine("bin/cli.mjs install"), true);
  assert.equal(isUnsafeWindowsLine("node bin/cli.mjs install"), false);
  assert.equal(isUnsafeWindowsLine("mental.cmd install"), false);
});

test("existing Windows users get one explicit repair step", () => {
  assert.deepEqual(windowsUpgradeLines(), [
    `npm i -g ${NAME}`,
    "mental-repair.cmd",
    "mental install",
    "mental doctor",
  ]);
});

test("agent paste and setup skill lock the universal recipe", () => {
  const paste = agentPaste(readFileSync(join(ROOT, "README.md"), "utf8"));
  const setup = readFileSync(join(ROOT, "skills", "mental-setup", "SKILL.md"), "utf8");
  for (const line of windowsAgentLines()) {
    assert.match(paste, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(setup, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const line of unixAgentLines()) {
    assert.match(paste, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(setup, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(paste, /Windows Terminal/);
  assert.match(paste, /mental-repair\.cmd/);
  assert.match(setup, /mental-repair\.cmd/);
});
