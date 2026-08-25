import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBindings } from "../bin/lib/bindings.mjs";
import { resolveBundle } from "../bin/lib/resolve.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { parseFrontmatter } from "../bin/lib/okf.mjs";
import { indexPath } from "../bin/lib/index.mjs";

/**
 * Balakit-era leftover bundle: notes in `notes/`, including one without `status`.
 * @param {string} gitRoot
 */
function seedLegacyBundle(gitRoot) {
  const root = join(gitRoot, ".mental");
  mkdirSync(join(root, "notes"), { recursive: true });
  mkdirSync(join(root, "journal"), { recursive: true });
  mkdirSync(join(root, "decisions"), { recursive: true });
  mkdirSync(join(root, "status"), { recursive: true });
  writeFileSync(
    join(root, "index.md"),
    `---
type: Status
title: leftover — .mental index
timestamp: 2026-08-20T12:00:00Z
status: active
---

# leftover
`,
  );
  writeFileSync(
    join(root, "journal.md"),
    "# leftover root journal.md (pre-folder layout)\n",
  );
  writeFileSync(
    join(root, "journal", "2026-08-20.md"),
    `---
type: Journal
title: Journal — 2026-08-20
timestamp: 2026-08-20T12:00:00Z
status: active
---

# 2026-08-20

## 12:00 — leftover handoff

Balakit-era journal still in the clone.

Resume: Keep using the local notes — open loops: none
`,
  );
  writeFileSync(
    join(root, "notes", "okf-vs-mental.md"),
    `---
type: Note
title: OKF vs .mental
description: Do not duplicate channel knowledge into .mental.
timestamp: 2026-07-22T21:45:00Z
---

# OKF vs .mental

If a fact only helps the next coding session resume → mental.
`,
  );
  writeFileSync(
    join(root, "notes", "active-fact.md"),
    `---
type: Note
title: Active leftover fact
description: Profile patch insert lives in overlay.
tags: [overlay]
timestamp: 2026-08-20T12:00:00Z
status: active
---

# Active leftover fact
`,
  );
  writeFileSync(
    join(root, "notes", "old-thing.md"),
    `---
type: Note
title: Superseded leftover
timestamp: 2026-07-01T00:00:00Z
status: superseded
---

# old
`,
  );
  writeFileSync(
    join(root, "status", "current.md"),
    "# stale leftover cache — should not be required in the home slice\n",
  );
  return root;
}

test("status imports leftover notes into the home UUID slice", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const leftover = seedLegacyBundle(root);

  const s = mental(home, root, ["status", "--json"]);
  assert.equal(s.status, 0, s.stderr || s.stdout);
  const st = JSON.parse(s.stdout);
  assert.equal(st.ok, true);
  assert.equal(st.data.mode, "home");
  assert.ok(st.data.id);
  assert.equal(st.data.root, join(home, ".mental", "projects", st.data.id));
  assert.match(st.data.resume, /Keep using the local notes/);
  assert.equal(st.data.latestOutcome, "leftover handoff");
  assert.equal(st.data.notes.length, 2);
  assert.deepEqual(
    st.data.notes.map((n) => n.path).sort(),
    ["notes/active-fact.md", "notes/okf-vs-mental.md"],
  );

  const slice = st.data.root;
  assert.equal(existsSync(join(slice, "notes", "active-fact.md")), true);
  assert.equal(existsSync(join(slice, "notes", "okf-vs-mental.md")), true);
  assert.equal(existsSync(join(slice, "journal", "imported-root.md")), true);
  assert.equal(existsSync(join(slice, "journal.md")), false);
  assert.equal(existsSync(join(slice, "journal", "2026-08-20.md")), true);
  // Disposable leftover status cache is not copied.
  assert.equal(existsSync(join(slice, "status", "current.md")), true);
  const cache = readFileSync(join(slice, "status", "current.md"), "utf8");
  assert.match(cache, /Active leftover fact/);
  assert.doesNotMatch(cache, /stale leftover cache/);

  const importedNote = parseFrontmatter(readFileSync(join(slice, "notes", "okf-vs-mental.md"), "utf8"));
  assert.equal(importedNote.data.type, "Note");
  assert.equal(importedNote.data.status, "active");

  assert.equal(st.data.indexed?.ok, true);
  assert.ok(st.data.indexed.concepts >= 3);
  assert.equal(existsSync(indexPath(home, st.data.id, gitEnv(home))), true);

  // Source is never deleted.
  assert.equal(existsSync(join(leftover, "notes", "active-fact.md")), true);

  const bindings = loadBindings(home);
  assert.equal(bindings.bindings[0].legacyImportedFrom, leftover);
});

test("journal after import writes to the home slice, not leftover ./mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const leftover = seedLegacyBundle(root);

  const j = mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Imported leftover bundle",
    "--body",
    "Now writing to the home store.",
    "--resume",
    "Next: keep home — open loops: none",
  ]);
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const body = JSON.parse(j.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.mode, "home");
  const slice = join(home, ".mental", "projects", body.data.id);

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const dayFile = `${y}-${m}-${d}.md`;
  assert.equal(existsSync(join(slice, "journal", dayFile)), true);
  assert.equal(existsSync(join(leftover, "journal", dayFile)), false);
});

