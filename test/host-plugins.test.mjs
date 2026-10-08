import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { CLAUDE_PANEL_MIN_VERSION, findMentalPlugin, hostPluginChecks, skipHostPluginCheck } from "../bin/lib/host-plugins.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { skillMetadataVersion } from "../bin/lib/lockstep.mjs";
import { VERSION } from "../bin/lib/pkg.mjs";

test("skipHostPluginCheck reads MENTAL_SKIP_HOST_PLUGIN_CHECK", () => {
  assert.equal(skipHostPluginCheck({ MENTAL_SKIP_HOST_PLUGIN_CHECK: "1" }), true);
  assert.equal(skipHostPluginCheck({ MENTAL_SKIP_HOST_PLUGIN_CHECK: "true" }), true);
  assert.equal(skipHostPluginCheck({ MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" }), false);
  assert.equal(skipHostPluginCheck({}), false);
});

test("findMentalPlugin reads claude plugin list --json array", () => {
  const hit = findMentalPlugin([
    { id: "mental@mental", version: "0.2.0", enabled: true },
    { id: "other@x", version: "9.0.0" },
  ]);
  assert.deepEqual(hit, { id: "mental@mental", version: "0.2.0" });
  assert.equal(findMentalPlugin([]), null);
  assert.equal(findMentalPlugin({ installed: [{ id: "mental@mental", version: "0.4.1" }] }).version, "0.4.1");
});

test("hostPluginChecks warns when Claude plugin is behind CLI", () => {
  const home = tempHome();
  const checks = hostPluginChecks({
    home,
    version: "0.4.1",
    env: { ...gitEnv(home), MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" },
    spawn: (command) => {
      if (command === "claude") {
        return {
          status: 0,
          stdout: JSON.stringify([{ id: "mental@mental", version: "0.2.0" }]),
          stderr: "",
          error: undefined,
        };
      }
      return { status: 127, stdout: "", stderr: "", error: undefined };
    },
  });
  const claude = checks.find((c) => c.id === "claude-plugin");
  assert.ok(claude);
  assert.equal(claude.ok, false);
  assert.equal(claude.level, "warn");
  assert.match(claude.message, /0\.2\.0/);
  assert.match(claude.message, /claude plugin update/);
  assert.equal(checks.some((c) => c.id === "copilot-plugin"), false);
});

test("hostPluginChecks is quiet when Claude has no Mental plugin", () => {
  const home = tempHome();
  const checks = hostPluginChecks({
    home,
    version: "0.4.1",
    env: { ...gitEnv(home), MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" },
    spawn: () => ({
      status: 0,
      stdout: JSON.stringify([{ id: "other@x", version: "1.0.0" }]),
      stderr: "",
      error: undefined,
    }),
  });
  assert.equal(checks.some((c) => c.id === "claude-plugin"), false);
  assert.equal(checks.some((c) => c.id === "claude-panel"), false);
});

test("hostPluginChecks reports whether Claude Code can run the /mental panel", () => {
  const home = tempHome();
  const run = (claudeVersion) =>
    hostPluginChecks({
      home,
      version: "0.4.1",
      env: { ...gitEnv(home), MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" },
      spawn: (command, args) => {
        if (command !== "claude") return { status: 127, stdout: "", stderr: "", error: undefined };
        if (args.includes("--version")) {
          return claudeVersion
            ? { status: 0, stdout: `${claudeVersion} (Claude Code)\n`, stderr: "", error: undefined }
            : { status: 1, stdout: "", stderr: "", error: undefined };
        }
        return { status: 0, stdout: JSON.stringify([{ id: "mental@mental", version: "0.4.1" }]), stderr: "", error: undefined };
      },
    }).find((c) => c.id === "claude-panel");

  const behind = run("2.1.286");
  assert.equal(behind.ok, false);
  assert.equal(behind.level, "warn");
  assert.match(behind.message, /2\.1\.286/);
  assert.match(behind.message, new RegExp(CLAUDE_PANEL_MIN_VERSION.replace(/\./g, "\\.")));

  const ready = run("2.2.0");
  assert.equal(ready.ok, true);
  assert.equal(ready.level, "info");
  assert.match(ready.message, /\/mental panel available/);

  const unknown = run("");
  assert.equal(unknown.ok, true);
  assert.equal(unknown.level, "info");
});

test("hostPluginChecks warns when a copied skill is behind", () => {
  const home = tempHome();
  mkdirSync(join(home, ".claude", "skills", "mental"), { recursive: true });
  writeFileSync(
    join(home, ".claude", "skills", "mental", "SKILL.md"),
    `---\nname: mental\nmetadata:\n  version: "0.1.0"\n---\n`,
  );
  const checks = hostPluginChecks({
    home,
    version: "0.4.1",
    env: { ...gitEnv(home), MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" },
    spawn: () => ({ status: 127, stdout: "", stderr: "", error: undefined }),
  });
  const skill = checks.find((c) => c.id === "skills-version");
  assert.ok(skill);
  assert.equal(skill.ok, false);
  assert.equal(skill.level, "warn");
  assert.match(skill.message, /mental install/);
});

test("install copies lockstepped procedure skill so hostPluginChecks can compare versions", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const copied = readFileSync(join(home, ".claude", "skills", "mental", "SKILL.md"), "utf8");
  const copiedVersion = skillMetadataVersion(copied);
  assert.equal(copiedVersion, VERSION, "copied skill must carry CLI version (bootstrap has none)");
  const checks = hostPluginChecks({
    home,
    version: VERSION,
    env: { ...gitEnv(home), MENTAL_SKIP_HOST_PLUGIN_CHECK: "0" },
    spawn: () => ({ status: 127, stdout: "", stderr: "", error: undefined }),
  });
  const skill = checks.find((c) => c.id === "skills-version");
  assert.ok(skill, "missing metadata.version would skip the skills-version check");
  assert.equal(skill.ok, true);
  assert.equal(skill.level, "info");
});

test("doctor reports claude-plugin when a fake claude is on PATH", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = `#!/usr/bin/env node
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify([{ id: "mental@mental", version: "0.1.0" }]));
}
`;
  if (process.platform === "win32") {
    writeFileSync(join(bin, "claude.js"), stub);
    writeFileSync(
      join(bin, "claude.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0claude.js" %*\r\n`,
    );
  } else {
    writeFileSync(join(bin, "claude"), stub);
    chmodSync(join(bin, "claude"), 0o755);
  }
  const r = mental(home, root, ["doctor", "--json"], {
    PATH: `${bin}${delimiter}${process.env.PATH || "/usr/bin"}`,
    MENTAL_SKIP_HOST_PLUGIN_CHECK: "0",
    MENTAL_SKIP_UPDATE_CHECK: "1",
  });
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  const claude = body.data.checks.find((c) => c.id === "claude-plugin");
  assert.ok(claude, JSON.stringify(body.data.checks.map((c) => c.id)));
  assert.equal(claude.ok, false);
  assert.match(claude.message, /0\.1\.0/);
  assert.match(claude.message, new RegExp(VERSION.replace(/\./g, "\\.")));
});
