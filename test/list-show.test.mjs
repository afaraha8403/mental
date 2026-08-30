import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mental, initRepo, tempHome } from "./helpers.mjs";
import { readBundleFile } from "../bin/lib/okf.mjs";

test("list --json returns concepts after journal + decide", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const j = mental(home, root, ["journal", "--json", "--title", "Listable outcome", "--resume", "Continue"]);
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const d = mental(home, root, [
    "decide",
    "--json",
    "--title",
    "Listable decision",
    "--body",
    "Listed so filters can find it.",
  ]);
  assert.equal(d.status, 0, d.stderr || d.stdout);

  const r = mental(home, root, ["list", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  const titles = body.data.items.map((i) => i.title);
  assert.ok(titles.some((t) => /Listable outcome|Journal/.test(t)));
  assert.ok(body.data.items.some((i) => i.type === "Decision" && i.title === "Listable decision"));

  const only = mental(home, root, ["list", "--json", "--type", "Decision"]);
  const filtered = JSON.parse(only.stdout);
  assert.equal(filtered.ok, true);
  assert.ok(filtered.data.items.every((i) => i.type === "Decision"));
  assert.equal(filtered.data.items.length >= 1, true);
});

test("show --json returns frontmatter and body", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const n = mental(home, root, ["note", "--json", "--title", "Durable fact", "--body", "Walk up to git root."]);
  assert.equal(n.status, 0, n.stderr || n.stdout);
  const path = JSON.parse(n.stdout).data.path;

  const r = mental(home, root, ["show", path, "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.path, path);
  assert.equal(body.data.frontmatter.title, "Durable fact");
  assert.match(body.data.body, /Walk up to git root/);
});

test("show rejects path escape", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Seed bundle", "--resume", "Continue"]);
  const r = mental(home, root, ["show", "../bindings.json", "--json"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "path");
});

test("readBundleFile rejects .. segments", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const wrote = mental(home, root, ["journal", "--json", "--title", "Seed bundle", "--resume", "Continue"]);
  const bundle = JSON.parse(wrote.stdout).data.root;
  const escaped = readBundleFile(bundle, join("notes", "..", "..", "secret"));
  assert.equal(escaped.ok, false);
  assert.equal(escaped.error.code, "path");
});
