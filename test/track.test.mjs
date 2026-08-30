import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, initRepo, mental, tempHome } from "./helpers.mjs";
import { TIME_DB, backupTimeDb, openTimeDb, timeDbPath } from "../bin/lib/time.mjs";
import { importLegacyBundle } from "../bin/lib/import-legacy.mjs";
import { copyOkfTree } from "../bin/lib/okf.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${JSON.stringify(body.error || body)}`);
  return body;
}

function parseErr(r, label) {
  assert.notEqual(r.status, 0, `${label} should fail: ${r.stdout}`);
  return JSON.parse(r.stdout);
}

function enableTrack(home, root) {
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]), "seed");
  parseOk(mental(home, root, ["option", "track", "on", "--json"]), "option track on");
}

function ageLastSeen(root, id, iso) {
  const opened = openTimeDb(timeDbPath(root), { write: true });
  assert.equal(opened.ok, true, opened.error?.message);
  opened.db.prepare("UPDATE intervals SET last_seen_at = ? WHERE id = ?").run(iso, id);
  opened.db.close();
}

function getRow(root, id) {
  const opened = openTimeDb(timeDbPath(root), { write: false });
  const row = opened.db.prepare("SELECT * FROM intervals WHERE id = ?").get(id);
  opened.db.close();
  return row;
}

test("new start stops every running interval; one live clock", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Task A"]),
    "start A",
  );
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Task B"]),
    "start B",
  );
  assert.notEqual(a.data.id, b.data.id);
  assert.equal(b.data.focused, true);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const prior = getRow(slice, a.data.id);
  assert.equal(prior.status, "stopped");
  assert.equal(prior.needs_user, 0);
  assert.ok(prior.user);
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 1);
  assert.equal(glance.data.running[0].id, b.data.id);
  const stopped = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop focused");
  assert.equal(stopped.data.stopped.length, 1);
  assert.equal(stopped.data.stopped[0].id, b.data.id);
  const after = parseOk(mental(home, root, ["track", "--json"]), "glance empty");
  assert.equal(after.data.running.length, 0);
});

test("heartbeat pings focused last_seen; glance is not a ping", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Focused"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const old = "2026-08-28T10:00:00-04:00";
  ageLastSeen(slice, a.data.id, old);
  parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat");
  assert.notEqual(getRow(slice, a.data.id).last_seen_at, old, "focused heartbeat refreshes last_seen");
  ageLastSeen(slice, a.data.id, old);
  parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(getRow(slice, a.data.id).last_seen_at, old, "glance is not a focus ping");
});

test("stale stop sets user = wall and flags stale_stop; --accept-stale rejected on --json", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Forgot"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
  const lastSeen = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, lastSeen, started.data.id);
  opened.db.close();
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance stale");
  const row = glance.data.running[0];
  assert.equal(row.stale, true);
  const accept = parseErr(
    mental(home, root, ["track", "stop", "--json", "--accept-stale"]),
    "accept-stale json",
  );
  assert.match(accept.error.message, /TTY-only/);
  const stopped = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop stale no user");
  assert.equal(stopped.data.stopped[0].needs_user, false);
  assert.equal(stopped.data.stopped[0].stale_stop, true);
  assert.ok(stopped.data.stopped[0].user);
  assert.ok((stopped.data.stopped[0].wall_minutes || 0) >= 239);
  assert.equal(stopped.data.stopped[0].user, stopped.data.stopped[0].wall);
});

test("false start discard is excluded from report", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "False start"]), "start");
  parseOk(mental(home, root, ["track", "discard", "--json"]), "discard");
  const report = parseOk(mental(home, root, ["track", "report", "--json"]), "report");
  assert.equal(report.data.rows.length, 0);
});

test("park stops the focused runner; new start already closed the previous", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Keep"]), "start A");
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Park me"]),
    "start B",
  );
  parseOk(mental(home, root, ["park", "--json", "--resume", "Continue after hop"]), "park");
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 0);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(getRow(slice, b.data.id).status, "stopped");
  assert.ok(getRow(slice, b.data.id).user);
});

test("stop --all from --json does not require --user when a runner is stale", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Stale one"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
  const lastSeen = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, lastSeen, a.data.id);
  opened.db.close();
  const all = parseOk(mental(home, root, ["track", "stop", "--all", "--json"]), "stop --all json");
  assert.equal(all.data.stopped.length, 1);
  assert.equal(all.data.stopped[0].user, all.data.stopped[0].wall);
});

