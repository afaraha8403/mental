import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mental, initRepo, tempHome } from "./helpers.mjs";

function seedLeftover(gitRoot) {
  const leftover = join(gitRoot, ".mental", "decisions");
  mkdirSync(leftover, { recursive: true });
  writeFileSync(
    join(leftover, "leftover-only.md"),
    `---
type: Decision
title: Leftover only this clone
status: decided
---

# Leftover only this clone
`,
  );
}

test("unbound search list show do not walk sibling UUID slices or leftover", () => {
  const home = tempHome();
  const canopy = initRepo(home, {
    origin: "git@github.com:acme/canopy-ui.git",
    name: "canopy-ui",
  });
  const bti = initRepo(home, {
    origin: "git@github.com:acme/bti-home.git",
    name: "bti-home",
  });
  seedLeftover(bti.root);

  const decided = mental(home, canopy.root, [
    "decide",
    "--json",
    "--title",
    "Defer all canopy-ui CI/CD improvements",
    "--body",
    "Wait for Dan before touching canopy-ui CI.",
  ]);
  assert.equal(decided.status, 0, decided.stderr || decided.stdout);
  const canopyBody = JSON.parse(decided.stdout);
  assert.ok(canopyBody.data.id);
  const canopyPath = canopyBody.data.path;

  const where = mental(home, bti.root, ["where", "--json"]);
  assert.equal(where.status, 0, where.stderr || where.stdout);
  const unbound = JSON.parse(where.stdout);
  assert.equal(unbound.data.id, null);
  assert.equal(unbound.data.mode, "home");

  const search = mental(home, bti.root, ["search", "--json", "canopy-ui"]);
  assert.equal(search.status, 0, search.stderr || search.stdout);
  const hits = JSON.parse(search.stdout);
  assert.equal(hits.ok, true);
  assert.equal(hits.data.id, null);
  assert.equal(hits.data.hits.length, 0);
  assert.equal(hits.data.total, 0);

  const leftoverSearch = mental(home, bti.root, ["search", "--json", "Leftover"]);
  assert.equal(JSON.parse(leftoverSearch.stdout).data.hits.length, 0);

  const listed = mental(home, bti.root, ["list", "--json", "--type", "Decision"]);
  assert.equal(listed.status, 0, listed.stderr || listed.stdout);
  const items = JSON.parse(listed.stdout);
  assert.equal(items.data.items.length, 0);
  assert.equal(items.data.total, 0);

  const shown = mental(home, bti.root, ["show", `${canopyBody.data.id}/${canopyPath}`, "--json"]);
  assert.equal(shown.status, 1, shown.stderr || shown.stdout);
  const showBody = JSON.parse(shown.stdout);
  assert.equal(showBody.ok, false);

  const own = mental(home, canopy.root, ["search", "--json", "canopy-ui"]);
  assert.equal(own.status, 0, own.stderr || own.stdout);
  const ownHits = JSON.parse(own.stdout);
  assert.ok(ownHits.data.hits.some((h) => h.title === "Defer all canopy-ui CI/CD improvements"));
});
