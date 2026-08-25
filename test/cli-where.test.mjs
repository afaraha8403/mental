import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gitEnv, initRepo, tempHome } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

function mental(home, cwd, args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...gitEnv(home), ...extraEnv },
  });
}

test("mental where --json in a git repo is home mode and does not create a binding", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["where", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.mode, "home");
  assert.equal(body.data.gitRoot, root);
  assert.equal(body.data.id, null);
  assert.match(body.data.reason, /no binding yet|read-only/);
});

test("mental where --json respects MENTAL_DIR", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const override = join(home, "override");
  mkdirSync(override);
  const r = mental(home, root, ["where", "--json"], { MENTAL_DIR: override });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.mode, "env");
  assert.equal(body.data.root, override);
});

test("mental where human output lists root and mode", () => {
  const home = tempHome();
  const scratch = join(home, "scratch");
  mkdirSync(scratch, { recursive: true });
  const r = mental(home, scratch, ["where"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /^root:\s+/m);
  assert.match(r.stdout, /^mode:\s+personal$/m);
});

test("unknown command --json is ok:false", () => {
  const home = tempHome();
  const r = mental(home, home, ["nope", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unknown-command");
});
