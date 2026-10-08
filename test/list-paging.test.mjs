/**
 * list/search paging, date windows, row fields, and heartbeat count parity (#67).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { parseDateWindow, parsePaging } from "../bin/lib/paging.mjs";
import { handle, runTool } from "../bin/lib/mcp.mjs";
import { initRepo, mental, tempHome } from "./helpers.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${r.stdout}`);
  return body.data;
}

function parseErr(r) {
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false, r.stdout);
  return body.error;
}

function writeOkf(root, rel, data, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function seed(prefix = "list") {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(
    mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue — open loops: none"]),
    "seed",
  );
  const where = parseOk(mental(home, root, ["where", "--json"]), "where");
  return { home, cwd: root, bundle: where.root, id: where.id, prefix };
}

function reindex(s) {
  parseOk(mental(s.home, s.cwd, ["reindex", "--json"]), "reindex");
}

function note(bundle, n, timestamp, extra = {}) {
  const day = timestamp.slice(0, 10);
  writeOkf(
    bundle,
    `notes/${day}-pager-${n}.md`,
    { type: "Note", title: `Pager ${n}`, description: `Pager ${n}`, tags: [], timestamp, ...extra },
    `# Pager ${n}\n\nzebrafish body ${n}\n`,
  );
}

test("parsePaging validates limit/offset/all", () => {
  assert.deepEqual(
    { ...parsePaging({}), limit: 50 },
    { ok: true, limit: 50, offset: 0, all: false },
  );
  assert.equal(parsePaging({ limit: "0" }).ok, false);
  assert.equal(parsePaging({ limit: "abc" }).ok, false);
  assert.equal(parsePaging({ offset: "-1" }).ok, false);
  assert.equal(parsePaging({ all: true, limit: "5" }).ok, false);
  const all = parsePaging({ all: true });
  assert.equal(all.ok, true);
  assert.equal(all.limit, Infinity);
  assert.equal(parsePaging({ limit: 7, offset: 2 }).limit, 7);
});

test("parseDateWindow handles --on and --since", () => {
  const on = parseDateWindow({ on: "2026-09-24" });
  assert.equal(on.ok, true);
  assert.equal(on.untilMs - on.sinceMs >= 23 * 3600e3, true);
  assert.equal(parseDateWindow({ on: "not-a-date" }).ok, false);
  assert.equal(parseDateWindow({ since: "2026-09-24T10:00:00Z" }).ok, true);
  assert.equal(parseDateWindow({ since: "yesterday" }).ok, false);
});

test("list defaults to 50, pages with --limit/--offset, and --all returns everything", () => {
  const { home, cwd, bundle } = seed();
  for (let i = 0; i < 60; i++) note(bundle, String(i).padStart(2, "0"), "2026-03-01T12:00:00.000Z");

  const def = parseOk(mental(home, cwd, ["list", "--type", "Note", "--json"]), "default");
  assert.equal(def.items.length, 50);
  assert.equal(def.total, 60);
  assert.equal(def.truncated, true);
  assert.equal(def.nextOffset, 50);

  const page2 = parseOk(
    mental(home, cwd, ["list", "--type", "Note", "--limit", "20", "--offset", "50", "--json"]),
    "page2",
  );
  assert.equal(page2.items.length, 10);
  assert.equal(page2.offset, 50);
  assert.equal(page2.truncated, false);
  assert.equal(page2.nextOffset, null);

  const all = parseOk(mental(home, cwd, ["list", "--type", "Note", "--all", "--json"]), "all");
  assert.equal(all.items.length, 60);
  assert.equal(all.truncated, false);

  const seen = new Set([...def.items, ...page2.items].map((i) => i.path));
  assert.equal(seen.size, 60, "pages must not overlap or skip");
});

test("list rejects bad paging and conflicting --all", () => {
  const { home, cwd } = seed();
  for (const args of [["--limit", "0"], ["--limit", "x"], ["--offset", "-2"], ["--all", "--limit", "5"], ["--on", "nope"]]) {
    const r = mental(home, cwd, ["list", "--json", ...args]);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}`);
    assert.equal(parseErr(r).code, "usage");
  }
});

test("list rows carry timestamp, updated, and project", () => {
  const { home, cwd, bundle, id } = seed();
  note(bundle, "ts", "2026-03-05T09:30:00.000Z");
  const data = parseOk(mental(home, cwd, ["list", "--type", "Note", "--json"]), "list");
  const row = data.items.find((i) => i.title === "Pager ts");
  assert.ok(row);
  assert.equal(row.timestamp, "2026-03-05T09:30:00.000Z");
  assert.equal(typeof row.updated, "string");
  assert.equal(row.project, id);
});

test("list --since and --on filter by timestamp", () => {
  const { home, cwd, bundle } = seed();
  note(bundle, "old", "2026-01-10T12:00:00.000Z");
  note(bundle, "mid", "2026-02-10T12:00:00.000Z");
  note(bundle, "new", "2026-03-10T12:00:00.000Z");

  const since = parseOk(mental(home, cwd, ["list", "--type", "Note", "--since", "2026-02-01", "--json"]), "since");
  assert.deepEqual(since.items.map((i) => i.title).sort(), ["Pager mid", "Pager new"]);

  const on = parseOk(mental(home, cwd, ["list", "--type", "Note", "--on", "2026-02-10", "--json"]), "on");
  assert.deepEqual(on.items.map((i) => i.title), ["Pager mid"]);
});

test("search pages and reports total/offset/nextOffset", () => {
  const s = seed();
  const { home, cwd, bundle } = s;
  for (let i = 0; i < 12; i++) note(bundle, String(i).padStart(2, "0"), "2026-03-01T12:00:00.000Z");
  reindex(s);

  const p1 = parseOk(mental(home, cwd, ["search", "zebrafish", "--limit", "5", "--json"]), "p1");
  assert.equal(p1.hits.length, 5);
  assert.equal(p1.total, 12);
  assert.equal(p1.truncated, true);
  assert.equal(p1.nextOffset, 5);

  const p3 = parseOk(mental(home, cwd, ["search", "zebrafish", "--limit", "5", "--offset", "10", "--json"]), "p3");
  assert.equal(p3.hits.length, 2);
  assert.equal(p3.truncated, false);

  const all = parseOk(mental(home, cwd, ["search", "zebrafish", "--all", "--json"]), "all");
  assert.equal(all.hits.length, 12);
  assert.ok(all.hits.every((h) => typeof h.project === "string" || h.project === null));
  assert.equal(new Set(all.hits.map((h) => h.path)).size, 12);
});

test("search treats an ISO date as an exact match, not AND-ed fragments", () => {
  const s = seed();
  const { home, cwd, bundle } = s;
  writeOkf(
    bundle,
    "notes/exact.md",
    { type: "Note", title: "Exact day", description: "d", tags: [], timestamp: "2026-09-24T10:00:00.000Z" },
    "# Exact day\n\nShipped on 2026-09-24 in full.\n",
  );
  writeOkf(
    bundle,
    "notes/fragments.md",
    { type: "Note", title: "Fragments", description: "d", tags: [], timestamp: "2026-01-01T10:00:00.000Z" },
    "# Fragments\n\nYear 2026, month 09, count 24 — but never that date.\n",
  );
  reindex(s);
  const r = parseOk(mental(home, cwd, ["search", "2026-09-24", "--json"]), "search");
  const titles = r.hits.map((h) => h.title);
  assert.ok(titles.includes("Exact day"), titles.join(","));
  assert.ok(!titles.includes("Fragments"), titles.join(","));
});

test("search --on restricts to the day and rows carry timestamp/updated", () => {
  const s = seed();
  const { home, cwd, bundle } = s;
  note(bundle, "a", "2026-02-10T12:00:00.000Z");
  note(bundle, "b", "2026-03-10T12:00:00.000Z");
  reindex(s);
  const r = parseOk(mental(home, cwd, ["search", "zebrafish", "--on", "2026-02-10", "--json"]), "on");
  assert.deepEqual(r.hits.map((h) => h.title), ["Pager a"]);
  assert.equal(r.hits[0].timestamp, "2026-02-10T12:00:00.000Z");
  assert.equal(typeof r.hits[0].updated, "string");
  assert.equal(r.total, 1);
});

test("search rejects bad paging", () => {
  const { home, cwd } = seed();
  const r = mental(home, cwd, ["search", "x", "--limit", "0", "--json"]);
  assert.equal(r.status, 2, r.stdout);
  assert.equal(parseErr(r).code, "usage");
});

test("heartbeat counts agree with list totals, including attention without status", () => {
  const { home, cwd, bundle } = seed();
  const base = { type: "Attention", tags: [], timestamp: "2026-03-01T12:00:00.000Z", kind: "concern" };
  writeOkf(bundle, "attention/a-open.md", { ...base, title: "Open one", description: "o", status: "open" }, "# Open one\n");
  writeOkf(bundle, "attention/b-nostatus.md", { ...base, title: "No status", description: "n" }, "# No status\n");
  writeOkf(bundle, "attention/c-later.md", { ...base, title: "Later one", description: "l", status: "later" }, "# Later one\n");
  writeOkf(bundle, "attention/d-done.md", { ...base, title: "Done one", description: "d", status: "done" }, "# Done one\n");

  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  const open = parseOk(mental(home, cwd, ["list", "--type", "Attention", "--status", "open", "--json"]), "open");
  const later = parseOk(mental(home, cwd, ["list", "--type", "Attention", "--status", "later", "--json"]), "later");
  assert.equal(hb.attentionCount, open.total + later.total);
  assert.equal(hb.laterCount, later.total);
  assert.equal(open.total, 2);
});

test("heartbeat counts include nested attention and decision files", () => {
  const { home, cwd, bundle } = seed();
  const base = { tags: [], timestamp: "2026-03-01T12:00:00.000Z" };
  writeOkf(bundle, "attention/top.md", { ...base, type: "Attention", title: "Top", description: "t", status: "open", kind: "concern" }, "# Top\n");
  writeOkf(bundle, "attention/sub/nested.md", { ...base, type: "Attention", title: "Nested", description: "n", status: "open", kind: "concern" }, "# Nested\n");
  writeOkf(bundle, "decisions/sub/nested-dec.md", { ...base, type: "Decision", title: "Nested dec", description: "d" }, "# Nested dec\n");

  const hb = parseOk(mental(home, cwd, ["heartbeat", "--json"]), "heartbeat");
  const att = parseOk(mental(home, cwd, ["list", "--type", "Attention", "--status", "open", "--json"]), "att");
  const dec = parseOk(mental(home, cwd, ["list", "--type", "Decision", "--status", "open", "--json"]), "dec");
  assert.equal(att.total, 2);
  assert.equal(hb.attentionCount, att.total);
  assert.equal(hb.openDecisionCount, dec.total);
  assert.equal(dec.total, 1);
});

test("attention warns on settled-fact titles but not on real residue or resolves", () => {
  const { home, cwd } = seed();
  const create = (title, extra = []) =>
    parseOk(
      mental(home, cwd, ["attention", "--title", title, "--kind", "thread", "--tag", "sync", "--via", "cli", ...extra, "--json"]),
      "attention",
    );
  assert.match(create("DONE 2026-09-09: shipped the thing").warning, /note|journal/);
  assert.match(create("CORRECTION: ledger was wrong").warning, /settled fact/);
  assert.equal(create("Chase the vendor about invoices").warning, undefined);
  assert.equal(create("CLOSED: old thing", ["--status", "resolved"]).warning, undefined);
});

function seedTwo() {
  const a = seed();
  const { root } = initRepo(a.home, { origin: "git@github.com:afaraha8403/other.git", name: "other" });
  parseOk(mental(a.home, root, ["journal", "--json", "--title", "Seed B", "--resume", "Continue — open loops: none"]), "seed b");
  const where = parseOk(mental(a.home, root, ["where", "--json"]), "where b");
  assert.notEqual(where.id, a.id);
  return { ...a, otherCwd: root, otherBundle: where.root, otherId: where.id };
}

test("list --project and --all-projects scope across bindings with project-tagged rows", () => {
  const s = seedTwo();
  const ts = "2026-03-01T12:00:00.000Z";
  for (let i = 0; i < 3; i++) note(s.bundle, `a${i}`, ts);
  for (let i = 0; i < 2; i++) note(s.otherBundle, `b${i}`, ts);
  const cur = parseOk(mental(s.home, s.cwd, ["list", "--type", "Note", "--json"]), "cur");
  assert.equal(cur.total, 3);
  assert.equal(cur.scope, "current");

  const other = parseOk(mental(s.home, s.cwd, ["list", "--type", "Note", "--project", s.otherId, "--json"]), "other");
  assert.equal(other.total, 2);
  assert.ok(other.items.every((i) => i.project === s.otherId));

  const all = parseOk(mental(s.home, s.cwd, ["list", "--type", "Note", "--all-projects", "--json"]), "all");
  assert.equal(all.scope, "all");
  assert.equal(all.total, 5);
  assert.equal(all.items.filter((i) => i.project === s.id).length, 3);
  assert.equal(all.items.filter((i) => i.project === s.otherId).length, 2);

  const page = parseOk(
    mental(s.home, s.cwd, ["list", "--type", "Note", "--all-projects", "--limit", "2", "--offset", "2", "--json"]),
    "page",
  );
  assert.equal(page.returned, 2);
  assert.equal(page.total, 5);
  assert.equal(page.nextOffset, 4);

  const fromElsewhere = parseOk(
    mental(s.home, s.otherCwd, ["list", "--type", "Note", "--all-projects", "--json"]),
    "from other",
  );
  assert.equal(fromElsewhere.total, 5);
});

test("project scope accepts name or id prefix and rejects unknown, ambiguous, and conflicting flags", () => {
  const s = seedTwo();
  const ok = parseOk(mental(s.home, s.cwd, ["list", "--project", s.otherId.slice(0, 8), "--json"]), "prefix");
  assert.equal(ok.scope, "project");
  const byName = parseOk(mental(s.home, s.cwd, ["list", "--project", "other", "--json"]), "name");
  assert.deepEqual(byName.projects, [s.otherId]);
  assert.equal(parseErr(mental(s.home, s.cwd, ["list", "--project", "nope-nope", "--json"])).code, "not-found");
  assert.equal(
    parseErr(mental(s.home, s.cwd, ["list", "--project", s.otherId, "--all-projects", "--json"])).code,
    "usage",
  );
});

test("search --all-projects unions hits tagged by project, with paging over the union", () => {
  const s = seedTwo();
  const ts = "2026-03-01T12:00:00.000Z";
  for (let i = 0; i < 3; i++) note(s.bundle, `a${i}`, ts);
  for (let i = 0; i < 2; i++) note(s.otherBundle, `b${i}`, ts);
  reindex(s);
  parseOk(mental(s.home, s.otherCwd, ["reindex", "--json"]), "reindex b");

  const cur = parseOk(mental(s.home, s.cwd, ["search", "zebrafish", "--json"]), "cur");
  assert.equal(cur.total, 3);
  const all = parseOk(mental(s.home, s.cwd, ["search", "zebrafish", "--all-projects", "--json"]), "all");
  assert.equal(all.total, 5);
  assert.equal(all.hits.filter((h) => h.project === s.otherId).length, 2);
  const page = parseOk(
    mental(s.home, s.cwd, ["search", "zebrafish", "--all-projects", "--limit", "2", "--offset", "4", "--json"]),
    "page",
  );
  assert.equal(page.returned, 1);
  assert.equal(page.truncated, false);
  const one = parseOk(mental(s.home, s.cwd, ["search", "zebrafish", "--project", s.otherId, "--json"]), "one");
  assert.equal(one.total, 2);
});

test("MCP list and search accept project scope args", () => {
  const s = seedTwo();
  note(s.otherBundle, "b0", "2026-03-01T12:00:00.000Z");
  const ctx = { cwd: s.cwd, home: s.home, env: { ...process.env, HOME: s.home, USERPROFILE: s.home }, dir: null };
  const r = runTool("list", { all_projects: true, type: "Note" }, ctx).body;
  assert.equal(r.data.scope, "all");
  assert.equal(r.data.total, 1);
  const p = runTool("list", { project: s.otherId, type: "Note" }, ctx).body;
  assert.equal(p.data.scope, "project");
  const tools = handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx).result.tools;
  assert.ok(tools.find((t) => t.name === "search").inputSchema.properties.all_projects);
});

test("MCP list and search accept paging args", () => {
  const s = seed();
  const { home, cwd, bundle } = s;
  for (let i = 0; i < 4; i++) note(bundle, String(i), "2026-03-01T12:00:00.000Z");
  reindex(s);
  const ctx = { cwd, home, env: { ...process.env, HOME: home, USERPROFILE: home }, dir: null };
  const list = runTool("list", { type: "Note", limit: 2, offset: 1 }, ctx).body;
  assert.equal(list.data.items.length, 2);
  assert.equal(list.data.offset, 1);
  const search = runTool("search", { q: "zebrafish", limit: 3 }, ctx).body;
  assert.equal(search.data.hits.length, 3);
  assert.equal(search.data.total, 4);

  const tools = handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx).result.tools;
  const listTool = tools.find((t) => t.name === "list");
  assert.equal(listTool.inputSchema.properties.limit.type, "integer");
  assert.ok(listTool.inputSchema.properties.all);
  assert.ok(listTool.inputSchema.properties.since);
});
