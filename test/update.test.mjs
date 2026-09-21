import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpSemver, checkForUpdate, isDevCheckout, peekUpdateNotice, readUpdateCache, skipUpdateCheck, takeTtyNag, updateHint, writeUpdateCache, UPDATE_CACHE_TTL_MS, UPDATE_DISCOVERY_TTL_MS, UPDATE_FAILURE_BACKOFF_MS, UPDATE_REFRESH_TIMEOUT_MS, UPDATE_TTY_NAG_TTL_MS } from "../bin/lib/update.mjs";
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

test("cmpSemver treats prerelease as less than the matching release", () => {
  assert.equal(cmpSemver("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(cmpSemver("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(cmpSemver("1.0.0-beta.1", "1.0.0-beta.2"), -1);
  assert.equal(cmpSemver("1.0.0-alpha", "1.0.0-alpha.1"), -1);
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
  assert.equal(body.update.latest, "99.0.0");
  assert.equal(body.update.current, VERSION);
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
  assert.equal(body.update, undefined);
});

test("doctor omits update when the check is skipped", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["doctor", "--json"]);
  assert.ok(r.status === 0 || r.status === 3, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.checks.some((c) => c.id === "update"), false);
  assert.equal(body.update, undefined);
});

test("peekUpdateNotice is null when skipped even if npm is ahead", () => {
  const home = tempHome();
  const notice = peekUpdateNotice({
    env: { HOME: home, MENTAL_SKIP_UPDATE_CHECK: "1", MENTAL_NPM_LATEST: "99.0.0" },
  });
  assert.equal(notice, null);
});

test("peekUpdateNotice returns a notice when pinned latest is ahead", () => {
  const home = tempHome();
  const notice = peekUpdateNotice({
    env: { HOME: home, MENTAL_NPM_LATEST: "99.0.0" },
    version: "0.4.0",
  });
  assert.ok(notice);
  assert.equal(notice.current, "0.4.0");
  assert.equal(notice.latest, "99.0.0");
  assert.match(notice.hint, /mental install/);
});

test("peekUpdateNotice is null when pinned latest matches this CLI", () => {
  const home = tempHome();
  const notice = peekUpdateNotice({
    env: { HOME: home, MENTAL_NPM_LATEST: VERSION },
  });
  assert.equal(notice, null);
});

test("peekUpdateNotice reads a fresh cache without npm", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  writeUpdateCache(env, "99.0.0");
  const notice = peekUpdateNotice({ env, version: "0.1.0" });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
});

test("peekUpdateNotice does not refresh a mid behind-TTL cache", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, "99.0.0", now - UPDATE_CACHE_TTL_MS + 24 * 60 * 60 * 1000);
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "1.0.0" },
    version: "0.1.0",
    now,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
});

test("peekUpdateNotice refreshes after the behind TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, "99.0.0", now - UPDATE_CACHE_TTL_MS - 1000);
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "88.0.0" },
    version: "0.1.0",
    now,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "88.0.0");
});

test("peekUpdateNotice does not refresh a current cache inside the discovery TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, "0.1.0", now - UPDATE_DISCOVERY_TTL_MS + 60 * 60 * 1000);
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "99.0.0" },
    version: "0.1.0",
    now,
  });
  assert.equal(notice, null);
});

test("peekUpdateNotice refreshes a current cache after the discovery TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, "0.1.0", now - UPDATE_DISCOVERY_TTL_MS - 1000);
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "99.0.0" },
    version: "0.1.0",
    now,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
});

test("null latest cache backs off inside the discovery TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, null, now);
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "99.0.0" },
    version: "0.1.0",
    now,
  });
  assert.equal(notice, null);
});

function failSpawn(status = 1, extra = {}) {
  return () => ({
    status,
    stdout: extra.stdout ?? "",
    stderr: extra.stderr ?? "fail",
    error: extra.error,
  });
}

test("checkForUpdate failure does not bump checkedAt", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const t0 = Date.now();
  writeUpdateCache(env, "0.1.0", t0);
  const r = checkForUpdate({ env, spawn: failSpawn(1), now: t0 + 1000 });
  assert.equal(r.latest, null);
  const cached = readUpdateCache(env);
  assert.equal(cached.latest, "0.1.0");
  assert.equal(cached.checkedAt, new Date(t0).toISOString());
  assert.ok(cached.lastFailedAt);
});

test("checkForUpdate timeout does not bump checkedAt", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const t0 = Date.now();
  writeUpdateCache(env, "0.1.0", t0);
  const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  checkForUpdate({ env, spawn: failSpawn(null, { error }), now: t0 + 1000 });
  const cached = readUpdateCache(env);
  assert.equal(cached.checkedAt, new Date(t0).toISOString());
  assert.equal(cached.latest, "0.1.0");
  assert.ok(cached.lastFailedAt);
});