test("where on leftover does not persist; status imports and stays home", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const leftover = seedLegacyBundle(root);

  const ro = resolveBundle({ cwd: root, home, env: gitEnv(home), write: false });
  assert.equal(ro.ok, true);
  assert.equal(ro.data.mode, "home");
  assert.equal(ro.data.id, null);
  assert.equal(existsSync(join(home, ".mental", "bindings.json")), false);
  assert.equal(existsSync(join(leftover, "notes", "active-fact.md")), true);

  const w = mental(home, root, ["where", "--json"]);
  assert.equal(w.status, 0, w.stderr || w.stdout);
  const where = JSON.parse(w.stdout);
  assert.equal(where.ok, true);
  assert.equal(where.data.mode, "home");
  assert.equal(where.data.id, null);
  assert.equal(where.data.imported, undefined);
  assert.equal(existsSync(join(home, ".mental", "bindings.json")), false);

  const s = mental(home, root, ["status", "--json"]);
  assert.equal(s.status, 0, s.stderr || s.stdout);
  const st = JSON.parse(s.stdout);
  assert.ok(st.data.id);
  assert.ok(st.data.imported);
  assert.ok(st.data.imported.copied.includes("notes/active-fact.md"));
  assert.ok(st.data.imported.copied.includes("journal/imported-root.md"));
  assert.equal(existsSync(join(st.data.root, "notes", "active-fact.md")), true);
  assert.equal(st.data.indexed?.ok, true);
});

test("install in a leftover project copies notes into ~/.mental/projects", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedLegacyBundle(root);

  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.where.mode, "home");
  assert.ok(body.data.imported.copied.includes("notes/okf-vs-mental.md"));
  const slice = join(home, ".mental", "projects", body.data.where.id);
  assert.equal(existsSync(join(slice, "notes", "okf-vs-mental.md")), true);
});

test("second import is idempotent and does not clobber home files", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const leftover = seedLegacyBundle(root);

  const first = mental(home, root, ["status", "--json"]);
  const id = JSON.parse(first.stdout).data.id;
  const sliceNote = join(home, ".mental", "projects", id, "notes", "active-fact.md");
  writeFileSync(sliceNote, "# home already wrote this path\n");
  writeFileSync(join(leftover, "notes", "new-after.md"), `---
type: Note
title: Added after first import
status: active
---

# new
`);

  const second = mental(home, root, ["status", "--json"]);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const where = JSON.parse(second.stdout);
  assert.equal(readFileSync(sliceNote, "utf8"), "# home already wrote this path\n");
  assert.equal(
    existsSync(join(home, ".mental", "projects", id, "notes", "new-after.md")),
    true,
  );
  assert.ok(where.data.imported.copied.includes("notes/new-after.md"));
  assert.ok(!where.data.imported.copied.includes("notes/active-fact.md"));
});

test("doctor warns leftover will import, then that it remains on disk", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedLegacyBundle(root);

  const before = mental(home, root, ["doctor", "--json"]);
  assert.ok(before.status === 0 || before.status === 3, before.stderr || before.stdout);
  const pre = JSON.parse(before.stdout);
  const will = pre.data.checks.find((c) => c.id === "legacy-import");
  assert.ok(will);
  assert.match(will.message, /will import/);

  assert.equal(mental(home, root, ["status", "--json"]).status, 0);

  const after = mental(home, root, ["doctor", "--json"]);
  assert.ok(after.status === 0 || after.status === 3, after.stderr || after.stdout);
  const post = JSON.parse(after.stdout);
  const done = post.data.checks.find((c) => c.id === "legacy-import");
  assert.ok(done);
  assert.match(done.message, /already imported/);
});

test("mental local snapshots leftover then keeps writes in ./mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const leftover = seedLegacyBundle(root);

  const fix = mental(home, root, ["doctor", "--fix-ignore", "--json"]);
  assert.ok(fix.status === 0 || fix.status === 3, fix.stderr || fix.stdout);

  const loc = mental(home, root, ["local", "--json"]);
  assert.equal(loc.status, 0, loc.stderr || loc.stdout);
  const body = JSON.parse(loc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.where.mode, "local");
  assert.equal(body.data.where.root, leftover);
  assert.equal(existsSync(join(leftover, ".mental-local")), true);

  const bindings = loadBindings(home);
  const id = bindings.bindings[0].id;
  assert.equal(bindings.bindings[0].store, "local");
  assert.equal(existsSync(join(home, ".mental", "projects", id, "notes", "active-fact.md")), true);

  const j = mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Staying local",
    "--resume",
    "Continue local — open loops: none",
  ]);
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const wrote = JSON.parse(j.stdout);
  assert.equal(wrote.data.root, leftover);

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  assert.equal(existsSync(join(leftover, "journal", `${y}-${m}-${d}.md`)), true);
});

test("search finds processed leftover notes via the sqlite index", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedLegacyBundle(root);

  const seeded = mental(home, root, ["status", "--json"]);
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);

  const s = mental(home, root, ["search", "--json", "overlay"]);
  assert.equal(s.status, 0, s.stderr || s.stdout);
  const body = JSON.parse(s.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.backend, "sqlite");
  assert.ok(body.data.hits.some((h) => h.path === "notes/active-fact.md"));
  assert.ok(body.data.hits.every((h) => h.type));
});
