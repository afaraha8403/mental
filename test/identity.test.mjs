import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { resolveBundle } from "../bin/lib/resolve.mjs";
import { loadBindings } from "../bin/lib/bindings.mjs";
import { git, gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

test("mv repo, origin unchanged → same uuid", () => {
  const home = tempHome();
  const { root } = initRepo(home, { origin: "git@github.com:org/moved.git" });
  const first = mental(home, root, ["status", "--json"]);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const id = JSON.parse(first.stdout).data.id;
  const dest = join(home, "work", "relocated");
  renameSync(root, dest);
  const second = mental(home, dest, ["status", "--json"]);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(JSON.parse(second.stdout).data.id, id);
});

test("two clones same origin share uuid; split diverges; link rejoins", () => {
  const home = tempHome();
  const a = initRepo(home, { name: "c1", origin: "https://github.com/org/shared.git" });
  const b = initRepo(home, { name: "c2", origin: "git@github.com:org/shared.git" });
  const first = mental(home, a.root, ["journal", "--json", "--title", "Shared brain", "--resume", "Continue"]);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const id = JSON.parse(first.stdout).data.id;
  const second = mental(home, b.root, ["status", "--json"]);
  assert.equal(JSON.parse(second.stdout).data.id, id);

  const sp = mental(home, b.root, ["split", "--json"]);
  assert.equal(sp.status, 0, sp.stderr || sp.stdout);
  const splitId = JSON.parse(sp.stdout).data.id;
  assert.notEqual(splitId, id);
  assert.equal(mental(home, b.root, ["status", "--json"]).status, 0);
  assert.equal(JSON.parse(mental(home, b.root, ["status", "--json"]).stdout).data.id, splitId);
  assert.equal(JSON.parse(mental(home, a.root, ["status", "--json"]).stdout).data.id, id);
  assert.equal(existsSync(join(b.root, ".mental-id")), true);

  const linked = mental(home, b.root, ["link", "--json", "--to", id]);
  assert.equal(linked.status, 0, linked.stderr || linked.stdout);
  assert.equal(JSON.parse(mental(home, b.root, ["status", "--json"]).stdout).data.id, id);
});

test("fork (origin ≠ old, upstream = old) does not silent inherit", () => {
  const home = tempHome();
  const upstream = initRepo(home, { name: "upstream", origin: "https://github.com/org/app.git" });
  assert.equal(mental(home, upstream.root, ["status", "--json"]).status, 0);

  const fork = initRepo(home, { name: "fork", origin: "https://github.com/me/app.git" });
  git(fork.root, ["remote", "add", "upstream", "https://github.com/org/app.git"], home);
  const r = resolveBundle({ cwd: fork.root, home, env: gitEnv(home), write: true });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "fork");
});

test("git init no origin binds by path; adding a known origin merges", () => {
  const home = tempHome();
  const named = initRepo(home, { name: "named", origin: "https://github.com/org/pathmerge.git" });
  const id = JSON.parse(mental(home, named.root, ["status", "--json"]).stdout).data.id;

  const orphan = initRepo(home, { name: "orphan", origin: null });
  const orphanId = JSON.parse(mental(home, orphan.root, ["status", "--json"]).stdout).data.id;
  assert.notEqual(orphanId, id);

  git(orphan.root, ["remote", "add", "origin", "https://github.com/org/pathmerge.git"], home);
  const merged = resolveBundle({ cwd: orphan.root, home, env: gitEnv(home), write: true });
  assert.equal(merged.ok, true);
  assert.equal(merged.data.id, id);
});

test("git worktree shares uuid with main worktree", () => {
  const home = tempHome();
  const { root } = initRepo(home, { origin: "https://github.com/org/wt.git" });
  const id = JSON.parse(mental(home, root, ["status", "--json"]).stdout).data.id;
  const wt = join(home, "work", "linked-wt");
  git(root, ["worktree", "add", wt], home);
  const r = mental(home, wt, ["status", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(JSON.parse(r.stdout).data.id, id);
});

test("remap --to lists then retargets this clone", () => {
  const home = tempHome();
  const a = initRepo(home, { name: "alpha", origin: "https://github.com/org/alpha.git" });
  const b = initRepo(home, { name: "beta", origin: "https://github.com/org/beta.git" });
  const idA = JSON.parse(mental(home, a.root, ["status", "--json"]).stdout).data.id;
  JSON.parse(mental(home, b.root, ["status", "--json"]).stdout).data.id;

  const listed = mental(home, b.root, ["remap", "--json"]);
  assert.equal(listed.status, 0);
  assert.equal(JSON.parse(listed.stdout).data.bindings.length, 2);

  const remapped = mental(home, b.root, ["remap", "--json", "--to", idA]);
  assert.equal(remapped.status, 0, remapped.stderr || remapped.stdout);
  assert.equal(JSON.parse(mental(home, b.root, ["status", "--json"]).stdout).data.id, idA);
  assert.match(readFileSync(join(b.root, ".mental-id"), "utf8"), new RegExp(idA));
  assert.equal(loadBindings(home).bindings.length >= 1, true);
});

test("split --copy duplicates OKF into the new slice", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Keep this", "--resume", "Continue"]);
  const sp = mental(home, root, ["split", "--json", "--copy"]);
  assert.equal(sp.status, 0, sp.stderr || sp.stdout);
  const body = JSON.parse(sp.stdout);
  const slice = join(home, ".mental", "projects", body.data.id);
  assert.equal(existsSync(join(slice, "journal")), true);
});
