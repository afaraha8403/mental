import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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

test("same-day start is ensure-running; title amends; one sit-down clock", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--via", "cursor", "--title-internal", "Task A"]),
    "start A",
  );
  assert.equal(a.data.ensured, false);
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--via", "claude-code", "--title-internal", "Task B"]),
    "start B",
  );
  assert.equal(b.data.ensured, true);
  assert.equal(a.data.id, b.data.id);
  assert.equal(b.data.title_internal, "Task B");
  assert.equal(b.data.started, a.data.started);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const prior = getRow(slice, a.data.id);
  assert.equal(prior.status, "running");
  assert.equal(prior.via, "cursor");
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 1);
  assert.equal(glance.data.running[0].id, a.data.id);
  const stopped = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop focused");
  assert.equal(stopped.data.stopped.length, 1);
  assert.equal(stopped.data.stopped[0].id, b.data.id);
  const after = parseOk(mental(home, root, ["track", "--json"]), "glance empty");
  assert.equal(after.data.running.length, 0);
});

test("--new starts a second clock; ensure-running keeps both continuable", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Acme"]),
    "start Acme",
  );
  const b = parseOk(
    mental(home, root, [
      "track",
      "start",
      "--json",
      "--new",
      "--title-internal",
      "Internal",
      "--title-external",
      "Platform maintenance",
    ]),
    "start --new",
  );
  assert.equal(b.data.ensured, false);
  assert.notEqual(a.data.id, b.data.id);
  assert.notEqual(a.data.task_id, b.data.task_id);
  assert.equal(b.data.title_external, "Platform maintenance");
  const glance = parseOk(mental(home, root, ["track", "--json"]), "two clocks");
  assert.equal(glance.data.running.length, 2);
  assert.equal(glance.data.overlap.length, 0);
  const ping = parseOk(mental(home, root, ["track", "start", "--json", "--via", "claude-code"]), "ensure");
  assert.equal(ping.data.ensured, true);
  assert.equal(ping.data.id, b.data.id);
  const labeled = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-external", "Invoice line"]),
    "ensure external",
  );
  assert.equal(labeled.data.ensured, true);
  assert.equal(labeled.data.id, b.data.id);
  assert.equal(labeled.data.title_external, "Invoice line");
  const still = parseOk(mental(home, root, ["track", "--json"]), "still two");
  assert.equal(still.data.running.length, 2);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(getRow(slice, a.data.id).status, "running");
  assert.equal(getRow(slice, b.data.id).status, "running");
});

test("extra running row on the same task is closed at last_seen", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Keep"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const extraId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const lastSeen = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare(
      `INSERT INTO intervals (
        id, type, status, title_internal, title_external, body_internal, body_external,
        project_name, started, stopped, last_seen_at, focused, against, via, timestamp,
        task_id, stale_stop, discarded, needs_user, needs_external
      ) VALUES (?, 'Time', 'running', 'Dup', '', '', '', '', ?, NULL, ?, 0, '', '', ?, ?, 0, 0, 0, 0)`,
    )
    .run(extraId, a.data.started, lastSeen, a.data.timestamp || lastSeen, a.data.task_id);
  opened.db.close();
  const ping = parseOk(mental(home, root, ["track", "start", "--json"]), "ensure extras");
  assert.equal(ping.data.ensured, true);
  assert.equal(ping.data.id, a.data.id);
  const extra = getRow(slice, extraId);
  assert.equal(extra.status, "stopped");
  assert.equal(extra.stopped, lastSeen);
  const glance = parseOk(mental(home, root, ["track", "--json"]), "one runner");
  assert.equal(glance.data.running.length, 1);
});

test("stop --billable records less than wall; --user is an alias; JSON has billable", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Invoice"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db.prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?").run(
    startedAt,
    startedAt,
    started.data.id,
  );
  opened.db.close();
  const both = parseErr(
    mental(home, root, ["track", "stop", "--json", "--billable", "1:00", "--user", "0:30"]),
    "both flags",
  );
  assert.match(both.error.message, /not both/);
  const stopped = parseOk(
    mental(home, root, ["track", "stop", "--json", "--billable", "1:00"]),
    "stop billable",
  );
  assert.equal(stopped.data.stopped[0].billable, "1:00");
  assert.equal(stopped.data.stopped[0].user, "1:00");
  assert.ok((stopped.data.stopped[0].wall_minutes || 0) >= 89);
});

test("schema migration preserves legacy user hours as billable", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Legacy"]),
    "start",
  );
  parseOk(mental(home, root, ["track", "stop", "--json"]), "stop");
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db.exec("ALTER TABLE intervals DROP COLUMN billable");
  opened.db.exec("ALTER TABLE intervals DROP COLUMN billable_minutes");
  opened.db.prepare("UPDATE meta SET value = '1' WHERE key = 'schema'").run();
  opened.db.close();

  const migrated = openTimeDb(timeDbPath(slice), { write: true });
  const row = migrated.db
    .prepare('SELECT "user", user_minutes, billable, billable_minutes FROM intervals WHERE id = ?')
    .get(started.data.id);
  migrated.db.close();
  assert.equal(row.billable, row.user);
  assert.equal(row.billable_minutes, row.user_minutes);
});

