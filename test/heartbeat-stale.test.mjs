/**
 * Heartbeat surfaces stale open/deferred decisions and open/later attention (#62).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectStale, formatHeartbeat, STALE_HEARTBEAT_CAP } from "../bin/lib/heartbeat.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { initRepo, mental, tempHome } from "./helpers.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${r.stdout}`);
  return body.data;
}

function writeOkf(root, rel, data, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function seed() {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(
    mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue — open loops: none"]),
    "seed",
  );
  const where = parseOk(mental(home, root, ["where", "--json"]), "where");
  return { home, cwd: root, bundle: where.root };
}

const OLD = "2026-01-01T12:00:00.000Z";

function staleAttention(bundle, slug, title, extra = {}) {
  writeOkf(
    bundle,
    `attention/2026-01-01-${slug}.md`,
    { type: "Attention", title, description: title, tags: [], timestamp: OLD, status: "open", kind: "concern", ...extra },
    `# ${title}\n`,
  );
}

test("heartbeat --json lists stale decisions and attention with age", () => {
  const { home, cwd, bundle } = seed();
  staleAttention(bundle, "old-air", "Old residue");
  writeOkf(
    bundle,
    "decisions/2026-01-01-old-fork.md",
    { type: "Decision", title: "Old fork", description: "Old fork", tags: [], timestamp: OLD, status: "open" },
    "# Old fork\n",
  );
  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  assert.equal(hb.stale.days, 14);
  assert.equal(hb.stale.count, 2);
  assert.equal(hb.stale.attention[0].title, "Old residue");
  assert.equal(hb.stale.attention[0].path, "attention/2026-01-01-old-air.md");
  assert.ok(hb.stale.attention[0].ageDays >= 14);
  assert.equal(hb.stale.decisions[0].title, "Old fork");
  assert.equal(hb.stale.decisions[0].status, "open");
});

test("fresh and resolved items are not stale", () => {
  const { home, cwd, bundle } = seed();
  staleAttention(bundle, "fresh", "Fresh residue", { timestamp: new Date().toISOString() });
  staleAttention(bundle, "done", "Resolved residue", { status: "done" });
  writeOkf(
    bundle,
    "decisions/2026-01-01-decided.md",
    { type: "Decision", title: "Decided fork", description: "d", tags: [], timestamp: OLD, status: "decided" },
    "# Decided fork\n",
  );
  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  assert.equal(hb.stale.count, 0);
  assert.deepEqual(hb.stale.attention, []);
  assert.deepEqual(hb.stale.decisions, []);
});

test("later attention and deferred decisions count as stale", () => {
  const { home, cwd, bundle } = seed();
  staleAttention(bundle, "later", "Parked residue", { status: "later" });
  writeOkf(
    bundle,
    "decisions/2026-01-01-deferred.md",
    { type: "Decision", title: "Deferred fork", description: "d", tags: [], timestamp: OLD, status: "deferred" },
    "# Deferred fork\n",
  );
  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  assert.equal(hb.stale.count, 2);
});

test("stale rows are capped but count is the true total, oldest first", () => {
  const { home, cwd, bundle } = seed();
  const total = STALE_HEARTBEAT_CAP + 3;
  for (let i = 0; i < total; i++) {
    const ts = `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`;
    staleAttention(bundle, `n${i}`, `Residue ${i}`, { timestamp: ts });
  }
  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  assert.equal(hb.stale.count, total);
  assert.equal(hb.stale.attention.length, STALE_HEARTBEAT_CAP);
  assert.equal(hb.stale.attention[0].title, "Residue 0");
});

test("heartbeat text shows a Stale block with the review nudge and +N more", () => {
  const { home, cwd, bundle } = seed();
  const total = STALE_HEARTBEAT_CAP + 2;
  for (let i = 0; i < total; i++) staleAttention(bundle, `t${i}`, `Residue ${i}`);
  const r = mental(home, cwd, ["heartbeat", "--plain"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Stale \(> 14d\)/);
  assert.match(r.stdout, /resolve, decide, or supersede/);
  assert.match(r.stdout, /\[open\] Residue/);
  assert.match(r.stdout, /\(\+2 more/);
});

test("no stale block when nothing is stale", () => {
  const { home, cwd } = seed();
  const r = mental(home, cwd, ["heartbeat", "--plain"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Stale/);
});

test("--fields stale returns only the stale field", () => {
  const { home, cwd, bundle } = seed();
  staleAttention(bundle, "f", "Field residue");
  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json", "--fields", "stale"]), "fields");
  assert.deepEqual(Object.keys(hb), ["stale"]);
  assert.equal(hb.stale.count, 1);
});

test("collectStale and formatHeartbeat tolerate a missing root and missing field", () => {
  assert.equal(collectStale(null).count, 0);
  const text = formatHeartbeat({
    handoff: { resume: "r", outcome: "o", when: null },
    git: {},
    gitRoot: null,
    attention: [],
    openDecisions: [],
  });
  assert.doesNotMatch(text, /Stale/);
});
