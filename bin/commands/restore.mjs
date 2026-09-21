/**
 * `mental restore --from <dir>` — merge a backup into this HOME.
 */
import { restoreHome } from "../lib/restore.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

export function cmdRestore(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  const from = typeof args.flags?.from === "string" ? args.flags.from : "";
  const replace = Boolean(args.flags?.replace);
  const confirm = typeof args.flags?.confirm === "string" ? args.flags.confirm : "";
  const result = restoreHome({ home, from, cwd, replace, confirm, env });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return result.error?.code === "usage" ? EXIT_USAGE : 1;
  }
  printResult(stdout, args, true, result.data, undefined, formatRestore);
  return 0;
}

/** @param {{ from: string, slices: Array<{ id: string, action: string }>, personal: object | null }} data */
function formatRestore(data) {
  const bits = data.slices.map((s) => `${s.action} ${s.id.slice(0, 8)}`);
  if (data.personal) bits.push(`${data.personal.action} personal`);
  return `restore ${bits.join(", ") || "(nothing)"} ← ${data.from}`;
}
