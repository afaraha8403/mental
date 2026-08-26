/**
 * TTY no-args surface: print where you left off, then exit.
 * Not a standing session. UUID / root / index live on `where` and `doctor`.
 */
import { resolveBundle } from "./resolve.mjs";
import { gitSnapshot } from "./git.mjs";
import {
  ATTENTION_HEARTBEAT_CAP,
  latestJournalHandoff,
  listOpenAttention,
  listOpenDecisions,
  localDate,
} from "./okf.mjs";
import { brandMark } from "./output.mjs";

export { ATTENTION_HEARTBEAT_CAP };

/**
 * Home mode without a UUID is `~/.mental/projects` (parent), not a bundle.
 * @param {{ id?: string | null, mode?: string }} where
 */
export function isBundleRoot(where) {
  if (where.mode === "env" || where.mode === "local" || where.mode === "personal") return true;
  return Boolean(where.id);
}

/**
 * @param {{ date: string, time?: string | null }} when
 * @param {Date} [now]
 */
export function formatWhen(when, now = new Date()) {
  if (!when?.date) return null;
  const today = localDate(now);
  if (when.date === today) return when.time || "today";
  const [y, m, d] = when.date.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((start.getTime() - then.getTime()) / 86400000);
  if (days === 1) return "yesterday";
  if (days > 1 && days < 14) return `${days}d ago`;
  return when.date;
}

/**
 * @param {object} args
 */
export function collectHeartbeat(args) {
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const where = resolved.data;
  const git = gitSnapshot(where.gitRoot, { env: args.env ?? process.env });
  const root = isBundleRoot(where) ? where.root : null;
  const handoff = root
    ? latestJournalHandoff(root)
    : { resume: null, outcome: null, file: null, when: null, against: null };
  const openDecisions = root ? listOpenDecisions(root) : [];
  const attention = root ? listOpenAttention(root) : [];

  return {
    ok: true,
    data: {
      git,
      gitRoot: where.gitRoot,
      handoff,
      against: handoff.against ?? null,
      attention,
      openDecisions,
    },
  };
}

function formatAirItem(a) {
  const tag = a.status === "later" ? "later" : a.kind || a.status || "open";
  return `  [${tag}] ${a.title}`;
}

/**
 * @param {Extract<ReturnType<typeof collectHeartbeat>, { ok: true }>["data"]} data
 * @param {Date} [now]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function formatHeartbeat(data, now = new Date(), env = process.env) {
  const resume =
    data.handoff.resume ||
    "No journal yet — start work, then `mental journal` at the task boundary.";
  const outcome = data.handoff.outcome || "—";
  const stale = data.handoff.when ? formatWhen(data.handoff.when, now) : null;
  const nowLine = stale ? `${outcome}  (${stale})` : outcome;
  const gitLine = data.gitRoot
    ? `${data.git.branch || "(unknown)"} ${data.git.dirty ? "(dirty)" : "(clean)"}`
    : "not a git repo";
  const recent = data.git.recent?.[0] ? `\n        ${data.git.recent[0]}` : "";
  const against = data.against || data.handoff?.against;
  const attention = data.attention ?? [];
  const shown = attention.slice(0, ATTENTION_HEARTBEAT_CAP);
  const extra =
    attention.length > ATTENTION_HEARTBEAT_CAP
      ? `\n  (+${attention.length - ATTENTION_HEARTBEAT_CAP} more)`
      : "";
  const air =
    attention.length === 0 ? "  none" : shown.map(formatAirItem).join("\n") + extra;
  const open =
    (data.openDecisions ?? []).length === 0
      ? "  none"
      : data.openDecisions.map((d) => `  [${d.status}] ${d.title}`).join("\n");

  const lines = [`${brandMark(env)} ${resume}`];
  if (against) lines.push(`Against ${against}`);
  lines.push("", `Now     ${nowLine}`, `Git     ${gitLine}${recent}`, "In the air", air, "Unsettled", open);
  return lines.join("\n");
}
