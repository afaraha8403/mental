/**
 * `mental handoff` — planned close: journal then heartbeat.
 * Requires --title and --resume. Writes the pulse watermark after the delta.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { appendJournal, bundleName, ensureSkeleton, repoRelativePath } from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { collectHeartbeat, formatHeartbeat } from "../lib/heartbeat.mjs";
import { writeWatermark } from "../lib/watermark.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";
import { VIA_USAGE, VIA_HINT, viaFromFlags } from "../lib/via.mjs";
import { isFeatureOn } from "../lib/config.mjs";
import { isBundleRoot } from "../lib/heartbeat.mjs";
import { stopFocusedForPark } from "../lib/time.mjs";

function flagString(flags, key) {
  return typeof flags?.[key] === "string" ? flags[key] : null;
}

/**
 * @param {{ json: boolean, dir?: string, flags?: Record<string, string | boolean>, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdHandoff(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = flagString(args.flags, "title");
  const resume = flagString(args.flags, "resume");
  if (!title) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental handoff requires --title",
    });
    return EXIT_USAGE;
  }
  if (!resume) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental handoff requires --resume",
    });
    return EXIT_USAGE;
  }

  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE, hint: VIA_HINT });
    return EXIT_USAGE;
  }

  const againstRaw = flagString(args.flags, "against");
  const against = againstRaw != null ? repoRelativePath(againstRaw) : undefined;
  if (againstRaw != null && against === null) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "--against must be a repo-relative path (no ..)",
    });
    return EXIT_USAGE;
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

  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  let timer_stop_failed = false;
  if (home && isBundleRoot(resolved.data) && isFeatureOn(home, "track", resolved.data.id || null)) {
    const stopped = stopFocusedForPark(resolved.data.root);
    if (!stopped.ok) timer_stop_failed = true;
  }

  const body = flagString(args.flags, "body") || "";
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });
  const written = appendJournal(resolved.data.root, { title, body, resume, against, via: viaParsed.via });
  const env = args.env ?? process.env;
  refreshIndex(resolved.data, home, env);

  const collected = collectHeartbeat(args);
  const heartbeat = collected.ok ? collected.data : null;
  if (resolved.data.id) writeWatermark(home, resolved.data.id, env);

  const data = { path: written.path, heartbeat, ...(timer_stop_failed ? { timer_stop_failed: true } : {}) };
  printResult(stdout, args, true, data, undefined, () => {
    const mark = kindLine("journal", `handoff ${written.path}`);
    return heartbeat ? `${mark}\n${formatHeartbeat(heartbeat)}` : mark;
  });
  return 0;
}
