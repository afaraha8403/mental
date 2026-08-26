import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpSemver, checkForUpdate, isDevCheckout, skipUpdateCheck, updateHint } from "../bin/lib/update.mjs";
import { NAME, VERSION } from "../bin/lib/pkg.mjs";
import { initRepo, mental, tempHome } from "./helpers.mjs";

test("isDevCheckout is true in this git tree", () => {
  assert.equal(isDevCheckout(), true);
});

test("cmpSemver orders major.minor.patch", () => {
  assert.equal(cmpSemver("1.0.0", "1.0.0"), 0);
  assert.equal(cmpSemver("1.2.3", "1.2.4"), -1);
  assert.equal(cmpSemver("2.0.0", "1.9.9"), 1);
  assert.equal(cmpSemver("0.2.2", "0.2.10"), -1);
});

test("skipUpdateCheck reads MENTAL_SKIP_UPDATE_CHECK", () => {
  assert.equal(skipUpdateCheck({ MENTAL_SKIP_UPDATE_CHECK: "1" }), true);
  assert.equal(skipUpdateCheck({ MENTAL_SKIP_UPDATE_CHECK: "true" }), true);
  assert.equal(skipUpdateCheck({ MENTAL_SKIP_UPDATE_CHECK: "0" }), false);
  assert.equal(skipUpdateCheck({}), false);
});

test("checkForUpdate skips when MENTAL_SKIP_UPDATE_CHECK is set", () => {
  const r = checkForUpdate({ env: { MENTAL_SKIP_UPDATE_CHECK: "1", MENTAL_NPM_LATEST: "9.9.9" } });
  assert.equal(r.skipped, true);
  assert.equal(r.latest, null);
});

test("checkForUpdate pins MENTAL_NPM_LATEST without npm", () => {
  const r = checkForUpdate({ env: { MENTAL_NPM_LATEST: "9.9.9" } });
  assert.equal(r.skipped, false);
  assert.equal(r.latest, "9.9.9");
});

test("updateHint names the package and both versions", () => {
  const msg = updateHint("0.2.2", "0.3.0");
  assert.match(msg, /0\.2\.2/);
  assert.match(msg, /0\.3\.0/);
  assert.match(msg, new RegExp(NAME.replace("/", "\\/")));
});

test("doctor warns when npm latest is ahead of this CLI", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["doctor", "--json"], {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: "99.0.0",
  });
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  const upd = body.data.checks.find((c) => c.id === "update");
  assert.ok(upd, "doctor should include an update check");
  assert.equal(upd.ok, false);
  assert.equal(upd.level, "warn");
  assert.match(upd.message, /99\.0\.0/);
  assert.match(upd.message, new RegExp(VERSION.replace(/\./g, "\\.")));
});

test("doctor is clean on update when versions match", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["doctor", "--json"], {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: VERSION,
  });
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  const upd = body.data.checks.find((c) => c.id === "update");
  assert.ok(upd);
  assert.equal(upd.ok, true);
  assert.equal(upd.level, "info");
});

test("doctor omits update when the check is skipped", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["doctor", "--json"]);
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.checks.some((c) => c.id === "update"), false);
});
