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
