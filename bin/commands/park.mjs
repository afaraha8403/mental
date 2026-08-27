/**
 * `mental park` — encode at an interruption, not only a planned handoff.
 * Requires --resume. Default journal title "Parked". Optional --attention + --kind.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import {
  ATTENTION_KINDS,
  appendJournal,
  bundleName,
  ensureSkeleton,
  findAttention,
  repoRelativePath,
  updateAttention,
  writeAttention,
} from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { collectHeartbeat, formatHeartbeat } from "../lib/heartbeat.mjs";
import { writeWatermark } from "../lib/watermark.mjs";
import { printResult, kindLine } from "../lib/output.mjs";
import { VIA_USAGE, viaFromFlags } from "../lib/via.mjs";

function flagString(flags, key) {
  return typeof flags?.[key] === "string" ? flags[key] : null;
}

/**
 * Same title identity as `mental attention`: update if a file exists, else create.
 * Same-day retry must not throw after the journal is already appended.
 */
function upsertParkAttention(root, { title, kind, from, against, via }) {
  const existing = findAttention(root, { title });
  if (existing) {
    return updateAttention(root, existing.path, { kind, from, against, via });
  }
  try {
    return writeAttention(root, { title, kind, from, against, via });
  } catch (err) {
    if (/** @type {{ code?: string }} */ (err).code === "exists") {
      const raced = findAttention(root, { title });
      if (raced) return updateAttention(root, raced.path, { kind, from, against, via });
    }
    throw err;
  }
}

/**
 * @param {{ json: boolean, dir?: string, flags?: Record<string, string | boolean>, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdPark(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const resume = flagString(args.flags, "resume");
  if (!resume) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental park requires --resume",
    });
    return 1;
  }

  const attentionTitle = flagString(args.flags, "attention");
  const kind = flagString(args.flags, "kind");
  if (attentionTitle && !kind) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental park --attention requires --kind",
    });
    return 1;
  }
  if (kind && !ATTENTION_KINDS.has(kind)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `kind must be ${[...ATTENTION_KINDS].join("|")}`,
    });
    return 1;
  }

  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE });
    return 1;
  }

  const againstRaw = flagString(args.flags, "against");
  const against = againstRaw != null ? repoRelativePath(againstRaw) : undefined;
  if (againstRaw != null && against === null) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "--against must be a repo-relative path (no ..)",
    });
    return 1;
  }

  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: true,
  });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }

  const title = flagString(args.flags, "title") || "Parked";
  const body = flagString(args.flags, "body") || "";
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });
  const written = appendJournal(resolved.data.root, { title, body, resume, against, via: viaParsed.via, hop: true });

  /** @type {{ path: string, updated: boolean } | null} */
  let attention = null;
  if (attentionTitle && kind) {
    try {
      attention = upsertParkAttention(resolved.data.root, {
        title: attentionTitle,
        kind,
        from: flagString(args.flags, "from") || undefined,
        against,
        via: viaParsed.via,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = /** @type {{ code?: string }} */ (err).code || "write";
      printResult(stdout, args, false, undefined, { code, message });
      return 1;
    }
  }

  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  refreshIndex(resolved.data, home, env);

  const collected = collectHeartbeat(args);
  const heartbeat = collected.ok ? collected.data : null;
  if (resolved.data.id) writeWatermark(home, resolved.data.id, env);

  const data = { path: written.path, ...(attention ? { attention } : {}), heartbeat };
  printResult(stdout, args, true, data, undefined, () => {
    const mark = kindLine("journal", `parked ${written.path}`);
    return heartbeat ? `${mark}\n${formatHeartbeat(heartbeat)}` : mark;
  });
  return 0;
}
