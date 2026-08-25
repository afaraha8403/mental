/**
 * `mental hooks on|off` — optional session-start snippets. Default off.
 */
import { disableHooks, enableHooks } from "../lib/hooks.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdHooks(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args.json, false, undefined, {
      code: "no-home",
      message: "HOME is unset; Mental will not write hooks.",
    });
    return 1;
  }

  const action = (args.rest[0] || "").toLowerCase();
  if (action !== "on" && action !== "off") {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental hooks on|off  (default off; install does not enable hooks)",
    });
    return 1;
  }

  const result = action === "on" ? enableHooks(home) : disableHooks(home);
  if (!result.ok) {
    printResult(stdout, args.json, false, undefined, result.error);
    return 1;
  }
  printResult(
    stdout,
    args.json,
    true,
    { action, ...result },
    undefined,
    () => `hooks ${action}: ${result.written.join(", ") || "nothing to change"}`,
  );
  return 0;
}
