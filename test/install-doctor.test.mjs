import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { ensureMentalExcluded, MENTAL_IGNORE_LINE } from "../bin/lib/ignore.mjs";
import { defaultExcludesFile } from "../bin/lib/ignore.mjs";
import { skillSourceDir } from "../bin/lib/install-skills.mjs";

const BALAKIT_MENTAL_RULE = `---
description: Project continuity — derive current state before substantive work.
alwaysApply: true
---

# The \`.mental/\` Project Continuity Layer

Read the Mental data policy from \`.balakit/installed.json\` (\`mentalDataPolicy\`).
When ignore fails, tell the user to run \`npx balakit doctor\`.
`;

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

test("install overwrites an existing global mental bin", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const prefixBin = join(home, ".local", "bin");
  mkdirSync(prefixBin, { recursive: true });
  writeFileSync(join(prefixBin, "mental"), "#!/bin/sh\necho leftover\n");
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.cli.npm, true, JSON.stringify(body.data.cli));
  const ver = spawnSync(join(home, ".local", "bin", "mental"), ["--version"], {
    encoding: "utf8",
    env: gitEnv(home),
  });
  assert.equal(ver.status, 0, ver.stderr || ver.stdout);
  assert.match(ver.stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.doesNotMatch(ver.stdout, /leftover/);
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
  assert.equal(body.ok, r.status !== 3);
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

test("install removes leftover Balakit Mental skill/rule; doctor warns first", () => {
  const home = tempHome();
  const { root } = initRepo(home);

  const gemini = join(home, ".gemini", "skills", "mental");
  mkdirSync(gemini, { recursive: true });
  writeFileSync(join(gemini, "SKILL.md"), BALAKIT_MENTAL_RULE);

  mkdirSync(join(home, ".cursor", "rules"), { recursive: true });
  writeFileSync(join(home, ".cursor", "rules", "mental.mdc"), BALAKIT_MENTAL_RULE);

  mkdirSync(join(root, ".cursor", "skills", "mental"), { recursive: true });
  writeFileSync(join(root, ".cursor", "skills", "mental", "SKILL.md"), BALAKIT_MENTAL_RULE);

  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".claude", "CLAUDE.md"),
    `<!-- BEGIN balakit (managed — edits inside are overwritten on reinstall) -->
${BALAKIT_MENTAL_RULE}
<!-- END balakit -->
`,
  );

  const pre = mental(home, root, ["doctor", "--json"]);
  assert.ok(pre.status === 0 || pre.status === 3, pre.stderr || pre.stdout);
  const preBody = JSON.parse(pre.stdout);
  const warn = preBody.data.checks.find((c) => c.id === "legacy-balakit");
  assert.ok(warn, "doctor should flag leftover Balakit Mental wiring");
  assert.equal(warn.level, "warn");

  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.ok(body.data.legacyRemoved.length >= 3, JSON.stringify(body.data.legacyRemoved));
  assert.equal(existsSync(gemini), false);
  assert.equal(existsSync(join(root, ".cursor", "skills", "mental")), false);
  assert.doesNotMatch(readFileSync(join(home, ".cursor", "rules", "mental.mdc"), "utf8"), /npx balakit doctor/);
  assert.match(readFileSync(join(home, ".cursor", "rules", "mental.mdc"), "utf8"), /Mental skill/);
  assert.doesNotMatch(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8"), /BEGIN balakit/);
  assert.match(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8"), /BEGIN mental/);

  const post = mental(home, root, ["doctor", "--json"]);
  const postBody = JSON.parse(post.stdout);
  assert.equal(postBody.data.checks.some((c) => c.id === "legacy-balakit"), false);
});

test("install copies the full procedure skill, not the plugin bootstrap", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true);

  const cursor = readFileSync(join(home, ".cursor", "skills", "mental", "SKILL.md"), "utf8");
  const claude = readFileSync(join(home, ".claude", "skills", "mental", "SKILL.md"), "utf8");
  for (const skill of [cursor, claude]) {
    assert.match(skill, /^name:\s*mental\s*$/m);
    assert.doesNotMatch(skill, /^name:\s*mental-setup\s*$/m);
    assert.match(skill, /Mental — project continuity/);
    assert.doesNotMatch(skill, /Mental setup — install the CLI/);
  }
  assert.equal(existsSync(join(home, ".cursor", "skills", "mental", "references", "cli.md")), true);
});

test("install does not write the plugin bootstrap into user skill dirs", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true);
  assert.equal(existsSync(join(home, ".cursor", "skills", "mental-setup")), false);
  assert.equal(existsSync(join(home, ".claude", "skills", "mental-setup")), false);
});

test("skillSourceDir is skill/mental, not the plugin skills/ tree", () => {
  const src = skillSourceDir();
  assert.ok(src.endsWith(join("skill", "mental")), src);
  assert.ok(!src.endsWith(join("skills", "mental")), src);
  assert.equal(existsSync(join(src, "SKILL.md")), true);
});

test("install --project vendors the procedure skill into the repo", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json", "--project"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  const vendored = join(root, ".github", "skills", "mental");
  assert.equal(existsSync(join(vendored, "SKILL.md")), true);
  const skill = readFileSync(join(vendored, "SKILL.md"), "utf8");
  assert.match(skill, /Mental — project continuity/);
  assert.doesNotMatch(skill, /Mental setup — install the CLI/);
  assert.equal(existsSync(join(vendored, "references", "cli.md")), true);
  assert.equal(existsSync(join(root, ".github", "skills", "mental-setup")), false);
});