test("heartbeat JSON has compact track; TTY heartbeat and pulse have no hours", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Secret title"]), "start");
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb json");
  assert.equal(hb.data.track.enabled, true);
  assert.equal(hb.data.track.unclocked, false);
  assert.equal(hb.data.track.runningCount, 1);
  assert.equal(typeof hb.data.track.running[0].id, "string");
  assert.equal(hb.data.track.running[0].title_internal, undefined);
  assert.equal(hb.data.track.running[0].wall, undefined);
  const tty = mental(home, root, ["heartbeat"]);
  assert.equal(tty.status, 0, tty.stderr || tty.stdout);
  assert.doesNotMatch(tty.stdout, /Secret title/);
  assert.doesNotMatch(tty.stdout, /\bwall\b/);
  const pulse = parseOk(mental(home, root, ["pulse", "--json"]), "pulse");
  assert.equal(pulse.data.projects[0].wall, undefined);
  assert.equal(pulse.data.projects[0].track, undefined);
  const pulseTty = mental(home, root, ["pulse"]);
  assert.doesNotMatch(pulseTty.stdout, /\bwall\b/);
  assert.doesNotMatch(pulseTty.stdout, /Secret title/);
});

test("heartbeat unclocked is true after a hop today with no interval", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const before = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb before start");
  assert.equal(before.data.track.enabled, true);
  assert.equal(before.data.track.unclocked, true);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Clocked"]), "start");
  const after = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb after start");
  assert.equal(after.data.track.unclocked, false);
});

test("last_seen matching started is not never-started; stop still sets user = wall", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "No later ping"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, startedAt, started.data.id);
  opened.db.close();
  const stopped = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop no ping");
  assert.equal(stopped.data.stopped[0].needs_user, false);
  assert.equal(stopped.data.stopped[0].user, stopped.data.stopped[0].wall);
  assert.ok((stopped.data.stopped[0].wall_minutes || 0) >= 4);
});

test("export --external strips internal columns; --out inside repo is usage", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(
    mental(home, root, [
      "track",
      "start",
      "--json",
      "--title-internal",
      "WIP ticket slang",
      "--project-name",
      "Acme",
    ]),
    "start",
  );
  parseOk(
    mental(home, root, [
      "track",
      "stop",
      "--json",
      "--title-external",
      "Auth callback",
      "--body-external",
      "Shipped login.",
    ]),
    "stop",
  );
  const inside = parseErr(
    mental(home, root, ["track", "export", "--json", "--external", "--out", "timesheet.csv"]),
    "export in repo",
  );
  assert.match(inside.error.message, /outside the git worktree/);
  const out = join(home, "invoice.csv");
  parseOk(
    mental(home, root, [
      "track",
      "export",
      "--json",
      "--external",
      "--project",
      "Acme",
      "--out",
      out,
    ]),
    "export ok",
  );
  const csv = readFileSync(out, "utf8");
  assert.match(csv, /title_external/);
  assert.doesNotMatch(csv, /title_internal/);
  assert.doesNotMatch(csv, /WIP ticket/);
  assert.match(csv, /Auth callback/);
  assert.doesNotMatch(csv, /stale_stop/);
  assert.doesNotMatch(csv, /against/);
});

test("doctor exit 3 if time.sqlite is git-tracked", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  writeFileSync(join(root, "time.sqlite"), "not-a-db\n");
  git(root, ["add", "time.sqlite"], home);
  git(root, ["commit", "-m", "accidentally track hours"], home);
  const doc = mental(home, root, ["doctor", "--json"]);
  assert.equal(doc.status, 3, doc.stdout);
  const body = JSON.parse(doc.stdout);
  const hit = body.data.checks.find((c) => c.id === "time-git");
  assert.ok(hit);
  assert.equal(hit.ok, false);
});

test("copyOkfTree uses sqlite backup not live cp; leftover ingest copies time.sqlite", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Migrating"]), "start");
  parseOk(
    mental(home, root, ["track", "stop", "--json", "--title-external", "Migration work"]),
    "stop",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(existsSync(join(slice, TIME_DB)), true);
  const dest = join(home, "copied-bundle");
  mkdirSync(dest, { recursive: true });
  const copied = copyOkfTree(slice, dest);
  assert.ok(copied.includes(TIME_DB));
  assert.equal(existsSync(join(dest, TIME_DB)), true);
  const again = copyOkfTree(slice, dest);
  assert.equal(again.includes(TIME_DB), false, "refuse overwrite dest hours");

  const leftover = join(root, ".mental");
  mkdirSync(leftover, { recursive: true });
  writeFileSync(
    join(leftover, "notes-only.md"),
    `---
type: Note
title: leftover note
timestamp: 2026-08-20T12:00:00Z
status: active
---
# leftover
`,
  );
  const ingestDest = join(home, "ingest-dest");
  mkdirSync(ingestDest, { recursive: true });
  backupTimeDb(join(slice, TIME_DB), join(leftover, TIME_DB));
  const imported = importLegacyBundle(leftover, ingestDest);
  assert.ok(imported.copied.includes(TIME_DB), JSON.stringify(imported));
  assert.equal(existsSync(join(ingestDest, TIME_DB)), true);
});

test("invalid h:mm is usage; user cannot exceed wall", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Bounds"]), "start");
  const bad = parseErr(mental(home, root, ["track", "stop", "--json", "--user", "1:60"]), "1:60");
  assert.equal(bad.error.code, "usage");
  const over = parseErr(mental(home, root, ["track", "stop", "--json", "--user", "99:00"]), "over wall");
  assert.match(over.error.message, /user must be <= wall/);
});
