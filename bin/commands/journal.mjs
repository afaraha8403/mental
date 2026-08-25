/**
 * `mental journal` — append one section to today's journal (task boundary).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { appendJournal, bundleName, ensureSkeleton } from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult } from "../lib/output.mjs";

/**
 * @param {{ json: boolean, dir?: string, flags?: Record<string, string | boolean>, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdJournal(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = typeof args.flags?.title === "string" ? args.flags.title : null;
  if (!title) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental journal requires --title (agents also pass --body --resume --json)",
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
    printResult(stdout, args.json, false, undefined, resolved.error);
    return 1;
  }
  const body = typeof args.flags?.body === "string" ? args.flags.body : "";
  const resume = typeof args.flags?.resume === "string" ? args.flags.resume : "Continue. — open loops: none";
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });
  const written = appendJournal(resolved.data.root, { title, body, resume });
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const indexed = refreshIndex(resolved.data, home, args.env ?? process.env);
  const data = { ...resolved.data, ...written, indexed };
  printResult(stdout, args.json, true, data, undefined, () => `appended ${written.path}`);
  return 0;
}
