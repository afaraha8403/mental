/**
 * `mental restore --from <dir> [--dry-run]` — merge a backup into this HOME, or preview what it would do.
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
  const dryRun = Boolean(args.flags?.["dry-run"]);
  const result = restoreHome({ home, from, cwd, replace, confirm, dryRun, env });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return result.error?.code === "usage" ? EXIT_USAGE : 1;
  }
  printResult(stdout, args, true, result.data, undefined, formatRestore);
  return 0;
}

/** @param {{ from: string, dryRun?: boolean, slices: Array<object>, personal: object | null }} data */
function formatRestore(data) {
  const line = (label, r) => {
    const bits = [`${r.wrote ?? 0} new/newer`];
    if (r.journalMerged) bits.push(`${r.journalMerged} journals merged`);
    if (r.kept) bits.push(`${r.kept} kept (yours is newer)`);
    if (r.removed) bits.push(`${r.removed} removed`);
    return `  ${label}  ${r.action}  ${bits.join(", ")}`;
  };
  const rows = data.slices.map((s) => line(s.id.slice(0, 8), s));
  if (data.personal) rows.push(line("personal", data.personal));
  const head = data.dryRun ? `restore preview (nothing written) <- ${data.from}` : `restore <- ${data.from}`;
  return [head, ...(rows.length ? rows : ["  (nothing)"])].join("\n");
}
