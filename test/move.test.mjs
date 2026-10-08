import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { movablePath } from "../bin/lib/move.mjs";
import { runTool } from "../bin/lib/mcp.mjs";
import { initRepo, mental, tempHome } from "./helpers.mjs";

function ok(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${r.stdout}`);
  return body.data;
}

function err(r) {
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false, r.stdout);
  return body.error;
}

function writeOkf(root, rel, data, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function seed(home, opts) {
  const { root } = initRepo(home, opts);
  ok(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue — open loops: none"]), "seed");
  const where = ok(mental(home, root, ["where", "--json"]), "where");
  return { cwd: root, bundle: where.root, id: where.id };
}

function seedTwo() {
  const home = tempHome();
  const a = seed(home);
  const b = seed(home, { origin: "git@github.com:afaraha8403/other.git", name: "other" });
  assert.notEqual(a.id, b.id);
  return { home, a, b };
}

const TS = "2026-02-03T04:05:06.000Z";

function seedAttention(s, name = "stray-thread") {
  writeOkf(
    s.a.bundle,
    `attention/${name}.md`,
    { type: "Attention", title: "Stray thread", status: "open", kind: "thread", timestamp: TS, tags: ["misc"] },
    "# Stray thread\n\nwrongly filed\n",
  );
  ok(mental(s.home, s.a.cwd, ["reindex", "--json"]), "reindex");
}

test("movablePath accepts only attention/decisions/notes files", () => {
  assert.equal(movablePath("attention/x.md").ok, true);
  assert.equal(movablePath("decisions/x.md").ok, true);
  assert.equal(movablePath("notes/x.md").ok, true);
  for (const bad of ["journal/x.md", "status.md", "../notes/x.md", "notes/x.md#frag", "notes/sub/x.md", "notes/x.txt", ""]) {
    assert.equal(movablePath(bad).ok, false, bad);
  }
});

test("move re-files an item, preserving timestamp and body, and removes the source", () => {
  const s = seedTwo();
  seedAttention(s);
  const d = ok(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--to", s.b.id, "--json"]), "move");
  assert.equal(d.from, "attention/stray-thread.md");
  assert.equal(d.renamed, false);
  assert.equal(d.project.id, s.b.id);
  assert.equal(existsSync(join(s.a.bundle, "attention/stray-thread.md")), false);
  const moved = readFileSync(join(s.b.bundle, d.to), "utf8");
  assert.ok(moved.includes(TS));
  assert.ok(moved.includes("wrongly filed"));

  const found = ok(mental(s.home, s.b.cwd, ["list", "--type", "Attention", "--json"]), "list b");
  assert.equal(found.total, 1);
  const gone = ok(mental(s.home, s.a.cwd, ["list", "--type", "Attention", "--json"]), "list a");
  assert.equal(gone.total, 0);
});

test("move picks a -2 filename on collision", () => {
  const s = seedTwo();
  seedAttention(s);
  writeOkf(
    s.b.bundle,
    "attention/stray-thread.md",
    { type: "Attention", title: "Existing", status: "open", kind: "thread", timestamp: TS, tags: ["misc"] },
    "# Existing\n",
  );
  const d = ok(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--to", s.b.id, "--json"]), "move");
  assert.equal(d.renamed, true);
  assert.equal(d.to, "attention/stray-thread-2.md");
  assert.ok(readFileSync(join(s.b.bundle, "attention/stray-thread.md"), "utf8").includes("Existing"));
});

test("move validates path, target and source", () => {
  const s = seedTwo();
  seedAttention(s);
  assert.equal(err(mental(s.home, s.a.cwd, ["move", "journal/x.md", "--to", s.b.id, "--json"])).code, "usage");
  assert.equal(err(mental(s.home, s.a.cwd, ["move", "attention/missing.md", "--to", s.b.id, "--json"])).code, "not-found");
  assert.equal(err(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--to", "nope-nope", "--json"])).code, "not-found");
  assert.equal(err(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--to", s.a.id, "--json"])).code, "usage");
  assert.equal(err(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--json"])).code, "usage");
  assert.equal(existsSync(join(s.a.bundle, "attention/stray-thread.md")), true);
});

test("move warns when other files still link to the moved item", () => {
  const s = seedTwo();
  seedAttention(s);
  writeOkf(
    s.a.bundle,
    "notes/refs.md",
    { type: "Note", title: "Refs", description: "refs", tags: [], timestamp: TS },
    "# Refs\n\nSee [stray](../attention/stray-thread.md).\n",
  );
  ok(mental(s.home, s.a.cwd, ["reindex", "--json"]), "reindex");
  const d = ok(mental(s.home, s.a.cwd, ["move", "attention/stray-thread.md", "--to", s.b.id, "--json"]), "move");
  assert.match(d.warning || "", /still link/);
});

test("attention --move-to moves by title", () => {
  const s = seedTwo();
  seedAttention(s);
  const d = ok(
    mental(s.home, s.a.cwd, ["attention", "--title", "Stray thread", "--move-to", s.b.id, "--json"]),
    "move-to",
  );
  assert.equal(d.project.id, s.b.id);
  assert.equal(existsSync(join(s.b.bundle, d.to)), true);
  assert.equal(err(mental(s.home, s.a.cwd, ["attention", "--title", "Nothing here", "--move-to", s.b.id, "--json"])).code, "not-found");
  assert.equal(
    err(mental(s.home, s.a.cwd, ["attention", "--title", "x", "--move-to", s.b.id, "--project", s.b.id, "--json"])).code,
    "usage",
  );
});

test("--project files attention/decision/note into another bundle from any cwd", () => {
  const s = seedTwo();
  const att = ok(
    mental(s.home, s.a.cwd, [
      "attention", "--title", "Filed remotely", "--kind", "thread", "--tag", "misc", "--project", s.b.id, "--json",
    ]),
    "attention",
  );
  assert.equal(att.root, s.b.bundle);
  const dec = ok(
    mental(s.home, s.a.cwd, [
      "decide", "--title", "Remote decision", "--body", "because", "--tag", "misc", "--project", s.b.id, "--json",
    ]),
    "decide",
  );
  assert.equal(dec.root, s.b.bundle);
  const nt = ok(
    mental(s.home, s.a.cwd, ["note", "--title", "Remote note", "--body", "hello", "--tag", "misc", "--project", s.b.id, "--json"]),
    "note",
  );
  assert.equal(nt.root, s.b.bundle);

  const bList = ok(mental(s.home, s.b.cwd, ["list", "--json"]), "list b");
  assert.ok(bList.total >= 3);
  const aAtt = ok(mental(s.home, s.a.cwd, ["list", "--type", "Attention", "--json"]), "list a");
  assert.equal(aAtt.total, 0);

  assert.equal(
    err(mental(s.home, s.a.cwd, ["note", "--title", "x", "--body", "y", "--tag", "misc", "--project", "nope-nope", "--json"])).code,
    "not-found",
  );
});

test("search and list never surface projects/<uuid>/ files from a bundle's own tree", () => {
  const s = seedTwo();
  writeOkf(
    s.a.bundle,
    "projects/11111111-2222-4333-8444-555555555555/attention/foreign.md",
    { type: "Attention", title: "Foreign thread", status: "open", kind: "thread", timestamp: TS, tags: ["misc"] },
    "# Foreign thread\n\nfromanotherproject\n",
  );
  seedAttention(s);
  ok(mental(s.home, s.a.cwd, ["reindex", "--json"]), "reindex");
  const hits = ok(
    mental(s.home, s.a.cwd, ["search", "thread", "--type", "Attention", "--status", "open", "--json"]),
    "search",
  );
  assert.ok(hits.hits.every((h) => !h.path.startsWith("projects/")), JSON.stringify(hits.hits));
  const text = ok(mental(s.home, s.a.cwd, ["search", "fromanotherproject", "--json"]), "search text");
  assert.equal(text.hits.length, 0);
  const listed = ok(mental(s.home, s.a.cwd, ["list", "--type", "Attention", "--json"]), "list");
  assert.ok(listed.items.every((i) => !String(i.path).startsWith("projects/")));
  assert.equal(listed.total, hits.total);
});

test("MCP move and project passthrough", () => {
  const s = seedTwo();
  seedAttention(s);
  const ctx = { cwd: s.a.cwd, home: s.home, env: { ...process.env, HOME: s.home, USERPROFILE: s.home } };
  const moved = runTool("move", { path: "attention/stray-thread.md", to: s.b.id }, ctx).body;
  assert.equal(moved.ok, true, JSON.stringify(moved));
  const filed = runTool("note", { title: "Via MCP", body: "hi", tag: "misc", project: s.b.id }, ctx).body;
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.equal(filed.data.root, s.b.bundle);
});
