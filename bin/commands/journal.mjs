/**
 * `mental journal` — append one section to today's journal (task boundary).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { appendJournal, bundleName, ensureSkeleton, repoRelativePath } from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult, EXIT_USAGE, kindLine } from "../lib/output.mjs";
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
export function cmdJournal(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = typeof args.flags?.title === "string" ? args.flags.title : null;
  if (!title) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental journal requires --title (agents also pass --body --resume --json)",
      hint: "mental journal --title \"…\" --resume \"Exact next — open loops: none\" --json",
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
  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE, hint: VIA_HINT });
    return EXIT_USAGE;
  }
  const body = typeof args.flags?.body === "string" ? args.flags.body : "";
  const resume = typeof args.flags?.resume === "string" ? args.flags.resume : null;
  if (!resume) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental journal requires --resume",
      hint: "Pass --resume \"Exact next action — open loops: none\"",
    });
    return EXIT_USAGE;
  }
  const againstRaw = typeof args.flags?.against === "string" ? args.flags.against : undefined;
  const against = againstRaw != null ? repoRelativePath(againstRaw) : undefined;
  if (againstRaw != null && against === null) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "--against must be a repo-relative path (no ..)",
      hint: "Example: --against PLAN.md",
    });
    return EXIT_USAGE;
  }
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });
  let timer_stop_failed = false;
  let time = null;
  let review = null;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (home && isBundleRoot(resolved.data) && isFeatureOn(home, "track", resolved.data.id || null)) {
    const stopped = stopFocusedForPark(resolved.data.root, {
      titleInternal: flagString(args.flags, "title-internal") || title,
      bodyInternal: flagString(args.flags, "body-internal") || body || undefined,
      titleExternal: flagString(args.flags, "title-external") || undefined,
      bodyExternal: flagString(args.flags, "body-external") || undefined,
      projectName: flagString(args.flags, "project-name") || undefined,
      billableHmm: flagString(args.flags, "billable") || undefined,
    });
    if (!stopped.ok) timer_stop_failed = true;
    else {
      time = stopped.data || null;
      review = stopped.review || null;
    }
  }
  const written = appendJournal(resolved.data.root, { title, body, resume, against, via: viaParsed.via });
  const indexed = refreshIndex(resolved.data, home, args.env ?? process.env);
  const data = {
    ...resolved.data,
    ...written,
    ...(time ? { time } : {}),
    ...(review ? { review } : {}),
    indexed,
    ...(timer_stop_failed ? { timer_stop_failed: true } : {}),
  };
  printResult(stdout, args, true, data, undefined, () => kindLine("journal", `appended ${written.path}`));
  return 0;
}
