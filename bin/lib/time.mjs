/**
 * Bundle `time.sqlite` — optional hours SoT (not the FTS index, never git).
 * Minutes are source of truth; `h:mm` is render. Migrate in place; never DROP.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalPath, commitShortDates, isInsideDir } from "./git.mjs";

function isBundleRoot(where) {
  if (where.mode === "env" || where.mode === "local" || where.mode === "personal") return true;
  return Boolean(where.id);
}

export const TIME_DB = "time.sqlite";
export const TIME_SCHEMA_VERSION = 2;
export const STALE_LAST_SEEN_MS = 2 * 60 * 60 * 1000;
export const STALE_STARTED_MS = 12 * 60 * 60 * 1000;
/** Wall shorter than this is a false start (0:00 minutes), not last_seen ≈ started. */
export const NEVER_STARTED_MS = 120 * 1000;
export const HEARTBEAT_RUNNING_CAP = 7;
export const PROJECT_NAME_MAX = 80;
/** Default --title-internal when omitted. Start is ensure-running; a name is optional. */
export const DEFAULT_TITLE_INTERNAL = "Session";

export const SQLITE_MISSING = {
  code: "sqlite",
  message: "node:sqlite is required for time tracking (no in-memory fallback).",
};

const TIME_SIDECARS = new Set([TIME_DB, `${TIME_DB}-wal`, `${TIME_DB}-shm`]);

const require = createRequire(import.meta.url);

