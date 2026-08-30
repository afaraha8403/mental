/**
 * TTY no-args surface: print where you left off, then exit.
 * Not a standing session. UUID / root / index live on `where` and `doctor`.
 */
import { resolveBundle } from "./resolve.mjs";
import { gitSnapshot } from "./git.mjs";
import {
  ATTENTION_HEARTBEAT_CAP,
  DECISION_HEARTBEAT_CAP,
  capHeartbeatAttention,
  latestJournalHandoff,
  listDecidedGuardrails,
  listOpenAttention,
  listOpenDecisions,
  localDate,
} from "./okf.mjs";
import { brandMark } from "./output.mjs";
import { heartbeatDelta, countParkHopsSinceMs, localDayStartMs } from "./delta.mjs";
import { readWatermark } from "./watermark.mjs";
import { isFeatureOn } from "./config.mjs";
import { heartbeatTrack } from "./time.mjs";

export { ATTENTION_HEARTBEAT_CAP, DECISION_HEARTBEAT_CAP };

/** JSON keys agents may pass to `--fields`. */
export const HEARTBEAT_JSON_FIELDS = [
  "id",
  "mode",
  "git",
  "gitRoot",
  "handoff",
  "against",
  "attention",
  "openDecisions",
  "attentionCount",
  "openDecisionCount",
  "needsEyes",
  "needsEyesCount",
  "later",
  "laterCount",
  "guardrails",
  "guardrailCount",
  "hopsToday",
  "delta",
  "track",
];

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
    : { resume: null, outcome: null, file: null, when: null, against: null, via: null };
  const openDecisions = root ? listOpenDecisions(root) : [];
  const attentionAll = root ? listOpenAttention(root) : [];
  const attention = capHeartbeatAttention(attentionAll);
  const needsEyesAll = attentionAll.filter((a) => a.kind === "verify");
  const laterAll = attentionAll.filter((a) => a.status === "later");
  const guardrailsAll = root ? listDecidedGuardrails(root) : [];
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const wm = where.id && home ? readWatermark(home, where.id, env) : null;
  const delta = heartbeatDelta(root, wm?.at ?? null);
  const hopsToday = root ? countParkHopsSinceMs(root, localDayStartMs()) : 0;

  /** @type {Record<string, unknown>} */
  const data = {
    id: where.id ?? null,
    mode: where.mode,
    git,
    gitRoot: where.gitRoot,
    handoff,
    against: handoff.against ?? null,
    attention,
    openDecisions: openDecisions.slice(0, DECISION_HEARTBEAT_CAP),
    attentionCount: attentionAll.length,
    openDecisionCount: openDecisions.length,
    needsEyes: attention.filter((a) => a.kind === "verify"),
    needsEyesCount: needsEyesAll.length,
    later: attention.filter((a) => a.status === "later"),
    laterCount: laterAll.length,
    guardrails: guardrailsAll.slice(0, DECISION_HEARTBEAT_CAP),
    guardrailCount: guardrailsAll.length,
    hopsToday,
    delta,
  };

  if (root && home && isBundleRoot(where) && isFeatureOn(home, "track", where.id || null)) {
    const track = heartbeatTrack(root, { pingFocused: true });
    if (track.ok) data.track = track.data;
  }

  return { ok: true, data };
}

function formatAirItem(a) {
  const tag = a.kind || a.status || "open";
  return `  [${tag}] ${a.title}`;
}

function extraLine(shown, total) {
  if (total <= shown) return "";
  return `\n  (+${total - shown} more)`;
}

/**
 * @param {Extract<ReturnType<typeof collectHeartbeat>, { ok: true }>["data"]} data
 * @param {Date} [now]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ plain?: boolean, flags?: Record<string, string | boolean> }} [args]
 */
export function formatHeartbeat(data, now = new Date(), env = process.env, args = {}) {
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
  const attentionTotal = data.attentionCount ?? attention.length;
  const shown = attention.slice(0, ATTENTION_HEARTBEAT_CAP);
  const eyes = shown.filter((a) => a.kind === "verify");
  const laterShown = shown.filter((a) => a.status === "later" && a.kind !== "verify");
  const rest = shown.filter((a) => a.kind !== "verify" && a.status !== "later");
  const eyesTotal = data.needsEyesCount ?? eyes.length;
  const laterTotal = data.laterCount ?? laterShown.length;
  const extraEyes =
    eyes.length && rest.length === 0 && laterShown.length === 0 ? extraLine(eyes.length, attentionTotal) : "";
  const extraLater = !rest.length && laterShown.length ? extraLine(shown.length, attentionTotal) : "";
  const extraAir =
    rest.length || (eyes.length === 0 && laterShown.length === 0)
      ? extraLine(shown.length, attentionTotal)
      : "";
  const eyesBlock =
    eyesTotal > 0
      ? ["Needs eyes", eyes.length === 0 ? "  none" : eyes.map(formatAirItem).join("\n") + extraEyes]
      : [];
  const laterBlock =
    laterTotal > 0
      ? [
          "Later",
          laterShown.length === 0
            ? "  none"
            : laterShown.map(formatAirItem).join("\n") + extraLater,
        ]
      : [];
  const air = attentionTotal === 0 ? "  none" : rest.map(formatAirItem).join("\n") + extraAir || "  none";
  const decisions = data.openDecisions ?? [];
  const decisionTotal = data.openDecisionCount ?? decisions.length;
  const shownDecisions = decisions.slice(0, DECISION_HEARTBEAT_CAP);
  const extraDec = extraLine(shownDecisions.length, decisionTotal);
  const open =
    decisionTotal === 0
      ? "  none"
      : shownDecisions.map((d) => `  [${d.status}] ${d.title}`).join("\n") + extraDec;
  const guardrails = data.guardrails ?? [];
  const guardTotal = data.guardrailCount ?? guardrails.length;
  const shownGuard = guardrails.slice(0, DECISION_HEARTBEAT_CAP);
  const settled =
    guardTotal === 0
      ? []
      : ["Settled", shownGuard.map((g) => `  ${g.title}`).join("\n") + extraLine(shownGuard.length, guardTotal)];
  const parks = data.hopsToday ?? data.delta?.parks ?? 0;

  const lines = [`${brandMark(env, args)} ${resume}`];
  if (against) lines.push(`Against ${against}`);
  lines.push("", `Now     ${nowLine}`, `Git     ${gitLine}${recent}`, `Hops    ${parks}`, ...eyesBlock, "In the air", air, ...laterBlock, "Unsettled", open, ...settled);
  return lines.join("\n");
}
