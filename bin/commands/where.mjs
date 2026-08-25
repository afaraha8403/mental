/**
 * `mental where` — print the active OKF bundle. Agents call this first.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { formatWhere, printResult } from "../lib/output.mjs";

/**
 * @param {{ json: boolean, dir?: string, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 * @returns {number} exit code
 */
export function cmdWhere(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });

  if (!resolved.ok) {
    printResult(stdout, args.json, false, undefined, resolved.error);
    return 1;
  }

  printResult(stdout, args.json, true, resolved.data, undefined, formatWhere);
  return 0;
}
