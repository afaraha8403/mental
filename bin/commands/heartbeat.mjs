/**
 * `mental` with no args on a TTY — print the heartbeat and exit.
 */
import { collectHeartbeat, formatHeartbeat } from "../lib/heartbeat.mjs";
import { printResult } from "../lib/output.mjs";

/**
 * @param {{ json: boolean, dir?: string, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdHeartbeat(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const collected = collectHeartbeat(args);
  if (!collected.ok) {
    printResult(stdout, args.json, false, undefined, collected.error);
    return 1;
  }
  printResult(stdout, args.json, true, collected.data, undefined, formatHeartbeat);
  return 0;
}
