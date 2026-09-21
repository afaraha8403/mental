/**
 * `mental backup --out <dir>` — pack this HOME's OKF + identities.
 */
import { packHome } from "../lib/backup.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

export function cmdBackup(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  const out = typeof args.flags?.out === "string" ? args.flags.out : "";
  const result = packHome({ home, out, cwd, env });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return result.error?.code === "usage" ? EXIT_USAGE : 1;
  }
  printResult(stdout, args, true, result.data, undefined, formatBackup);
  return 0;
}

/** @param {{ out: string, slices: Array<{ id: string, files: number }>, personal: boolean }} data */
function formatBackup(data) {
  const n = data.slices.reduce((s, x) => s + x.files, 0);
  const extra = data.personal ? " + personal" : "";
  return `backup ${data.slices.length} slice(s)${extra} (${n} files) → ${data.out}`;
}
