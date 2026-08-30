import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { git, initRepo, mental, tempHome } from "./helpers.mjs";
import { openTimeDb, timeDbPath } from "../bin/lib/time.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${JSON.stringify(body.error || body)}`);
  return body;
}

function enableTrack(home, root) {
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]), "seed");
  parseOk(mental(home, root, ["option", "track", "on", "--json"]), "option track on");
}

function todayYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function getRow(root, id) {
  const opened = openTimeDb(timeDbPath(root), { write: false });
  const row = opened.db.prepare("SELECT * FROM intervals WHERE id = ?").get(id);
  opened.db.close();
  return row;
}

test("e2e: park sets billable = wall without an override", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Sit-down"]),
    "start",
  );
  parseOk(mental(home, root, ["park", "--json", "--resume", "Next hop"]), "park");
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const row = getRow(slice, started.data.id);
  assert.equal(row.status, "stopped");
  assert.equal(row.needs_user, 0);
  assert.equal(row.user, row.wall);
  const report = parseOk(mental(home, root, ["track", "report", "--json"]), "report");
  assert.equal(report.data.user, report.data.wall);
  assert.equal(report.data.running?.length, undefined);
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 0);
});

test("e2e: last_seen ≈ started after 3+ min still clocks wall on park", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "No heartbeat ping"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, startedAt, started.data.id);
  opened.db.close();
  parseOk(mental(home, root, ["park", "--json", "--resume", "After work"]), "park");
  const row = getRow(slice, started.data.id);
  assert.equal(row.status, "stopped");
  assert.equal(row.needs_user, 0);
  assert.equal(row.user, row.wall);
  assert.ok((row.wall_minutes || 0) >= 3);
});

test("e2e: journal stops the focused timer with billable = wall", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Journal hop"]),
    "start",
  );
  parseOk(
    mental(home, root, ["journal", "--json", "--title", "Closed hop", "--resume", "Next"]),
    "journal",
  );
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 0);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const row = getRow(slice, started.data.id);
  assert.equal(row.status, "stopped");
  assert.equal(row.user, row.wall);
  assert.equal(row.needs_user, 0);
});

test("e2e: handoff records AI-generated internal and customer copy in one command", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, [
      "track",
      "start",
      "--json",
      "--title-internal",
      "Investigate auth retry",
      "--title-external",
      "Login reliability",
    ]),
    "start",
  );
  const handoff = parseOk(
    mental(home, root, [
      "handoff",
      "--json",
      "--title",
      "Auth retry fixed",
      "--body",
      "Retry now preserves the original error.",
      "--resume",
      "Commit when asked — open loops: none",
      "--title-external",
      "Improved login reliability",
      "--body-external",
      "Corrected retry handling so failed login attempts return consistent results.",
      "--project-name",
      "Acme",
      "--via",
      "cursor",
    ]),
    "handoff",
  );
  assert.equal(handoff.data.review, undefined);
  assert.equal(handoff.data.time.title_internal, "Auth retry fixed");
  assert.equal(handoff.data.time.body_internal, "Retry now preserves the original error.");
  assert.equal(handoff.data.time.title_external, "Improved login reliability");
  assert.equal(
    handoff.data.time.body_external,
    "Corrected retry handling so failed login attempts return consistent results.",
  );
  assert.equal(handoff.data.time.project_name, "Acme");
  assert.equal(handoff.data.time.billable, handoff.data.time.wall);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(getRow(slice, started.data.id).status, "stopped");
});

test("e2e: second start same day is ensure-running; wall stays one clock", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--via", "cursor", "--title-internal", "Host A"]),
    "start A",
  );
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--via", "opencode", "--title-internal", "Host B"]),
    "start B",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(b.data.ensured, true);
  assert.equal(a.data.id, b.data.id);
  assert.equal(getRow(slice, a.data.id).status, "running");
  assert.equal(getRow(slice, a.data.id).via, "cursor");
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 1);
  assert.equal(glance.data.running[0].id, a.data.id);
});

