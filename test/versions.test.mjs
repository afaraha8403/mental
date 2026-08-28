import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProductVersion,
  readProductVersions,
  skillMetadataVersion,
  SKILL_RELATIVE,
} from "../bin/lib/lockstep.mjs";
import { VERSION } from "../bin/lib/pkg.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("repo product versions lockstep to package.json", () => {
  const r = readProductVersions(ROOT);
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(r.version, VERSION);
  assert.equal(r.files["plugin.json"], VERSION);
  assert.equal(r.files[".cursor-plugin/plugin.json"], VERSION);
  assert.equal(r.files[".claude-plugin/plugin.json"], VERSION);
  assert.equal(r.files["package-lock.json"], VERSION);
  assert.equal(r.files['package-lock.json#packages[""]'], VERSION);
  assert.equal(r.files["skill/mental/SKILL.md"], VERSION);
  assert.equal(r.files["optional/mental-track/SKILL.md"], VERSION);
  assert.equal(r.files[".claude-plugin/marketplace.json"], null);
});

test("applyProductVersion rewrites json + skill metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "mental-lockstep-"));
  const skillDir = join(dir, "skill", "mental");
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(join(dir, ".cursor-plugin"));
  mkdirSync(join(dir, ".claude-plugin"));
  const files = {
    "package.json": { name: "x", version: "0.0.1" },
    "plugin.json": { name: "mental", version: "0.0.1" },
    ".cursor-plugin/plugin.json": { name: "mental", version: "0.0.1" },
    ".claude-plugin/plugin.json": { name: "mental", version: "0.0.1" },
    "package-lock.json": { name: "x", version: "0.0.1", packages: { "": { version: "0.0.1" } } },
    ".claude-plugin/marketplace.json": { name: "mental", plugins: [{ name: "mental", source: "./" }] },
  };
  for (const [rel, data] of Object.entries(files)) {
    writeFileSync(join(dir, rel), `${JSON.stringify(data, null, 2)}\n`);
  }
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: mental\nmetadata:\n  author: x\n  version: "0.0.1"\n---\nbody\n`,
  );
  applyProductVersion(dir, "0.0.2");
  const r = readProductVersions(dir);
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(r.version, "0.0.2");
  assert.equal(skillMetadataVersion(readFileSync(join(skillDir, "SKILL.md"), "utf8")), "0.0.2");
});

test("readProductVersions fails when a shim drifts", () => {
  const dir = mkdtempSync(join(tmpdir(), "mental-lockstep-"));
  mkdirSync(join(dir, "skill", "mental"), { recursive: true });
  mkdirSync(join(dir, ".cursor-plugin"));
  mkdirSync(join(dir, ".claude-plugin"));
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ version: "1.0.0" }, null, 2)}\n`);
  writeFileSync(join(dir, "plugin.json"), `${JSON.stringify({ version: "1.0.0" }, null, 2)}\n`);
  writeFileSync(join(dir, ".cursor-plugin", "plugin.json"), `${JSON.stringify({ version: "0.9.0" }, null, 2)}\n`);
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), `${JSON.stringify({ version: "1.0.0" }, null, 2)}\n`);
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify({ plugins: [{ source: "./" }] }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "package-lock.json"), `${JSON.stringify({ version: "1.0.0" }, null, 2)}\n`);
  writeFileSync(
    join(dir, "skill", "mental", "SKILL.md"),
    `---\nname: mental\nmetadata:\n  version: "1.0.0"\n---\n`,
  );
  const r = readProductVersions(dir);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes(".cursor-plugin")));
});

test("marketplace plugin entry version is drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "mental-lockstep-"));
  mkdirSync(join(dir, "skill", "mental"), { recursive: true });
  mkdirSync(join(dir, ".cursor-plugin"));
  mkdirSync(join(dir, ".claude-plugin"));
  const v = { version: "1.0.0" };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, ".cursor-plugin", "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, "package-lock.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify({ plugins: [{ source: "./", version: "1.0.0" }] }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "skill", "mental", "SKILL.md"),
    `---\nname: mental\nmetadata:\n  version: "1.0.0"\n---\n`,
  );
  const r = readProductVersions(dir);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("must not set version")));
});

test("bootstrap plugin skill omits metadata.version", () => {
  const md = readFileSync(join(ROOT, "skills", "mental-setup", "SKILL.md"), "utf8");
  assert.equal(skillMetadataVersion(md), null);
});

test("applyProductVersion does not inject version into the plugin bootstrap skill", () => {
  const dir = mkdtempSync(join(tmpdir(), "mental-lockstep-"));
  const skillDir = join(dir, "skill", "mental");
  const bootstrapDir = join(dir, "skills", "mental-setup");
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(bootstrapDir, { recursive: true });
  mkdirSync(join(dir, ".cursor-plugin"));
  mkdirSync(join(dir, ".claude-plugin"));
  const files = {
    "package.json": { name: "x", version: "0.0.1" },
    "plugin.json": { name: "mental", version: "0.0.1" },
    ".cursor-plugin/plugin.json": { name: "mental", version: "0.0.1" },
    ".claude-plugin/plugin.json": { name: "mental", version: "0.0.1" },
    "package-lock.json": { name: "x", version: "0.0.1", packages: { "": { version: "0.0.1" } } },
    ".claude-plugin/marketplace.json": { name: "mental", plugins: [{ name: "mental", source: "./" }] },
  };
  for (const [rel, data] of Object.entries(files)) {
    writeFileSync(join(dir, rel), `${JSON.stringify(data, null, 2)}\n`);
  }
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: mental\nmetadata:\n  author: x\n  version: "0.0.1"\n---\nbody\n`,
  );
  const bootstrap = `---\nname: mental-setup\nmetadata:\n  author: x\n---\n# Mental setup — install the CLI\n`;
  writeFileSync(join(bootstrapDir, "SKILL.md"), bootstrap);
  applyProductVersion(dir, "0.0.2");
  const r = readProductVersions(dir);
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(skillMetadataVersion(readFileSync(join(skillDir, "SKILL.md"), "utf8")), "0.0.2");
  assert.equal(skillMetadataVersion(readFileSync(join(bootstrapDir, "SKILL.md"), "utf8")), null);
  assert.equal(readFileSync(join(bootstrapDir, "SKILL.md"), "utf8"), bootstrap);
});

test("readProductVersions fails when only the old skills/mental path exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "mental-lockstep-"));
  mkdirSync(join(dir, "skills", "mental"), { recursive: true });
  mkdirSync(join(dir, ".cursor-plugin"));
  mkdirSync(join(dir, ".claude-plugin"));
  const v = { version: "1.0.0" };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, ".cursor-plugin", "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(join(dir, "package-lock.json"), `${JSON.stringify(v, null, 2)}\n`);
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify({ plugins: [{ source: "./" }] }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "skills", "mental", "SKILL.md"),
    `---\nname: mental\nmetadata:\n  version: "1.0.0"\n---\n`,
  );
  const r = readProductVersions(dir);
  assert.equal(r.ok, false);
  assert.equal(r.files[SKILL_RELATIVE], null);
  assert.equal(r.files["skills/mental/SKILL.md"], undefined);
  assert.ok(r.errors.some((e) => e.includes(SKILL_RELATIVE)));
});
