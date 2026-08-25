import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBundle, findLocalMental } from "../bin/lib/resolve.mjs";
import { findGitRoot } from "../bin/lib/git.mjs";
import { loadBindings } from "../bin/lib/bindings.mjs";
import { gitEnv, initRepo, tempHome } from "./helpers.mjs";

test("MENTAL_DIR wins over walk-up .mental and git binding", () => {
  const home = tempHome();
  const { root, cwd } = initRepo(home, { nested: "packages/foo" });
  mkdirSync(join(root, ".mental"), { recursive: true });
  const override = mkdtempSync(join(tmpdir(), "mental-env-"));
  const env = { ...gitEnv(home), MENTAL_DIR: override };

  const r = resolveBundle({ cwd, home, env, write: false });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "env");
  assert.equal(r.data.root, override);
});

test("--dir wins over MENTAL_DIR", () => {
  const home = tempHome();
  const { cwd } = initRepo(home);
  const a = mkdtempSync(join(tmpdir(), "mental-a-"));
  const b = mkdtempSync(join(tmpdir(), "mental-b-"));
  const env = { ...gitEnv(home), MENTAL_DIR: a };
  const r = resolveBundle({ cwd, home, env, dir: b, write: false });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "env");
  assert.equal(r.data.root, b);
  assert.match(r.data.reason, /^--dir /);
});

test("walk-up finds leftover .mental but resolve stays home unless opted in", () => {
  const home = tempHome();
  const { root, cwd } = initRepo(home, { nested: "packages/foo" });
  const local = join(root, ".mental");
  mkdirSync(local, { recursive: true });
  writeFileSync(join(local, "index.md"), "# leftover\n");

  const found = findLocalMental(cwd, { home, gitRoot: root });
  assert.equal(found, local);

  const ro = resolveBundle({ cwd, home, env: gitEnv(home), write: false });
  assert.equal(ro.ok, true);
  assert.equal(ro.data.mode, "home");
  assert.equal(ro.data.id, null);
  assert.equal(ro.data.gitRoot, root);
  assert.match(ro.data.reason, /leftover/);
});

test("opted-in .mental-local marker → mode local", () => {
  const home = tempHome();
  const { root, cwd } = initRepo(home, { nested: "packages/foo" });
  const local = join(root, ".mental");
  mkdirSync(local, { recursive: true });
  writeFileSync(join(local, ".mental-local"), "local\n");
  writeFileSync(join(local, "index.md"), "# local\n");

  const r = resolveBundle({ cwd, home, env: gitEnv(home), write: false });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "local");
  assert.equal(r.data.root, local);
  assert.equal(r.data.gitRoot, root);
});

test("walk-up does not treat ~/.mental as a project-local bundle", () => {
  const home = tempHome();
  mkdirSync(join(home, ".mental"), { recursive: true });
  const scratch = join(home, "scratch");
  mkdirSync(scratch, { recursive: true });

  const found = findLocalMental(scratch, { home, gitRoot: null });
  assert.equal(found, null);

  const r = resolveBundle({ cwd: scratch, home, env: gitEnv(home), write: false });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "personal");
  assert.equal(r.data.root, join(home, ".mental"));
});

test("git root vs nested cwd: bind the repo root, not the package dir", () => {
  const home = tempHome();
  const { root, cwd } = initRepo(home, {
    origin: "https://github.com/afaraha8403/mental.git",
    nested: "packages/foo",
  });

  const gitRoot = findGitRoot(cwd, { env: gitEnv(home) });
  assert.equal(gitRoot, root);

  const r = resolveBundle({ cwd, home, env: gitEnv(home), write: true });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "home");
  assert.equal(r.data.gitRoot, root);
  assert.ok(r.data.id);
  assert.equal(r.data.root, join(home, ".mental", "projects", r.data.id));

  const data = loadBindings(home);
  assert.equal(data.bindings.length, 1);
  assert.deepEqual(data.bindings[0].paths, [root]);
  assert.equal(data.bindings[0].origins[0], "github.com/afaraha8403/mental");
});

test("SSH and HTTPS remotes share one uuid", () => {
  const home = tempHome();
  const a = initRepo(home, { name: "clone-a", origin: "git@github.com:org/app.git" });
  const first = resolveBundle({ cwd: a.root, home, env: gitEnv(home), write: true });
  assert.equal(first.ok, true);

  const b = initRepo(home, { name: "clone-b", origin: "https://github.com/org/app.git" });
  const second = resolveBundle({ cwd: b.root, home, env: gitEnv(home), write: true });
  assert.equal(second.ok, true);
  assert.equal(second.data.id, first.data.id);
  assert.equal(loadBindings(home).bindings.length, 1);
});

test("not a git repo → personal ~/.mental", () => {
  const home = tempHome();
  const scratch = join(home, "not-a-repo");
  mkdirSync(scratch, { recursive: true });
  const r = resolveBundle({ cwd: scratch, home, env: gitEnv(home), write: false });
  assert.equal(r.ok, true);
  assert.equal(r.data.mode, "personal");
  assert.equal(r.data.id, null);
  assert.equal(r.data.gitRoot, null);
});

test("missing MENTAL_DIR directory is a resolve error", () => {
  const home = tempHome();
  const { cwd } = initRepo(home);
  const env = { ...gitEnv(home), MENTAL_DIR: join(home, "nope") };
  const r = resolveBundle({ cwd, home, env, write: false });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "env-dir-missing");
});
