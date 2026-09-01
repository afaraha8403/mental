import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { inspectLegacyBins, repairLegacyBins } from "../bin/lib/install-cli.mjs";
import { initRepo, mental, tempHome } from "./helpers.mjs";

function seedLegacySymlink(home) {
  const target = join(
    home,
    "old-prefix",
    "node_modules",
    "@balacode",
    "mental",
    "bin",
    "cli.mjs",
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "#!/usr/bin/env node\n");
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const legacy = join(bin, "mental");
  symlinkSync(target, legacy);
  return legacy;
}

test("inspectLegacyBins fingerprints Mental-owned shims and leaves unknown files unknown", () => {
  const home = tempHome();
  const legacy = seedLegacySymlink(home);
  const unknown = join(home, ".local", "bin", "mental.cmd");
  writeFileSync(unknown, "@echo off\r\necho user-owned\r\n");

  const scan = inspectLegacyBins(home);
  assert.deepEqual(scan.owned.map((x) => x.path), [legacy]);
  assert.equal(scan.owned[0].unsafe, true);
  assert.deepEqual(scan.unknown.map((x) => x.path), [unknown]);
});

test("inspectLegacyBins recognizes Mental 0.8 custom cmd shims", () => {
  const home = tempHome();
  const file = join(home, ".local", "bin", "mental.cmd");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `@echo off\r\n"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\a\\AppData\\Roaming\\npm\\node_modules\\@balacode\\mental\\bin\\cli.mjs" %*\r\n`,
  );
  const scan = inspectLegacyBins(home);
  assert.deepEqual(scan.owned.map((x) => x.path), [file]);
  assert.equal(scan.owned[0].unsafe, false);
});

test("repairLegacyBins quarantines owned shims, preserves unknown files, and is idempotent", () => {
  const home = tempHome();
  const legacy = seedLegacySymlink(home);
  const unknown = join(home, ".local", "bin", "mental.cmd");
  writeFileSync(unknown, "@echo off\r\necho user-owned\r\n");
  const npmBinDir = join(home, "npm-bin");

  const repaired = repairLegacyBins({
    home,
    env: { PATH: npmBinDir },
    npmBinDir,
    verify: () => true,
    now: 1_700_000_000_000,
  });
  assert.equal(repaired.ok, true);
  assert.deepEqual(repaired.moved.map((x) => x.from), [legacy]);
  assert.equal(existsSync(legacy), false);
  assert.equal(readFileSync(unknown, "utf8"), "@echo off\r\necho user-owned\r\n");
  assert.equal(existsSync(repaired.moved[0].to), true);

  const again = repairLegacyBins({
    home,
    env: { PATH: npmBinDir },
    npmBinDir,
    verify: () => true,
  });
  assert.equal(again.ok, true);
  assert.deepEqual(again.moved, []);
});

test("repairLegacyBins restores quarantined shims when npm launcher verification fails", () => {
  const home = tempHome();
  const legacy = seedLegacySymlink(home);
  const npmBinDir = join(home, "npm-bin");

  const repaired = repairLegacyBins({
    home,
    env: { PATH: npmBinDir },
    npmBinDir,
    verify: () => false,
  });
  assert.equal(repaired.ok, false);
  assert.equal(existsSync(legacy), true);
  assert.deepEqual(repaired.moved, []);
  assert.deepEqual(repaired.restored, [legacy]);
});

test("repairLegacyBins refuses migration when npm bin is not on PATH", () => {
  const home = tempHome();
  const legacy = seedLegacySymlink(home);

  const repaired = repairLegacyBins({
    home,
    env: { PATH: join(home, "elsewhere") },
    npmBinDir: join(home, "npm-bin"),
    verify: () => true,
  });
  assert.equal(repaired.ok, false);
  assert.equal(repaired.reason, "npm-bin-not-on-path");
  assert.equal(existsSync(legacy), true);
});

test("doctor reports an unsafe legacy launcher with the repair command", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const legacy = seedLegacySymlink(home);
  const npmPrefix = join(home, "active-npm");
  const r = mental(home, root, ["doctor", "--json"], {
    npm_config_prefix: npmPrefix,
    PATH: `${dirname(legacy)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH || ""}`,
  });
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  const check = body.data.checks.find((x) => x.id === "cli-shadow");
  assert.ok(check, JSON.stringify(body.data.checks.map((x) => x.id)));
  assert.equal(check.ok, false);
  assert.match(check.message, /mental-repair/);
  assert.match(check.message, /cli\.mjs/);
});
