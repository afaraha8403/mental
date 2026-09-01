import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { catalogNames } from "../bin/lib/catalog.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KNOWN = new Set([...catalogNames(), "help"]);

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function mentionedCommands(text) {
  const names = new Set();
  const re = /(?<![./])\bmental\s+([a-z][a-z0-9-]*)/g;
  let m;
  while ((m = re.exec(text))) names.add(m[1]);
  return names;
}

test("skill maps for-later phrases to attention --status later, not note", () => {
  const skill = stripFrontmatter(readFileSync(join(ROOT, "skill/mental/SKILL.md"), "utf8"));
  assert.match(skill, /--status later/);
  assert.match(skill, /come back to this/i);
  assert.match(skill, /Never use `note` for "for later"/);
});

test("skill and rule command names are in the catalog", () => {
  const skill = stripFrontmatter(readFileSync(join(ROOT, "skill/mental/SKILL.md"), "utf8"));
  const rule = stripFrontmatter(readFileSync(join(ROOT, "rules/mental.mdc"), "utf8"));
  const refs = readFileSync(join(ROOT, "skill/mental/references/cli.md"), "utf8");
  for (const name of mentionedCommands(`${skill}\n${rule}\n${refs}`)) {
    assert.ok(KNOWN.has(name), `skill/rule mentions mental ${name} which is not in the catalog`);
  }
});

test("plugin bootstrap skill only names setup commands", () => {
  const setup = stripFrontmatter(readFileSync(join(ROOT, "skills/mental-setup/SKILL.md"), "utf8"));
  const allowed = new Set(["install", "doctor", "help", "where", "option"]);
  for (const name of mentionedCommands(setup)) {
    assert.ok(allowed.has(name), `bootstrap mentions mental ${name}`);
  }
});

test("bootstrap skill does not leak continuity commands or auto-enable optionals", () => {
  const setup = stripFrontmatter(readFileSync(join(ROOT, "skills/mental-setup/SKILL.md"), "utf8"));
  const mentioned = mentionedCommands(setup);
  const forbidden = [
    "journal",
    "heartbeat",
    "handoff",
    "decide",
    "park",
    "pulse",
    "search",
    "serve",
    "track",
    "attention",
    "note",
    "list",
    "show",
    "status",
  ];
  for (const name of forbidden) {
    assert.equal(mentioned.has(name), false, `bootstrap leaks continuity command: mental ${name}`);
  }
  // Letter-start option name so ellipsis prose (`mental option … on`) is not a false positive.
  assert.doesNotMatch(setup, /\bmental option [a-z][a-z0-9-]* on\b/);
});

test("bootstrap skill fails open, skips plugin MCP, and omits the procedure receipt", () => {
  const setup = readFileSync(join(ROOT, "skills/mental-setup/SKILL.md"), "utf8");
  assert.match(setup, /Missing Mental must not block the user's coding task \(fail open\)/);
  assert.match(setup, /Do not start a plugin MCP server/);
  assert.doesNotMatch(setup, /🧠 \*\*Mental\*\*/);
});

test("Track skill defines renderer-safe questions and plain-text fallback", () => {
  const track = readFileSync(join(ROOT, "optional/mental-track/SKILL.md"), "utf8");
  assert.match(track, /one single-select question at a time/);
  assert.match(track, /allow_multiple: false/);
  assert.match(track, /\(Recommended\)/);
  assert.match(track, /option labels under 40 characters/);
  assert.match(track, /numbered options as plain text/);
  assert.match(track, /Do not require markdown/);
  assert.match(track, /host-specific controls/);
});

function agentPaste(md) {
  const m = md.match(/#{2,} Paste this into your agent[\s\S]*?```text\r?\n([\s\S]*?)```/);
  assert.ok(m, "missing agent paste fence");
  return m[1];
}

test("README and install-doc agent pastes stay identical and skills-only", () => {
  const readme = agentPaste(readFileSync(join(ROOT, "README.md"), "utf8"));
  const install = agentPaste(readFileSync(join(ROOT, "docs/install.md"), "utf8"));
  assert.equal(readme, install, "README paste must match docs/install.md paste");
  assert.match(readme, /skills-only/);
  assert.match(readme, /skills\/mental-setup/);
  assert.match(readme, /skill\/mental/);
  assert.match(readme, /Do not start a plugin MCP server/);
  assert.match(readme, /fail open/);
  assert.match(readme, /mental-repair\.cmd/);
  assert.match(readme, /npm owns the executable/);
  assert.match(readme, /Never run a \.mjs file/);
  assert.match(readme, /Do not install from a git clone or plugin cache/);
  assert.match(readme, /npm i -g @balacode\/mental/);
  assert.match(readme, /Fresh install \(PowerShell, cmd, Windows Terminal, Git Bash, macOS, Linux\)/);
  assert.match(readme, /Existing Windows install from Mental 0\.8\.1 or older/);
  assert.doesNotMatch(readme, /cli\.mjs/);
  assert.doesNotMatch(readme, /Install Mental CLI from https:\/\//);
  assert.doesNotMatch(readme, /do not duplicate setup/);
  assert.doesNotMatch(readme, /mcp\.json/);
});

test("bootstrap skill never names cli.mjs (Windows Open With bait)", () => {
  const setup = readFileSync(join(ROOT, "skills", "mental-setup", "SKILL.md"), "utf8");
  assert.doesNotMatch(setup, /cli\.mjs/);
  assert.match(setup, /Never execute a `\.mjs` file/);
  assert.match(setup, /Do not install from a git clone or plugin cache/);
});
