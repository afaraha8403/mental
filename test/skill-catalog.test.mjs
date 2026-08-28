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
  const skill = stripFrontmatter(readFileSync(join(ROOT, "skills/mental/SKILL.md"), "utf8"));
  const rule = stripFrontmatter(readFileSync(join(ROOT, "rules/mental.mdc"), "utf8"));
  const refs = readFileSync(join(ROOT, "skills/mental/references/cli.md"), "utf8");
  for (const name of mentionedCommands(`${skill}\n${rule}\n${refs}`)) {
    assert.ok(KNOWN.has(name), `skill/rule mentions mental ${name} which is not in the catalog`);
  }
});