test("failed peek does not hide a pinned latest during backoff", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  peekUpdateNotice({ env, spawn: failSpawn(1), version: "0.1.0", now });
  const notice = peekUpdateNotice({
    env: { ...env, MENTAL_NPM_LATEST: "99.0.0" },
    version: "0.1.0",
    now,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
  assert.equal(readUpdateCache(env).lastFailedAt, null);
});

test("failed peek retries after the failure backoff", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  peekUpdateNotice({ env, spawn: failSpawn(1), version: "0.1.0", now });
  const notice = peekUpdateNotice({
    env,
    spawn: () => ({ status: 0, stdout: "99.0.0\n", stderr: "" }),
    version: "0.1.0",
    now: now + UPDATE_FAILURE_BACKOFF_MS + 1000,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
  assert.equal(readUpdateCache(env).lastFailedAt, null);
});

test("failed refresh of a behind cache does not restart the behind TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  const checkedAt = now - UPDATE_CACHE_TTL_MS - 1000;
  writeUpdateCache(env, "99.0.0", checkedAt);
  const notice = peekUpdateNotice({
    env,
    spawn: failSpawn(1),
    version: "0.1.0",
    now,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
  const cached = readUpdateCache(env);
  assert.equal(cached.checkedAt, new Date(checkedAt).toISOString());
  assert.equal(cached.latest, "99.0.0");
  assert.ok(cached.lastFailedAt);
});

test("failure backoff skips a second spawn until it expires", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  let n = 0;
  const spawn = () => {
    n += 1;
    return { status: 1, stdout: "", stderr: "fail" };
  };
  peekUpdateNotice({ env, spawn, version: "0.1.0", now });
  peekUpdateNotice({ env, spawn, version: "0.1.0", now: now + 1000 });
  assert.equal(n, 1);
  peekUpdateNotice({ env, spawn, version: "0.1.0", now: now + UPDATE_FAILURE_BACKOFF_MS + 1000 });
  assert.equal(n, 2);
});

test("junk npm stdout is a failed check not a 24h lockout", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  peekUpdateNotice({
    env,
    spawn: failSpawn(0, { stdout: "npm notice extra\n" }),
    version: "0.1.0",
    now,
  });
  const notice = peekUpdateNotice({
    env,
    spawn: () => ({ status: 0, stdout: "99.0.0\n", stderr: "" }),
    version: "0.1.0",
    now: now + UPDATE_FAILURE_BACKOFF_MS + 1000,
  });
  assert.ok(notice);
  assert.equal(notice.latest, "99.0.0");
});

test("checkForUpdate spawns npm.cmd with shell on win32", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const calls = [];
  checkForUpdate({
    env,
    platform: "win32",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "1.2.3\n", stderr: "" };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm.cmd");
  assert.deepEqual(calls[0].args, ["view", NAME, "version"]);
  assert.equal(calls[0].options.shell, true);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.timeout, UPDATE_REFRESH_TIMEOUT_MS);
  assert.equal(UPDATE_REFRESH_TIMEOUT_MS, 5000);
});

test("checkForUpdate spawns npm unshelled on unix", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const calls = [];
  checkForUpdate({
    env,
    platform: "linux",
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "1.2.3\n", stderr: "" };
    },
  });
  assert.equal(calls[0].command, "npm");
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, false);
});

test("takeTtyNag prints once then suppresses until the nag TTL", () => {
  const home = tempHome();
  const env = { HOME: home, XDG_CACHE_HOME: `${home}/.cache` };
  const now = Date.now();
  writeUpdateCache(env, "99.0.0", now);
  const notice = { current: "0.1.0", latest: "99.0.0", hint: "upgrade" };
  assert.deepEqual(takeTtyNag(notice, { env, now }), notice);
  assert.equal(takeTtyNag(notice, { env, now: now + 60 * 1000 }), null);
  const again = takeTtyNag(notice, { env, now: now + UPDATE_TTY_NAG_TTL_MS + 1000 });
  assert.deepEqual(again, notice);
  assert.ok(readUpdateCache(env)?.lastNaggedAt);
});

test("heartbeat --json includes envelope update when npm is ahead", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["heartbeat", "--json"], {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: "99.0.0",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.update.latest, "99.0.0");
  assert.equal(body.update.current, VERSION);
  assert.match(body.update.hint, /mental install/);
});

test("heartbeat --json omits update when this CLI matches npm", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["heartbeat", "--json"], {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: VERSION,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.update, undefined);
});

test("named TTY command prints the update hint when behind", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["heartbeat"], {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: "99.0.0",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /99\.0\.0/);
  assert.match(r.stdout, /mental install/);
});

test("TTY omits a second update hint the same day while JSON still includes it", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const env = {
    MENTAL_SKIP_UPDATE_CHECK: "0",
    MENTAL_NPM_LATEST: "99.0.0",
  };
  const first = mental(home, root, ["heartbeat"], env);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.match(first.stdout, /mental install/);
  const second = mental(home, root, ["heartbeat"], env);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.doesNotMatch(second.stdout, /mental install/);
  const json = mental(home, root, ["heartbeat", "--json"], env);
  assert.equal(json.status, 0, json.stderr || json.stdout);
  const body = JSON.parse(json.stdout);
  assert.equal(body.update.latest, "99.0.0");
});