test("start without --title-internal uses Session", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(mental(home, root, ["track", "start", "--json"]), "start default title");
  assert.equal(started.data.ensured, false);
  assert.equal(started.data.title_internal, "Session");
  assert.equal(started.data.project_name, basename(root));
});

test("missing customer copy surfaces a structured review; supplied copy does not", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Private wording"]), "start");
  const missing = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop missing copy");
  assert.equal(missing.data.review.kind, "customer-copy");
  assert.equal(missing.data.review.interval_ids.length, 1);
  assert.equal(missing.data.review.questions.length, 1);
  assert.equal(missing.data.review.questions[0].id, "customer-copy-action");
  assert.equal(missing.data.review.questions[0].allow_multiple, false);
  assert.equal(missing.data.review.questions[0].options[0].id, "generate");
  assert.match(missing.data.review.questions[0].options[0].label, /\(Recommended\)$/);
  const blockedOut = join(home, "blocked-customer.csv");
  const blocked = parseErr(
    mental(home, root, ["track", "export", "--json", "--external", "--out", blockedOut]),
    "export missing copy",
  );
  assert.equal(blocked.error.code, "needs-customer-copy");
  assert.equal(blocked.error.review.kind, "customer-copy");
  assert.equal(existsSync(blockedOut), false);
  parseOk(
    mental(home, root, [
      "track",
      "amend",
      "--json",
      "--id",
      missing.data.stopped[0].id,
      "--title-external",
      "Authentication investigation",
      "--body-external",
      "Investigated authentication behavior and documented the resulting improvements.",
    ]),
    "amend generated copy",
  );

  parseOk(
    mental(home, root, [
      "track",
      "start",
      "--json",
      "--title-internal",
      "Private details",
      "--body-internal",
      "Internal implementation notes.",
      "--title-external",
      "Authentication improvements",
      "--body-external",
      "Improved login reliability and error handling.",
    ]),
    "start with copy",
  );
  const complete = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop with copy");
  assert.equal(complete.data.review, undefined);
  assert.equal(complete.data.stopped[0].title_external, "Authentication improvements");
  assert.equal(complete.data.stopped[0].body_external, "Improved login reliability and error handling.");
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

test("stale stop sets billable = wall and flags stale_stop; --accept-stale rejected on --json", () => {
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

test("park stops the focused runner after ensure-running kept one clock", () => {
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

test("last_seen matching started is not never-started; stop still sets billable = wall", () => {
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
  const header = csv.split("\n")[0];
  assert.match(header, /^date,/);
  assert.match(header, /billable/);
  assert.doesNotMatch(header, /(^|,)user(,|$)/);
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
  const over = parseErr(mental(home, root, ["track", "stop", "--json", "--billable", "99:00"]), "over wall");
  assert.match(over.error.message, /billable must be <= wall/);
});

function shiftIsoDate(iso, dayDelta) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayDelta);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${m[4]}`;
}

test("new calendar day closes leftover at last_seen then starts a new interval", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Friday"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedY = shiftIsoDate(a.data.started, -1);
  const lastY = startedY;
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedY, lastY, a.data.id);
  opened.db.close();
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Monday"]),
    "start next day",
  );
  assert.equal(b.data.ensured, false);
  assert.notEqual(a.data.id, b.data.id);
  const old = getRow(slice, a.data.id);
  assert.equal(old.status, "stopped");
  assert.equal(old.stopped, lastY);
  assert.equal(old.user, old.wall);
  assert.equal(old.wall_minutes, 0);
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 1);
  assert.equal(glance.data.running[0].id, b.data.id);
});

test("12h started cap closes at last_seen then starts a new interval", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Long day"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  const lastSeen = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, lastSeen, a.data.id);
  opened.db.close();
  const b = parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Next"]), "start after cap");
  assert.equal(b.data.ensured, false);
  assert.notEqual(a.data.id, b.data.id);
  const old = getRow(slice, a.data.id);
  assert.equal(old.status, "stopped");
  assert.equal(old.stopped, lastSeen);
  assert.ok((old.wall_minutes || 0) >= 11 * 60);
  assert.ok((old.wall_minutes || 0) <= 13 * 60);
});

test("heartbeat does not ping a leftover from another day; TTY heartbeat does not start", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const beforeStart = parseOk(mental(home, root, ["track", "--json"]), "glance none");
  assert.equal(beforeStart.data.running.length, 0);
  const tty = mental(home, root, ["heartbeat"]);
  assert.equal(tty.status, 0, tty.stderr || tty.stdout);
  const stillNone = parseOk(mental(home, root, ["track", "--json"]), "glance after tty hb");
  assert.equal(stillNone.data.running.length, 0);

  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Leftover"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedY = shiftIsoDate(a.data.started, -1);
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedY, startedY, a.data.id);
  opened.db.close();
  parseOk(mental(home, root, ["heartbeat", "--json"]), "hb leftover");
  assert.equal(getRow(slice, a.data.id).last_seen_at, startedY);
});