test("e2e: leftover overnight flags stale_stop and keeps full wall, not last_seen clip", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const started = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Forgot overnight"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const startedAt = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  const lastSeen = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedAt, lastSeen, started.data.id);
  opened.db.close();
  const stopped = parseOk(mental(home, root, ["track", "stop", "--json"]), "stop leftover");
  const row = stopped.data.stopped[0];
  assert.equal(row.stale_stop, true);
  assert.equal(row.needs_user, false);
  assert.equal(row.user, row.wall);
  assert.ok((row.wall_minutes || 0) >= 13 * 60 - 1, `wall was ${row.wall_minutes}`);
  assert.notEqual(row.user, "1:00");
});

test("e2e: heartbeat unclocked then report commit-gap days", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const today = todayYmd();
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb gap");
  assert.equal(hb.data.track.unclocked, true);
  const report = parseOk(mental(home, root, ["track", "report", "--json"]), "report gaps");
  assert.ok(report.data.unclockedCommitDays.includes(today), JSON.stringify(report.data.unclockedCommitDays));
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Clock today"]), "start");
  parseOk(mental(home, root, ["track", "stop", "--json"]), "stop");
  const afterHb = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb clocked");
  assert.equal(afterHb.data.track.unclocked, false);
  const after = parseOk(mental(home, root, ["track", "report", "--json"]), "report clocked");
  assert.equal(after.data.unclockedCommitDays.includes(today), false);
});

test("e2e: --new runs a second clock; park stops focused only", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Client A"]),
    "start A",
  );
  const b = parseOk(
    mental(home, root, [
      "track",
      "start",
      "--json",
      "--new",
      "--title-internal",
      "Client B",
      "--title-external",
      "Discovery call",
    ]),
    "start B",
  );
  assert.notEqual(a.data.id, b.data.id);
  parseOk(mental(home, root, ["park", "--json", "--resume", "Switch back"]), "park focused");
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance");
  assert.equal(glance.data.running.length, 1);
  assert.equal(glance.data.running[0].id, a.data.id);
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  assert.equal(getRow(slice, b.data.id).status, "stopped");
  assert.equal(getRow(slice, b.data.id).user, getRow(slice, b.data.id).wall);
});

test("e2e: git commit on an unclocked day shows up as a date, not hours", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  git(root, ["commit", "--allow-empty", "-m", "later work"], home);
  const report = parseOk(mental(home, root, ["track", "report", "--json"]), "report");
  assert.ok(Array.isArray(report.data.unclockedCommitDays));
  assert.ok(report.data.unclockedCommitDays.includes(todayYmd()));
  assert.equal(report.data.user, "0:00");
  assert.equal(report.data.wall, "0:00");
});

test("e2e: two running intervals overlap through now", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "First"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  const nowIso = new Date().toISOString();
  opened.db
    .prepare(
      `INSERT INTO intervals (
        id, type, status, title_internal, title_external, body_internal, body_external,
        project_name, started, stopped, last_seen_at, focused, against, via, timestamp,
        task_id, stale_stop, discarded, needs_user, needs_external
      ) VALUES (?, 'Time', 'running', 'Second', '', '', '', '', ?, NULL, ?, 0, '', '', ?, ?, 0, 0, 0, 0)`,
    )
    .run(randomUUID(), a.data.started, nowIso, nowIso, a.data.task_id);
  opened.db.close();
  const glance = parseOk(mental(home, root, ["track", "--json"]), "glance overlap");
  assert.equal(glance.data.running.length, 2);
  assert.ok(glance.data.overlap.length >= 1, JSON.stringify(glance.data.overlap));
});

test("e2e: leftover from yesterday closes at last_seen on next start", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  enableTrack(home, root);
  const a = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Yesterday"]),
    "start",
  );
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  const m = String(a.data.started).match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1);
  const pad = (n) => String(n).padStart(2, "0");
  const startedY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${m[4]}`;
  const opened = openTimeDb(timeDbPath(slice), { write: true });
  opened.db
    .prepare("UPDATE intervals SET started = ?, last_seen_at = ? WHERE id = ?")
    .run(startedY, startedY, a.data.id);
  opened.db.close();
  const b = parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Today"]),
    "start today",
  );
  assert.notEqual(a.data.id, b.data.id);
  assert.equal(b.data.ensured, false);
  const old = getRow(slice, a.data.id);
  assert.equal(old.status, "stopped");
  assert.equal(old.stopped, startedY);
  assert.equal(old.user, old.wall);
});
