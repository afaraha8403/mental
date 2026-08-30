import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gitEnv, initRepo, tempHome } from "./helpers.mjs";
import { parseFrontmatter } from "../bin/lib/okf.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

function mental(home, cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: gitEnv(home),
  });
}

test("journal + status --json write today's section and resume cache", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const j = mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Resolver landed",
    "--body",
    "mental where + tests.",
    "--resume",
    "Install skill next — open loops: none",
  ]);
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const wrote = JSON.parse(j.stdout);
  assert.equal(wrote.ok, true);
  assert.match(wrote.data.path, /^journal\/\d{4}-\d{2}-\d{2}\.md$/);
  assert.ok(wrote.data.indexed?.ok);
  assert.ok(wrote.data.indexed.concepts >= 1);

  const found = mental(home, root, ["search", "--json", "Resolver landed"]);
  assert.equal(found.status, 0, found.stderr || found.stdout);
  const hits = JSON.parse(found.stdout);
  assert.equal(hits.ok, true);
  assert.ok(hits.data.hits.some((h) => /Resolver landed|Journal/.test(h.title)));

  const s = mental(home, root, ["status", "--json"]);
  assert.equal(s.status, 0, s.stderr || s.stdout);
  const st = JSON.parse(s.stdout);
  assert.equal(st.ok, true);
  assert.match(st.data.resume, /Install skill next/);
  assert.equal(st.data.latestOutcome, "Resolver landed");
  assert.equal(st.data.git.dirty, false);

  const statusMd = readFileSync(join(st.data.root, "status", "current.md"), "utf8");
  assert.match(statusMd, /Install skill next/);
  const { data } = parseFrontmatter(statusMd);
  assert.equal(data.type, "Status");
});

test("decide --json scaffolds an open decision that status lists", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const d = mental(home, root, [
    "decide",
    "--json",
    "--title",
    "Use UUID identity",
    "--status",
    "open",
    "--body",
    "Identity lives in bindings.json, not the folder path.",
  ]);
  assert.equal(d.status, 0, d.stderr || d.stdout);
  const body = JSON.parse(d.stdout);
  assert.equal(body.ok, true);
  assert.match(body.data.path, /^decisions\/\d{4}-\d{2}-\d{2}-use-uuid-identity\.md$/);
  const md = readFileSync(join(body.data.root, body.data.path), "utf8");
  assert.match(md, /Identity lives in bindings\.json/);
  assert.doesNotMatch(md, /why this choice matters/);
  assert.doesNotMatch(md, /option A/);

  const s = mental(home, root, ["status", "--json"]);
  const st = JSON.parse(s.stdout);
  assert.equal(st.data.openDecisions.length, 1);
  assert.equal(st.data.openDecisions[0].title, "Use UUID identity");
  assert.equal(st.data.openDecisions[0].status, "open");
});

test("decide --status decided updates by title and drops from heartbeat", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, [
    "decide",
    "--json",
    "--title",
    "Use UUID identity",
    "--status",
    "open",
    "--body",
    "Identity lives in bindings.json, not the folder path.",
  ]);
  const closed = mental(home, root, [
    "decide",
    "--json",
    "--title",
    "Use UUID identity",
    "--status",
    "decided",
    "--body",
    "Chosen: UUID in bindings.json, not origin.",
  ]);
  assert.equal(closed.status, 0, closed.stderr || closed.stdout);
  const body = JSON.parse(closed.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.updated, true);

  const hb = JSON.parse(mental(home, root, ["heartbeat", "--json"]).stdout);
  assert.equal(hb.data.openDecisions.length, 0);

  const listed = JSON.parse(mental(home, root, ["list", "--json", "--type", "Decision"]).stdout);
  assert.equal(listed.data.items.length, 1);
  assert.equal(listed.data.items[0].status, "decided");
});

test("decide --path updates the named file; missing path is not-found", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const created = JSON.parse(
    mental(home, root, [
      "decide",
      "--json",
      "--title",
      "Fork heuristic",
      "--status",
      "open",
      "--body",
      "Open until remap UX is picked.",
    ]).stdout,
  );
  const path = created.data.path;
  const r = mental(home, root, [
    "decide",
    "--json",
    "--path",
    path,
    "--status",
    "deferred",
    "--description",
    "Awaits remap UX",
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const md = readFileSync(join(created.data.root, path), "utf8");
  const { data } = parseFrontmatter(md);
  assert.equal(data.status, "deferred");
  assert.equal(data.description, "Awaits remap UX");

  const missing = mental(home, root, ["decide", "--json", "--path", "decisions/nope.md", "--status", "decided"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /not-found|no decision/);
});
