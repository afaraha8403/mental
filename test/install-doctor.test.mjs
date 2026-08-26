import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gitEnv, initRepo, tempHome } from "./helpers.mjs";
import { ensureMentalExcluded, MENTAL_IGNORE_LINE } from "../bin/lib/ignore.mjs";
import { defaultExcludesFile } from "../bin/lib/ignore.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

function mental(home, cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: gitEnv(home),
  });
}

test("mental install --json copies skill + rule and creates ~/.mental skeleton", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(existsSync(join(home, ".claude", "skills", "mental", "SKILL.md")), true);
  assert.equal(existsSync(join(home, ".cursor", "skills", "mental", "SKILL.md")), true);
  assert.equal(existsSync(join(home, ".agents", "skills", "mental", "SKILL.md")), true);
  assert.equal(existsSync(join(home, ".config", "opencode", "skills", "mental", "SKILL.md")), true);
  assert.equal(existsSync(join(home, ".cursor", "rules", "mental.mdc")), true);
  assert.equal(existsSync(join(home, ".mental", "index.md")), true);
  assert.match(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8"), /BEGIN mental/);
  assert.doesNotMatch(readFileSync(join(home, ".claude", "skills", "mental", "SKILL.md"), "utf8"), /balakit/i);
  const bin = join(home, ".local", "bin", "mental");
  assert.equal(existsSync(bin), true, "install should put mental on ~/.local/bin");
  const ver = spawnSync(bin, ["--version"], { encoding: "utf8", env: gitEnv(home) });
  assert.equal(ver.status, 0, ver.stderr || ver.stdout);
  assert.match(ver.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("mental install follows a symlink skill dir (claude → agents)", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const agents = join(home, ".agents", "skills", "mental");
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, "SKILL.md"), "# old leftover skill\n");
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(agents, join(home, ".claude", "skills", "mental"));

  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  const skill = readFileSync(join(agents, "SKILL.md"), "utf8");
  assert.match(skill, /Mental — project continuity/);
  assert.doesNotMatch(skill, /balakit/i);
  assert.equal(readFileSync(join(home, ".claude", "skills", "mental", "SKILL.md"), "utf8"), skill);
});

test("doctor --fix-ignore appends .mental/ to isolated global excludes", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mkdirSync(join(root, ".mental"), { recursive: true });
  const env = gitEnv(home);
  const r = mental(home, root, ["doctor", "--fix-ignore", "--json"]);
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  const file = defaultExcludesFile(home, env);
  const cur = readFileSync(file, "utf8");
  assert.match(cur, /^\.mental\/$/m);
  assert.match(cur, /^\.mental-id$/m);

  const ci = spawnSync("git", ["-C", root, "check-ignore", "-q", "--", ".mental/probe"], {
    encoding: "utf8",
    env,
  });
  assert.equal(ci.status, 0, "git check-ignore should succeed after --fix-ignore");
});

test("ensureMentalExcluded is idempotent", () => {
  const home = tempHome();
  const env = gitEnv(home);
  const first = ensureMentalExcluded({ home, env });
  assert.equal(first.ok, true);
  const before = readFileSync(first.file, "utf8");
  const second = ensureMentalExcluded({ home, env });
  assert.equal(second.appended, false);
  assert.equal(readFileSync(second.file, "utf8"), before);
  const n = before.split(/\r?\n/).filter((l) => l.trim() === MENTAL_IGNORE_LINE).length;
  assert.equal(n, 1);
});
