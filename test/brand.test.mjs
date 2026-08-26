import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandMark, kindLine, useAsciiBrand } from "../bin/lib/output.mjs";
import { formatHeartbeat } from "../bin/lib/heartbeat.mjs";
import { mental, initRepo, tempHome } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EMOJI = /🧠|📓|🚦|🎯|📝|🔍/;

test("brandMark and kindLine honor MENTAL_ASCII", () => {
  assert.equal(useAsciiBrand({}), false);
  assert.equal(brandMark({}), "🧠");
  assert.equal(kindLine("journal", "appended x.md", {}), "📓 appended x.md");
  assert.equal(brandMark({ MENTAL_ASCII: "1" }), "[mental]");
  assert.equal(kindLine("attention", "wrote y.md", { MENTAL_ASCII: "1" }), "[attention] wrote y.md");
});

test("TTY writes use type emoji; --json stays ASCII", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const tty = mental(home, root, ["journal", "--title", "Brand check"]);
  assert.equal(tty.status, 0, tty.stderr || tty.stdout);
  assert.match(tty.stdout, /📓 appended journal\//);

  const json = mental(home, root, ["journal", "--json", "--title", "JSON check"]);
  assert.equal(json.status, 0, json.stderr || json.stdout);
  const body = JSON.parse(json.stdout);
  assert.equal(body.ok, true);
  assert.doesNotMatch(json.stdout, EMOJI);

  const ascii = mental(home, root, ["note", "--title", "Ascii note"], { MENTAL_ASCII: "1" });
  assert.equal(ascii.status, 0, ascii.stderr || ascii.stdout);
  assert.match(ascii.stdout, /\[note\] wrote notes\//);
  assert.doesNotMatch(ascii.stdout, EMOJI);
});

test("formatHeartbeat ASCII fallback", () => {
  const data = {
    git: { branch: "main", dirty: false, recent: [] },
    gitRoot: "/tmp/repo",
    handoff: { resume: "Keep going — open loops: none", outcome: "Cap", file: null, when: null },
    against: null,
    attention: [],
    openDecisions: [],
  };
  assert.match(formatHeartbeat(data, new Date(2026, 7, 25), {}), /🧠 Keep going/);
  assert.match(formatHeartbeat(data, new Date(2026, 7, 25), { MENTAL_ASCII: "1" }), /\[mental\] Keep going/);
});

test("skill shows a copy-paste receipt example; rule points at it", () => {
  const skill = readFileSync(join(ROOT, "skills", "mental", "SKILL.md"), "utf8");
  assert.match(skill, /^────────$/m);
  assert.doesNotMatch(skill, /^<\/br>$/m);
  assert.match(skill, /^🧠 Mental  $/m);
  assert.match(skill, /🚦 Attention: Recorded/);
  assert.match(skill, /🎯 Decision: Decided/);
  assert.doesNotMatch(skill, /recorded attention/);
  assert.doesNotMatch(skill, /── 🧠 Mental/);
  assert.match(skill, /two trailing spaces/);
  assert.match(skill, /Not a code fence/);
  const rule = readFileSync(join(ROOT, "rules", "mental.mdc"), "utf8");
  assert.match(rule, /────────/);
  assert.doesNotMatch(rule, /^<\/br>$/m);
  assert.match(rule, /two trailing spaces/);
  assert.match(rule, /Mental skill/);
});
