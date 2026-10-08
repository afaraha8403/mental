/**
 * Conformance for the repo-local Claude Desktop skills in .agents/skills
 * (mirrored to .claude/skills). They are for coding sessions in this repo only:
 * never shipped in the npm package, never autoloaded by the Mental plugin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drift } from "../scripts/sync-project-skills.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILLS = ["claude-desktop-mods", "claude-desktop-plugins", "claude-desktop-extensions"];
const NAME_RE = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;

const skillDir = (name) => join(ROOT, ".agents", "skills", name);
const read = (file) => readFileSync(file, "utf8");

function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(m, "SKILL.md must start with YAML frontmatter");
  return m[1];
}

function scalar(fm, key) {
  const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

function description(fm) {
  const m = fm.match(/^description:[ \t]*>-?\r?\n((?:[ \t]+.*\r?\n?)+)/m);
  assert.ok(m, "description must be a folded block");
  return m[1].replace(/\s+/g, " ").trim();
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

for (const name of SKILLS) {
  test(`${name}: frontmatter is valid`, () => {
    const fm = frontmatter(read(join(skillDir(name), "SKILL.md")));
    assert.equal(scalar(fm, "name"), name);
    assert.match(name, NAME_RE);
    const desc = description(fm);
    assert.ok(desc.length >= 1 && desc.length <= 1024, `description length ${desc.length}`);
    assert.match(desc, /\bUse when\b/i);
    assert.equal(scalar(fm, "license"), "MIT");
    assert.ok(/^compatibility:/m.test(fm));
    assert.match(fm, /^when_to_use:\s*\|/m);
    const meta = fm.match(/^metadata:\r?\n((?:[ \t]+.*\r?\n?)+)/m);
    assert.ok(meta, "metadata map required");
    for (const line of meta[1].split(/\r?\n/).filter((l) => l.trim())) {
      assert.match(line, /^\s+[a-z-]+:\s*\S/, `metadata entry must be a string: ${line}`);
      assert.doesNotMatch(line, /:\s*\[|:\s*\{/, "metadata values must be strings");
    }
  });

  test(`${name}: body is concise and links every reference file`, () => {
    const dir = skillDir(name);
    const md = read(join(dir, "SKILL.md"));
    assert.ok(md.split(/\r?\n/).length <= 500, "SKILL.md must stay under 500 lines");
    const refs = readdirSync(join(dir, "references")).filter((f) => f.endsWith(".md"));
    assert.ok(refs.length > 0);
    for (const ref of refs) {
      assert.ok(md.includes(`references/${ref}`), `SKILL.md must link references/${ref}`);
    }
    for (const [, target] of md.matchAll(/\]\((references\/[^)#]+)\)/g)) {
      assert.ok(existsSync(join(dir, target)), `broken link ${target}`);
    }
  });

  test(`${name}: no secrets, no mental CLI prose, has safety guidance`, () => {
    for (const file of walk(skillDir(name)).filter((f) => f.endsWith(".md"))) {
      const text = read(file);
      assert.doesNotMatch(text, /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,})\b/, file);
      assert.doesNotMatch(text, /\bmental (init|install|heartbeat|journal|decide)\b/, file);
    }
    assert.match(read(join(skillDir(name), "SKILL.md")), /^## .*(Security|Safety)/im);
  });
}

test("claude-desktop skills are repo-local: not shipped, not autoloaded by the plugin", () => {
  const autoloaded = readdirSync(join(ROOT, "skills"));
  for (const name of SKILLS) {
    assert.ok(!autoloaded.includes(name), `${name} must not autoload`);
    assert.equal(existsSync(join(ROOT, "optional", name)), false, `${name} must not live in optional/`);
  }
  const pkg = JSON.parse(read(join(ROOT, "package.json")));
  for (const entry of pkg.files) {
    assert.ok(!/^\.(agents|claude|cursor|codex)(\/|$)/.test(entry), `package.json files must not ship ${entry}`);
  }
});

test(".claude/skills mirrors .agents/skills", () => {
  assert.deepEqual(drift(), []);
  for (const name of SKILLS) assert.ok(existsSync(join(ROOT, ".claude", "skills", name, "SKILL.md")));
});

test("JSON examples in the claude-desktop skills parse", () => {
  let count = 0;
  for (const name of SKILLS) {
    for (const file of walk(skillDir(name)).filter((f) => f.endsWith(".md"))) {
      for (const [, block] of read(file).matchAll(/```json\r?\n([\s\S]*?)```/g)) {
        assert.doesNotThrow(() => JSON.parse(block), `${file}: invalid JSON block`);
        count += 1;
      }
    }
  }
  assert.ok(count >= 6);
});

test("mod and plugin examples avoid reserved plugin names", () => {
  const reserved = /"name":\s*"(claude|anthropic|anthropics|claude-code|claude-mods|(claude|anthropic|anthropics|cc-plugin)-[^"]*)"/;
  for (const name of SKILLS) {
    for (const file of walk(skillDir(name)).filter((f) => f.endsWith(".md"))) {
      assert.doesNotMatch(read(file), reserved, `${file}: reserved plugin name in example`);
    }
  }
});