export function loadDatabaseSync() {
  try {
    const mod = require("node:sqlite");
    return mod.DatabaseSync ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} root bundle directory
 */
export function timeDbPath(root) {
  return join(root, TIME_DB);
}

/**
 * Write only in a real bundle root (never `~/.mental/projects/time.sqlite`).
 * @param {{ id?: string | null, mode?: string }} where
 */
export function canWriteTime(where) {
  return isBundleRoot(where);
}

/**
 * @param {number} minutes
 */
export function formatHmm(minutes) {
  const n = Math.max(0, Math.floor(Number(minutes) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseHmm(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d+):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * @param {string | number | Date} started
 * @param {string | number | Date} stopped
 */
export function elapsedMinutes(started, stopped) {
  const a = Date.parse(String(started));
  const b = Date.parse(String(stopped));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (b < a) return 0;
  return Math.floor((b - a) / 60000);
}

/**
 * ISO-8601 with numeric offset (stored calendar date uses this offset).
 * @param {Date} [d]
 */
export function isoWithOffset(d = new Date()) {
  const tzo = -d.getTimezoneOffset();
  const sign = tzo >= 0 ? "+" : "-";
  const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const hh = pad(Math.floor(Math.abs(tzo) / 60));
  const mm = pad(Math.abs(tzo) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

/**
 * Calendar date from the stored offset, not UTC slice and not machine localDate.
 * @param {string} iso
 */
export function calendarDateFromIso(iso) {
  const m = String(iso || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, name: string } | { ok: false, error: { code: string, message: string } }}
 */
export function sanitizeProjectName(raw) {
  if (raw == null || raw === "") return { ok: true, name: "" };
  const s = String(raw).replace(/[\r\n]+/g, " ").trim();
  if (s.startsWith("=")) {
    return { ok: false, error: { code: "usage", message: "project_name must not start with =" } };
  }
  if (s.length > PROJECT_NAME_MAX) {
    return { ok: false, error: { code: "usage", message: `project_name max ${PROJECT_NAME_MAX} characters` } };
  }
  return { ok: true, name: s };
}

/**
 * CSV formula-escape every text cell.
 * @param {unknown} raw
 */
export function csvEscape(raw) {
  let t = raw == null ? "" : String(raw);
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/**
 * Short wall: hop elapsed (start → now) under 2 minutes. last_seen is not the test.
 * @param {string} isoStarted
 * @param {string} [_isoLastSeen] unused; kept so call sites stay stable
 * @param {Date} [now]
 */
export function isNeverStarted(isoStarted, _isoLastSeen, now = new Date()) {
  const a = Date.parse(isoStarted);
  if (!Number.isFinite(a)) return true;
  return now.getTime() - a < NEVER_STARTED_MS;
}

/**
 * Stale only if there was activity (not never-started).
 * @param {{ started: string, last_seen_at: string, status?: string }} row
 * @param {Date} [now]
 */
export function isStaleRow(row, now = new Date()) {
  if (row.status && row.status !== "running") return false;
  if (isNeverStarted(row.started, row.last_seen_at, now)) return false;
  const last = Date.parse(row.last_seen_at);
  const start = Date.parse(row.started);
  const t = now.getTime();
  if (!Number.isFinite(last) || !Number.isFinite(start)) return true;
  return t - last > STALE_LAST_SEEN_MS || t - start > STALE_STARTED_MS;
}

/**
 * Same sit-down: started today (local calendar) and under the 12h cap.
 * A quiet stretch without heartbeat is not a slice boundary. Park, a new
 * calendar day, or 12h since started is. last_seen 2h stale is a glance flag only.
 * @param {{ started: string, last_seen_at?: string, status?: string, discarded?: boolean }} row
 * @param {Date} [now]
 */
export function canContinueRunner(row, now = new Date()) {
  if (!row || row.discarded || (row.status && row.status !== "running")) return false;
  const start = Date.parse(row.started);
  if (!Number.isFinite(start)) return false;
  if (now.getTime() - start > STALE_STARTED_MS) return false;
  const startedDay = calendarDateFromIso(row.started);
  const today = calendarDateFromIso(isoWithOffset(now));
  return Boolean(startedDay) && startedDay === today;
}

/**
 * Suggested user minutes: last_seen - started (display only until stop --user).
 * @param {{ started: string, last_seen_at: string }} row
 */
export function suggestedUserMinutes(row) {
  return elapsedMinutes(row.started, row.last_seen_at);
}

function liveWallMinutes(row, now) {
  if (row.status === "stopped" && row.wall_minutes != null) return Number(row.wall_minutes) || 0;
  return elapsedMinutes(row.started, isoWithOffset(now));
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS intervals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'Time',
    status TEXT NOT NULL,
    title_internal TEXT NOT NULL,
    title_external TEXT,
    body_internal TEXT,
    body_external TEXT,
    project_name TEXT,
    started TEXT NOT NULL,
    stopped TEXT,
    last_seen_at TEXT NOT NULL,
    focused INTEGER NOT NULL DEFAULT 0,
    wall TEXT,
    "user" TEXT,
    billable TEXT,
    wall_minutes INTEGER,
    user_minutes INTEGER,
    billable_minutes INTEGER,
    against TEXT,
    via TEXT,
    timestamp TEXT NOT NULL,
    task_id TEXT NOT NULL,
    stale_stop INTEGER NOT NULL DEFAULT 0,
    discarded INTEGER NOT NULL DEFAULT 0,
    needs_user INTEGER NOT NULL DEFAULT 0,
    needs_external INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_intervals_task ON intervals(task_id);
  CREATE INDEX IF NOT EXISTS idx_intervals_status ON intervals(status);
`;

/**
 * @param {import("node:sqlite").DatabaseSync} db
 */
function migrate(db) {
  db.exec(SCHEMA_SQL);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get();
  const current = row ? Number(row.value) : 0;
  if (!Number.isFinite(current) || current < 2) {
    const columns = new Set(db.prepare("PRAGMA table_info(intervals)").all().map((column) => column.name));
    if (!columns.has("billable")) db.exec("ALTER TABLE intervals ADD COLUMN billable TEXT");
    if (!columns.has("billable_minutes")) db.exec("ALTER TABLE intervals ADD COLUMN billable_minutes INTEGER");
    db.exec(
      `UPDATE intervals
       SET billable = COALESCE(billable, "user"),
           billable_minutes = COALESCE(billable_minutes, user_minutes)`,
    );
  }
  if (!Number.isFinite(current) || current < TIME_SCHEMA_VERSION) {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("schema", String(TIME_SCHEMA_VERSION));
  }
}

/**
 * @param {string} file
 * @param {{ write?: boolean }} [opts]
 */
export function openTimeDb(file, { write = true } = {}) {
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) return { ok: false, error: SQLITE_MISSING };
  if (write) mkdirSync(dirname(file), { recursive: true });
  if (!write && !existsSync(file)) return { ok: false, error: { code: "missing", message: "no time.sqlite" } };
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    if (write) migrate(db);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "busy", message } };
  }
  return { ok: true, db };
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {() => unknown} fn
 */
export function withImmediateTxn(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw err;
  }
}

/**
 * Checkpoint + VACUUM INTO (never live `cp` of a WAL db).
 * Refuse if dest already exists (do not overwrite hours).
 * @param {string} srcFile
 * @param {string} destFile
 */
export function backupTimeDb(srcFile, destFile) {
  if (!existsSync(srcFile)) return { ok: true, skipped: true };
  if (existsSync(destFile)) {
    return {
      ok: false,
      error: { code: "exists", message: "dest time.sqlite already has hours; refuse overwrite" },
    };
  }
  const opened = openTimeDb(srcFile, { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    mkdirSync(dirname(destFile), { recursive: true });
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // checkpoint best-effort
    }
    if (typeof db.backup === "function") {
      db.backup(destFile);
    } else {
      const escaped = destFile.replaceAll("'", "''");
      db.exec(`VACUUM INTO '${escaped}'`);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "backup", message } };
  } finally {
    db.close();
  }
}

export function isTimeSidecarName(name) {
  return TIME_SIDECARS.has(name);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type || "Time",
    status: row.status,
    title_internal: row.title_internal,
    title_external: row.title_external || "",
    body_internal: row.body_internal || "",
    body_external: row.body_external || "",
    project_name: row.project_name || "",
    date: calendarDateFromIso(row.started) || "",
    started: row.started,
    stopped: row.stopped || null,
    last_seen_at: row.last_seen_at,
    focused: Boolean(row.focused),
    wall: row.wall || null,
    user: row.billable || row.user || null,
    billable: row.billable || row.user || null,
    wall_minutes: row.wall_minutes == null ? null : Number(row.wall_minutes),
    user_minutes:
      row.billable_minutes == null
        ? row.user_minutes == null
          ? null
          : Number(row.user_minutes)
        : Number(row.billable_minutes),
    billable_minutes:
      row.billable_minutes == null
        ? row.user_minutes == null
          ? null
          : Number(row.user_minutes)
        : Number(row.billable_minutes),
    against: row.against || "",
    via: row.via || "",
    timestamp: row.timestamp,
    task_id: row.task_id,
    stale_stop: Boolean(row.stale_stop),
    discarded: Boolean(row.discarded),
    needs_user: Boolean(row.needs_user),
    needs_external: Boolean(row.needs_external),
  };
}

function allIntervals(db, { includeDiscarded = false } = {}) {
  const sql = includeDiscarded
    ? "SELECT * FROM intervals"
    : "SELECT * FROM intervals WHERE discarded = 0";
  return db.prepare(sql).all().map(mapRow);
}

function getById(db, id) {
  return mapRow(db.prepare("SELECT * FROM intervals WHERE id = ?").get(id));
}

function runningRows(db) {
  return db
    .prepare("SELECT * FROM intervals WHERE status = 'running' AND discarded = 0")
    .all()
    .map(mapRow);
}

function clearFocus(db) {
  db.prepare("UPDATE intervals SET focused = 0 WHERE focused = 1").run();
}

function annotate(row, now) {
  const neverStarted = row.status === "running" && isNeverStarted(row.started, row.last_seen_at, now);
  const stale = row.status === "running" && isStaleRow(row, now);
  const liveWall = liveWallMinutes(row, now);
  const suggested = row.status === "running" ? suggestedUserMinutes(row) : row.user_minutes;
  return {
    ...row,
    neverStarted,
    stale,
    live_wall: formatHmm(liveWall),
    live_wall_minutes: liveWall,
    suggested_user: formatHmm(suggested || 0),
    suggested_user_minutes: suggested || 0,
    suggested_billable: formatHmm(suggested || 0),
    suggested_billable_minutes: suggested || 0,
  };
}

function externalIsInternal(row) {
  const ext = String(row.title_external || "").trim();
  const intern = String(row.title_internal || "").trim();
  const body = String(row.body_external || "").trim();
  if (!ext || !body) return true;
  return ext === intern;
}

function customerCopyReview(rows) {
  const intervalIds = rows.filter((row) => row.needs_external || externalIsInternal(row)).map((row) => row.id);
  if (!intervalIds.length) return null;
  return {
    kind: "customer-copy",
    interval_ids: intervalIds,
    questions: [
      {
        id: "customer-copy-action",
        prompt: "How should these time entries be prepared for the customer export?",
        options: [
          { id: "generate", label: "Generate and save copy (Recommended)" },
          { id: "review", label: "Show generated copy before saving" },
          { id: "custom", label: "Enter custom wording" },
        ],
        allow_multiple: false,
      },
    ],
  };
}

/**
 * @param {string} root
 * @param {{
 *   titleInternal?: string,
 *   titleExternal?: string,
 *   bodyInternal?: string,
 *   bodyExternal?: string,
 *   projectName?: string,
 *   against?: string,
 *   via?: string,
 *   taskId?: string,
 *   started?: string,
 *   forceNew?: boolean,
 *   now?: Date,
 * }} opts
 */
export function startInterval(root, opts) {
  const givenTitle = String(opts.titleInternal || "").trim();
  const titleInternal = givenTitle || DEFAULT_TITLE_INTERNAL;
  const proj = sanitizeProjectName(opts.projectName);
  if (!proj.ok) return proj;
  const now = opts.now ?? new Date();
  const started = opts.started || isoWithOffset(now);
  const startedMs = Date.parse(started);
  if (!Number.isFinite(startedMs)) {
    return { ok: false, error: { code: "usage", message: "--started must be ISO-8601" } };
  }
  if (startedMs > now.getTime() + 60000) {
    return { ok: false, error: { code: "usage", message: "--started cannot be in the future" } };
  }
  const file = timeDbPath(root);
  const opened = openTimeDb(file, { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    const result = withImmediateTxn(db, () => {
      if (opts.taskId && !opts.forceNew) {
        const existing = db.prepare("SELECT id FROM intervals WHERE task_id = ? LIMIT 1").get(opts.taskId);
        if (!existing) {
          throw Object.assign(new Error(`unknown --task ${opts.taskId}`), { code: "usage" });
        }
      }
      for (const prior of runningRows(db)) {
        if (!canContinueRunner(prior, now)) {
          applyStopRow(db, prior, { now, stoppedAt: prior.last_seen_at, userMinutes: null });
        }
      }
      const live = runningRows(db);
      const insert = () => {
        const taskId = opts.forceNew ? randomUUID() : opts.taskId || randomUUID();
        const id = randomUUID();
        const ts = isoWithOffset(now);
        clearFocus(db);
        db.prepare(
          `INSERT INTO intervals (
            id, type, status, title_internal, title_external, body_internal, body_external,
            project_name, started, stopped, last_seen_at, focused, against, via, timestamp,
            task_id, stale_stop, discarded, needs_user, needs_external
          ) VALUES (?, 'Time', 'running', ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, 0, 0, 0, 0)`,
        ).run(
          id,
          titleInternal,
          opts.titleExternal || "",
          opts.bodyInternal || "",
          opts.bodyExternal || "",
          proj.name,
          started,
          started,
          opts.against || "",
          opts.via || "",
          ts,
          taskId,
        );
        return { row: getById(db, id), ensured: false };
      };

      if (opts.forceNew) return insert();

      const focused = live.find((r) => r.focused) || null;
      let continuable = null;
      if (opts.taskId) {
        const onTask = live.filter((r) => r.task_id === opts.taskId);
        continuable =
          focused && focused.task_id === opts.taskId && canContinueRunner(focused, now)
            ? focused
            : onTask.find((r) => canContinueRunner(r, now)) || null;
      } else {
        continuable =
          focused && canContinueRunner(focused, now)
            ? focused
            : live.find((r) => canContinueRunner(r, now)) || null;
      }

      if (continuable) {
        for (const extra of live) {
          if (extra.id === continuable.id) continue;
          if (extra.task_id === continuable.task_id) {
            applyStopRow(db, extra, { now, stoppedAt: extra.last_seen_at, userMinutes: null });
          }
        }
        const ts = isoWithOffset(now);
        const nextTitle = givenTitle || continuable.title_internal;
        const nextExt =
          opts.titleExternal != null && String(opts.titleExternal).trim()
            ? String(opts.titleExternal).trim()
            : continuable.title_external;
        const nextBody = opts.bodyInternal != null ? String(opts.bodyInternal) : continuable.body_internal;
        const nextBodyExt =
          opts.bodyExternal != null && String(opts.bodyExternal).trim()
            ? String(opts.bodyExternal).trim()
            : continuable.body_external;
        clearFocus(db);
        db.prepare(
          `UPDATE intervals SET
             title_internal = ?, body_internal = ?, title_external = ?, body_external = ?,
             last_seen_at = ?, timestamp = ?, focused = 1
           WHERE id = ?`,
        ).run(nextTitle, nextBody || "", nextExt || "", nextBodyExt || "", ts, ts, continuable.id);
        return { row: getById(db, continuable.id), ensured: true };
      }

      return insert();
    });
    return { ok: true, data: { ...annotate(result.row, now), ensured: result.ensured } };
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: String(code), message } };
  } finally {
    db.close();
  }
}

/**
 * @param {string} root
 * @param {{ id: string, now?: Date }} opts
 */
export function focusInterval(root, { id, now = new Date() }) {
  if (!id) return { ok: false, error: { code: "usage", message: "mental track focus requires --id" } };
  const opened = openTimeDb(timeDbPath(root), { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    const row = withImmediateTxn(db, () => {
      const cur = getById(db, id);
      if (!cur || cur.discarded) throw Object.assign(new Error(`no interval ${id}`), { code: "usage" });
      if (cur.status !== "running") throw Object.assign(new Error("focus requires a running interval"), { code: "usage" });
      clearFocus(db);
      const ts = isoWithOffset(now);
      db.prepare("UPDATE intervals SET focused = 1, last_seen_at = ?, timestamp = ? WHERE id = ?").run(ts, ts, id);
      return getById(db, id);
    });
    return { ok: true, data: annotate(row, now) };
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: String(code), message } };
  } finally {
    db.close();
  }
}

function applyStopRow(
  db,
  row,
  {
    now,
    stoppedAt,
    userMinutes,
    acceptStale: _acceptStale,
    titleInternal,
    bodyInternal,
    titleExternal,
    bodyExternal,
    projectName,
  },
) {
  let stopped = isoWithOffset(now);
  if (stoppedAt) {
    const ms = Date.parse(String(stoppedAt));
    if (Number.isFinite(ms)) stopped = String(stoppedAt);
  }
  const wallMin = elapsedMinutes(row.started, stopped);
  const stale = isStaleRow(row, now);
  let userMin = wallMin;
  const needsUser = 0;
  const staleStop = stale ? 1 : 0;
  if (userMinutes != null) {
    if (userMinutes > wallMin) {
      throw Object.assign(new Error("billable must be <= wall"), { code: "usage" });
    }
    userMin = userMinutes;
  }
  const ext = titleExternal != null ? String(titleExternal) : row.title_external;
  const bodyExt = bodyExternal != null ? String(bodyExternal) : row.body_external;
  const intern = titleInternal != null && String(titleInternal).trim() ? String(titleInternal).trim() : row.title_internal;
  const bodyIntern = bodyInternal != null ? String(bodyInternal) : row.body_internal;
  let needsExternal = row.needs_external ? 1 : 0;
  if (!String(ext || "").trim() || !String(bodyExt || "").trim() || String(ext).trim() === intern.trim()) needsExternal = 1;
  else needsExternal = 0;
  const proj = projectName != null ? projectName : row.project_name;
  const ts = isoWithOffset(now);
  db.prepare(
    `UPDATE intervals SET
      status = 'stopped', stopped = ?, focused = 0,
      title_internal = ?, body_internal = ?,
      wall = ?, wall_minutes = ?, "user" = ?, user_minutes = ?,
      billable = ?, billable_minutes = ?,
      stale_stop = ?, needs_user = ?, needs_external = ?,
      title_external = ?, body_external = ?, project_name = ?, timestamp = ?
     WHERE id = ?`,
  ).run(
    stopped,
    intern,
    bodyIntern || "",
    formatHmm(wallMin),
    wallMin,
    userMin == null ? null : formatHmm(userMin),
    userMin,
    userMin == null ? null : formatHmm(userMin),
    userMin,
    staleStop,
    needsUser,
    needsExternal,
    ext || "",
    bodyExt || "",
    proj || "",
    ts,
    row.id,
  );
  return getById(db, row.id);
}

/**
 * @param {string} root
 * @param {{
 *   id?: string,
 *   all?: boolean,
 *   userHmm?: string,
 *   acceptStale?: boolean,
 *   json?: boolean,
 *   titleInternal?: string,
 *   bodyInternal?: string,
 *   titleExternal?: string,
 *   bodyExternal?: string,
 *   projectName?: string,
 *   now?: Date,
 * }} opts
 */
export function stopIntervals(root, opts = {}) {
  const now = opts.now ?? new Date();
  let userMinutes = null;
  if (opts.userHmm != null && opts.userHmm !== "") {
    userMinutes = parseHmm(opts.userHmm);
    if (userMinutes == null) {
      return { ok: false, error: { code: "usage", message: "--billable must be h:mm (minutes 00–59)" } };
    }
  }
  if (opts.acceptStale && opts.json) {
    return { ok: false, error: { code: "usage", message: "--accept-stale is TTY-only" } };
  }
  const opened = openTimeDb(timeDbPath(root), { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    const stopped = withImmediateTxn(db, () => {
      /** @type {ReturnType<typeof mapRow>[]} */
      let targets = [];
      if (opts.all) {
        targets = db.prepare("SELECT * FROM intervals WHERE status = 'running' AND discarded = 0").all().map(mapRow);
      } else if (opts.id) {
        const row = getById(db, opts.id);
        if (!row || row.discarded) throw Object.assign(new Error(`no interval ${opts.id}`), { code: "usage" });
        if (row.status !== "running") throw Object.assign(new Error("interval is not running"), { code: "usage" });
        targets = [row];
      } else {
        const focused = mapRow(db.prepare("SELECT * FROM intervals WHERE focused = 1 AND discarded = 0").get());
        if (!focused || focused.status !== "running") {
          throw Object.assign(
            new Error("stop without --id hits the focused interval only; none is focused. Pass --id or --all."),
            { code: "usage" },
          );
        }
        targets = [focused];
      }
      const proj = opts.projectName != null ? sanitizeProjectName(opts.projectName) : { ok: true, name: undefined };
      if (!proj.ok) throw Object.assign(new Error(proj.error.message), { code: "usage" });
      return targets.map((row) =>
        annotate(
          applyStopRow(db, row, {
            now,
            userMinutes,
            acceptStale: Boolean(opts.acceptStale),
            titleInternal: opts.titleInternal,
            bodyInternal: opts.bodyInternal,
            titleExternal: opts.titleExternal,
            bodyExternal: opts.bodyExternal,
            projectName: proj.name,
          }),
          now,
        ),
      );
    });
    const review = customerCopyReview(stopped);
    return { ok: true, data: { stopped, ...(review ? { review } : {}) } };
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: String(code), message } };
  } finally {
    db.close();
  }
}

/**
 * Park/handoff: stop focused only. Fail closed for hours (no ok if txn rolls back).
 * Caller still journals if this fails (fail open for coding).
 * @param {string} root
 * @param {{
 *   now?: Date,
 *   titleInternal?: string,
 *   bodyInternal?: string,
 *   titleExternal?: string,
 *   bodyExternal?: string,
 *   projectName?: string,
 *   billableHmm?: string,
 * }} [opts]
 */
export function stopFocusedForPark(root, opts = {}) {
  const now = opts.now ?? new Date();
  const project = opts.projectName != null ? sanitizeProjectName(opts.projectName) : { ok: true, name: undefined };
  if (!project.ok) return project;
  let billableMinutes = null;
  if (opts.billableHmm != null && opts.billableHmm !== "") {
    billableMinutes = parseHmm(opts.billableHmm);
    if (billableMinutes == null) {
      return { ok: false, error: { code: "usage", message: "--billable must be h:mm (minutes 00–59)" } };
    }
  }
  if (!existsSync(timeDbPath(root))) return { ok: true, skipped: true };
  const opened = openTimeDb(timeDbPath(root), { write: true });
  if (!opened.ok) return { ok: false, error: opened.error };
  const { db } = opened;
  try {
    const row = withImmediateTxn(db, () => {
      const focused = mapRow(
        db.prepare("SELECT * FROM intervals WHERE focused = 1 AND discarded = 0 AND status = 'running'").get(),
      );
      if (!focused) return null;
      return applyStopRow(db, focused, {
        now,
        userMinutes: billableMinutes,
        acceptStale: false,
        titleInternal: opts.titleInternal,
        bodyInternal: opts.bodyInternal,
        titleExternal: opts.titleExternal,
        bodyExternal: opts.bodyExternal,
        projectName: project.name,
      });
    });
    const data = row ? annotate(row, now) : null;
    const review = data ? customerCopyReview([data]) : null;
    return { ok: true, skipped: !row, data, ...(review ? { review } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "timer_stop_failed", message } };
  } finally {
    db.close();
  }
}

/**
 * @param {string} root
 * @param {{ id?: string, now?: Date }} opts
 */
export function discardInterval(root, { id, now = new Date() } = {}) {
  const opened = openTimeDb(timeDbPath(root), { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    const row = withImmediateTxn(db, () => {
      let target;
      if (id) target = getById(db, id);
      else {
        target = mapRow(db.prepare("SELECT * FROM intervals WHERE focused = 1 AND discarded = 0").get());
      }
      if (!target || target.discarded) throw Object.assign(new Error("no interval to discard"), { code: "usage" });
      const ts = isoWithOffset(now);
      db.prepare(
        `UPDATE intervals SET discarded = 1, status = 'stopped', focused = 0,
          wall = '0:00', wall_minutes = 0, "user" = '0:00', user_minutes = 0,
          billable = '0:00', billable_minutes = 0,
          stopped = ?, timestamp = ? WHERE id = ?`,
      ).run(ts, ts, target.id);
      return getById(db, target.id);
    });
    return { ok: true, data: row };
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: String(code), message } };
  } finally {
    db.close();
  }
}

/**
 * @param {string} root
 * @param {{ id: string, titleInternal?: string, bodyInternal?: string, titleExternal?: string, bodyExternal?: string, userHmm?: string, projectName?: string, now?: Date }} opts
 */
export function amendInterval(root, opts) {
  if (!opts.id) return { ok: false, error: { code: "usage", message: "mental track amend requires --id" } };
  const opened = openTimeDb(timeDbPath(root), { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  const now = opts.now ?? new Date();
  try {
    const row = withImmediateTxn(db, () => {
      const cur = getById(db, opts.id);
      if (!cur || cur.discarded) throw Object.assign(new Error(`no interval ${opts.id}`), { code: "usage" });
      let userMin = cur.user_minutes;
      let userHmm = cur.user;
      if (opts.userHmm != null) {
        userMin = parseHmm(opts.userHmm);
        if (userMin == null) throw Object.assign(new Error("--billable must be h:mm"), { code: "usage" });
        const wall = cur.wall_minutes ?? 0;
        if (userMin > wall) throw Object.assign(new Error("billable must be <= wall"), { code: "usage" });
        userHmm = formatHmm(userMin);
      }
      const proj = opts.projectName != null ? sanitizeProjectName(opts.projectName) : { ok: true, name: cur.project_name };
      if (!proj.ok) throw Object.assign(new Error(proj.error.message), { code: "usage" });
      const ext = opts.titleExternal != null ? opts.titleExternal : cur.title_external;
      const bodyExt = opts.bodyExternal != null ? opts.bodyExternal : cur.body_external;
      const intern =
        opts.titleInternal != null && String(opts.titleInternal).trim()
          ? String(opts.titleInternal).trim()
          : cur.title_internal;
      const bodyIntern = opts.bodyInternal != null ? opts.bodyInternal : cur.body_internal;
      const needsExternal =
        !String(ext || "").trim() || !String(bodyExt || "").trim() || String(ext).trim() === intern.trim() ? 1 : 0;
      const ts = isoWithOffset(now);
      db.prepare(
        `UPDATE intervals SET title_internal = ?, body_internal = ?,
          title_external = ?, body_external = ?, project_name = ?,
          "user" = ?, user_minutes = ?, billable = ?, billable_minutes = ?,
          needs_user = ?, needs_external = ?, timestamp = ?
         WHERE id = ?`,
      ).run(
        intern,
        bodyIntern || "",
        ext || "",
        bodyExt || "",
        proj.name || "",
        userHmm,
        userMin,
        userHmm,
        userMin,
        userMin == null ? 1 : 0,
        needsExternal,
        ts,
        cur.id,
      );
      return getById(db, cur.id);
    });
    const data = annotate(row, now);
    const review = customerCopyReview([data]);
    return { ok: true, data: { ...data, ...(review ? { review } : {}) } };
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: String(code), message } };
  } finally {
    db.close();
  }
}

/**
 * Heartbeat last_seen ping — focused running row only. Glance must not call this.
 * @param {string} root
 * @param {{ now?: Date }} [opts]
 */
export function pingFocusedLastSeen(root, { now = new Date() } = {}) {
  const file = timeDbPath(root);
  if (!existsSync(file)) return { ok: true, skipped: true };
  const opened = openTimeDb(file, { write: true });
  if (!opened.ok) return opened;
  const { db } = opened;
  try {
    withImmediateTxn(db, () => {
      const focused = mapRow(
        db.prepare("SELECT * FROM intervals WHERE focused = 1 AND status = 'running' AND discarded = 0").get(),
      );
      if (!focused || !canContinueRunner(focused, now)) return;
      const ts = isoWithOffset(now);
      db.prepare("UPDATE intervals SET last_seen_at = ?, timestamp = ? WHERE id = ?").run(ts, ts, focused.id);
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "busy", message } };
  } finally {
    db.close();
  }
}

function trackUnclocked({ hopsToday, hopToday, runningCount, stoppedToday }) {
  return Boolean((hopsToday > 0 || hopToday) && runningCount === 0 && stoppedToday === 0);
}

/**
 * Compact heartbeat sibling. No titles, bodies, or hours. `unclocked` is a gap flag only.
 * @param {string} root
 * @param {{ now?: Date, pingFocused?: boolean, hopsToday?: number, hopToday?: boolean }} [opts]
 */
export function heartbeatTrack(root, { now = new Date(), pingFocused = true, hopsToday = 0, hopToday = false } = {}) {
  const empty = {
    enabled: true,
    runningCount: 0,
    staleCount: 0,
    focusedId: null,
    running: [],
    unclocked: trackUnclocked({ hopsToday, hopToday, runningCount: 0, stoppedToday: 0 }),
  };
  const file = timeDbPath(root);
  if (!existsSync(file)) {
    return { ok: true, data: empty };
  }
  if (pingFocused) {
    const ping = pingFocusedLastSeen(root, { now });
    if (!ping.ok && ping.error?.code === "busy") {
      return { ok: true, data: { enabled: true, error: "busy", unclocked: false } };
    }
  }
  const opened = openTimeDb(file, { write: false });
  if (!opened.ok) {
    if (opened.error?.code === "missing") {
      return { ok: true, data: empty };
    }
    return { ok: true, data: { enabled: true, error: opened.error?.code || "busy", unclocked: false } };
  }
  const { db } = opened;
  try {
    const rows = db
      .prepare("SELECT id, started, last_seen_at, focused, status FROM intervals WHERE status = 'running' AND discarded = 0")
      .all();
    const runningCount = rows.length;
    const today = calendarDateFromIso(isoWithOffset(now));
    const stoppedToday = db
      .prepare("SELECT started, stopped FROM intervals WHERE status = 'stopped' AND discarded = 0")
      .all()
      .filter((r) => calendarDateFromIso(r.stopped || r.started) === today).length;
    const annotated = rows.map((r) => {
      const never = isNeverStarted(r.started, r.last_seen_at, now);
      const stale = never || isStaleRow(r, now);
      return { id: r.id, started: r.started, stale, focused: Boolean(r.focused), never };
    });
    annotated.sort((a, b) => Number(b.stale) - Number(a.stale));
    const staleCount = annotated.filter((r) => r.stale).length;
    const focused = annotated.find((r) => r.focused);
    const running = annotated.slice(0, HEARTBEAT_RUNNING_CAP).map(({ id, started, stale }) => ({ id, started, stale }));
    return {
      ok: true,
      data: {
        enabled: true,
        runningCount,
        staleCount,
        focusedId: focused?.id ?? null,
        running,
        unclocked: trackUnclocked({ hopsToday, hopToday, runningCount, stoppedToday }),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: true, data: { enabled: true, error: message, unclocked: false } };
  } finally {
    db.close();
  }
}

/**
 * @param {string} root
 */
export function runningCount(root) {
  const file = timeDbPath(root);
  if (!existsSync(file)) return 0;
  const opened = openTimeDb(file, { write: false });
  if (!opened.ok) return 0;
  try {
    const row = opened.db.prepare("SELECT COUNT(*) AS n FROM intervals WHERE status = 'running' AND discarded = 0").get();
    return Number(row?.n || 0);
  } catch {
    return 0;
  } finally {
    opened.db.close();
  }
}

function inDateRange(iso, since, until) {
  const d = calendarDateFromIso(iso);
  if (!d) return false;
  if (since && d < since) return false;
  if (until && d > until) return false;
  return true;
}

function intervalEndMs(row, now) {
  if (row.stopped) {
    const t = Date.parse(row.stopped);
    return Number.isFinite(t) ? t : 0;
  }
  if (row.status === "running") return now.getTime();
  const t = Date.parse(row.started);
  return Number.isFinite(t) ? t : 0;
}

function overlappingPairs(rows, now = new Date()) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const a0 = Date.parse(a.started);
      const a1 = intervalEndMs(a, now);
      const b0 = Date.parse(b.started);
      const b1 = intervalEndMs(b, now);
      if (!Number.isFinite(a0) || !Number.isFinite(b0)) continue;
      if (a0 < b1 && b0 < a1) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/**
 * Glance: running (stale / never-started first) grouped by task. Not a focus ping.
 * @param {string} root
 * @param {{ now?: Date, since?: string, until?: string }} [opts]
 */
export function glanceTime(root, { now = new Date(), since, until } = {}) {
  const file = timeDbPath(root);
  if (!existsSync(file)) {
    return { ok: true, data: { tasks: [], running: [], stoppedToday: [], overlap: [] } };
  }
  const opened = openTimeDb(file, { write: false });
  if (!opened.ok) return opened;
  try {
    const today = calendarDateFromIso(isoWithOffset(now));
    const rows = allIntervals(opened.db).map((r) => annotate(r, now));
    const running = rows
      .filter((r) => r.status === "running")
      .sort((a, b) => Number(b.neverStarted) - Number(a.neverStarted) || Number(b.stale) - Number(a.stale));
    const stoppedToday = rows.filter((r) => r.status === "stopped" && calendarDateFromIso(r.stopped || r.started) === today);
    const ranged = rows.filter((r) => {
      if (!since && !until) return true;
      return inDateRange(r.started, since, until);
    });
    /** @type {Map<string, typeof rows>} */
    const byTask = new Map();
    for (const r of running.length ? running : ranged) {
      const list = byTask.get(r.task_id) || [];
      list.push(r);
      byTask.set(r.task_id, list);
    }
    // Always group running by task; also include today's stopped on those tasks.
    const taskIds = new Set(running.map((r) => r.task_id));
    for (const r of stoppedToday) {
      if (!taskIds.has(r.task_id) && running.length) continue;
      const list = byTask.get(r.task_id) || [];
      if (!list.some((x) => x.id === r.id)) list.push(r);
      byTask.set(r.task_id, list);
    }
    const tasks = [...byTask.entries()].map(([task_id, intervals]) => {
      const wallMin = intervals.reduce((s, i) => s + (i.status === "running" ? i.live_wall_minutes : i.wall_minutes || 0), 0);
      const userMin = intervals.reduce((s, i) => {
        if (i.status === "running") return s + (i.live_wall_minutes || 0);
        return s + (i.user_minutes || 0);
      }, 0);
      const title = intervals[0]?.title_internal || "";
      return {
        task_id,
        title_internal: title,
        wall: formatHmm(wallMin),
        user: formatHmm(userMin),
        billable: formatHmm(userMin),
        intervals,
      };
    });
    return {
      ok: true,
      data: {
        tasks,
        running,
        stoppedToday,
        overlap: overlappingPairs(running, now).filter(([idA, idB]) => {
          const a = running.find((r) => r.id === idA);
          const b = running.find((r) => r.id === idB);
          return Boolean(a && b && a.task_id === b.task_id);
        }),
      },
    };
  } finally {
    opened.db.close();
  }
}

/**
 * @param {string} root
 * @param {{ since?: string, until?: string, external?: boolean, project?: string, now?: Date, bundleId?: string, gitRoot?: string | null, env?: NodeJS.ProcessEnv }} [opts]
 */
export function reportTime(root, opts = {}) {
  const now = opts.now ?? new Date();
  const file = timeDbPath(root);
  const clockedDays = new Set();
  const emptyUnclocked = () => {
    const commitDays = commitShortDates(opts.gitRoot || null, {
      since: opts.since,
      until: opts.until,
      env: opts.env,
    });
    return commitDays.filter((d) => !clockedDays.has(d));
  };
  if (!existsSync(file)) {
    return {
      ok: true,
      data: {
        rows: [],
        wall: "0:00",
        user: "0:00",
        billable: "0:00",
        overlap: [],
        skippedNeedsExternal: 0,
        unclockedCommitDays: emptyUnclocked(),
      },
    };
  }
  const opened = openTimeDb(file, { write: false });
  if (!opened.ok) return opened;
  try {
    const all = allIntervals(opened.db);
    for (const r of all) {
      const d = calendarDateFromIso(r.started);
      if (d) clockedDays.add(d);
    }
    let rows = all
      .filter((r) => r.status === "stopped")
      .filter((r) => inDateRange(r.started, opts.since, opts.until) || (!opts.since && !opts.until));
    if (opts.project) {
      rows = rows.filter((r) => r.project_name === opts.project);
    }
    let skippedNeedsExternal = 0;
    let review = null;
    if (opts.external) {
      const kept = [];
      const missing = [];
      for (const r of rows) {
        if (r.needs_external || externalIsInternal(r)) {
          skippedNeedsExternal += 1;
          missing.push(r);
          continue;
        }
        kept.push(r);
      }
      rows = kept;
      review = customerCopyReview(missing);
    }
    const wallMin = rows.reduce((s, r) => s + (r.wall_minutes || 0), 0);
    const userMin = rows.reduce((s, r) => s + (r.user_minutes || 0), 0);
    const overlap = overlappingPairs(rows, now);
    return {
      ok: true,
      data: {
        bundleId: opts.bundleId || null,
        rows,
        wall: formatHmm(wallMin),
        user: formatHmm(userMin),
        billable: formatHmm(userMin),
        wall_minutes: wallMin,
        user_minutes: userMin,
        billable_minutes: userMin,
        overlap,
        skippedNeedsExternal,
        ...(review ? { review } : {}),
        unclockedCommitDays: emptyUnclocked(),
      },
    };
  } finally {
    opened.db.close();
  }
}

const EXTERNAL_COLS = [
  "date",
  "title_external",
  "body_external",
  "project_name",
  "started",
  "stopped",
  "wall",
  "billable",
];
const INTERNAL_COLS = [
  "id",
  "task_id",
  "title_internal",
  "body_internal",
  "project_name",
  "started",
  "stopped",
  "wall",
  "billable",
  "against",
  "via",
  "stale_stop",
  "needs_external",
];

function rowCells(row, cols) {
  return cols.map((c) => {
    if (c === "stale_stop" || c === "needs_external") return row[c] ? "1" : "0";
    return row[c] ?? "";
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} cols
 */
export function toCsv(rows, cols) {
  const header = cols.map(csvEscape).join(",");
  const body = rows.map((r) => rowCells(r, cols).map(csvEscape).join(",")).join("\n");
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

function toMd(rows, cols, banner) {
  const lines = banner ? [`## ${banner}`, ""] : [];
  lines.push(`| ${cols.join(" | ")} |`);
  lines.push(`| ${cols.map(() => "---").join(" | ")} |`);
  for (const r of rows) {
    lines.push(`| ${rowCells(r, cols).map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string} out
 * @param {{ cwd: string, gitRoot?: string | null }} ctx
 */
export function assertExportOutPath(out, { cwd, gitRoot }) {
  if (!out || typeof out !== "string" || !out.trim()) {
    return {
      ok: false,
      error: { code: "usage", message: "mental track export requires --out <path> outside the git worktree" },
    };
  }
  const abs = canonicalPath(resolve(cwd, out));
  const parts = abs.split(/[/\\]/);
  if (parts.includes(".git")) {
    return { ok: false, error: { code: "usage", message: "--out must not write into .git" } };
  }
  if (gitRoot) {
    if (isInsideDir(canonicalPath(gitRoot), abs)) {
      return {
        ok: false,
        error: { code: "usage", message: "--out must be outside the git worktree (hours must never land in git)" },
      };
    }
  }
  return { ok: true, abs };
}

/**
 * @param {{ rows: object[], external?: boolean, format?: string, banner?: string }} opts
 */
export function renderExport({ rows, external = false, format = "csv", banner }) {
  const cols = external ? EXTERNAL_COLS : INTERNAL_COLS;
  if (format === "md") return toMd(rows, cols, banner);
  return toCsv(rows, cols);
}

/**
 * Orphan home slices that still have hours after remap.
 * @param {string} projectsDir
 * @param {Set<string>} liveIds
 */
export function listOrphanTimeDbs(projectsDir, liveIds) {
  if (!existsSync(projectsDir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(projectsDir)) {
    if (liveIds.has(name)) continue;
    const file = join(projectsDir, name, TIME_DB);
    if (existsSync(file)) out.push(file);
  }
  return out;
}
