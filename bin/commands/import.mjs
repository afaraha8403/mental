/**
 * `mental import <dir>` — merge a handoff --share pack into the matching origin.
 */
import { importShare } from "../lib/share.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

export function cmdImport(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const from = (args.rest || [])[0] || "";
  if (!from) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental import requires a share directory",
    });
    return EXIT_USAGE;
  }
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const result = importShare({
    home,
    from,
    cwd: args.cwd ?? process.cwd(),
    env: args.env ?? process.env,
    allowSecrets: args.flags?.["allow-secrets"] === true,
  });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return result.error?.code === "usage" ? EXIT_USAGE : 1;
  }
  printResult(stdout, args, true, result.data, undefined, (d) => `imported ${d.wrote} file(s) into ${d.id}`);
  return 0;
}
