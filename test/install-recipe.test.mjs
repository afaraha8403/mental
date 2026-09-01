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
  unixAgentLines,
  windowsAgentLines,
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

test("every published recipe covers powershell, cmd, bash, and sh", () => {
  const ids = allRecipes().map((r) => r.id);
  assert.ok(ids.includes("win-powershell"));
  assert.ok(ids.includes("win-cmd"));
  assert.ok(ids.includes("win-bash"));
  assert.ok(ids.includes("macos-bash"));
  assert.ok(ids.includes("linux-bash"));
  assert.ok(ids.includes("linux-sh"));
  for (const r of allRecipes()) {
    assert.equal(r.lines.length, 3, r.id);
    assert.equal(r.lines[0], `npm i -g ${NAME}`);
    assert.doesNotMatch(r.lines.join("\n"), /\.mjs/);
  }
});

test("PowerShell recipe uses npx --yes, never bare mental", () => {
  const lines = installLines({ platform: "win32", shell: "powershell" });
  assert.deepEqual(lines, windowsAgentLines());
  assert.equal(lines[1], `npx --yes ${NAME} install`);
  assert.equal(lines[2], `npx --yes ${NAME} doctor`);
  for (const line of lines) {
    assert.equal(isUnsafeWindowsLine(line), false, line);
  }
  const inv = invokeArgv(["install"], { platform: "win32", shell: "powershell" });
  assert.equal(inv.command, "npx");
  assert.doesNotMatch(inv.command, /\.mjs$/i);
});

test("cmd.exe recipe uses mental.cmd", () => {
  const lines = installLines({ platform: "win32", shell: "cmd" });
  assert.equal(lines[1], "mental.cmd install");
  assert.equal(isUnsafeWindowsLine(lines[1]), false);
  const inv = invokeArgv(["doctor"], { platform: "win32", shell: "cmd" });
  assert.equal(inv.command, "mental.cmd");
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

test("bare mental and raw .mjs are unsafe Windows lines", () => {
  assert.equal(isUnsafeWindowsLine("mental install"), true);
  assert.equal(isUnsafeWindowsLine("bin/cli.mjs install"), true);
  assert.equal(isUnsafeWindowsLine("npx --yes @balacode/mental install"), false);
  assert.equal(isUnsafeWindowsLine("mental.cmd install"), false);
});

test("agent paste and setup skill lock both OS recipes", () => {
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
  assert.match(paste, /Never run bare mental in PowerShell/);
  assert.match(setup, /Never run bare `mental` in PowerShell/);
});
