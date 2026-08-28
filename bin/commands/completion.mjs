/**
 * `mental completion bash|zsh|fish` — print a completion script.
 */
import { completionScript } from "../lib/catalog.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

const SHELLS = new Set(["bash", "zsh", "fish"]);

export function cmdCompletion(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const shell = String(args.rest[0] || "").toLowerCase();
  if (!SHELLS.has(shell)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental completion bash|zsh|fish",
      hint: "Prints a script on stdout. Example: eval \"$(mental completion bash)\"",
    });
    return EXIT_USAGE;
  }
  stdout.write(completionScript(/** @type {"bash" | "zsh" | "fish"} */ (shell)));
  return 0;
}
