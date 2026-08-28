/**
 * `mental schema` — dump the command catalog as JSON.
 */
import { getCommand, schemaDump } from "../lib/catalog.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdSchema(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const name = (args.rest[0] || "").trim();
  if (name) {
    if (!getCommand(name)) {
      printResult(stdout, args, false, undefined, {
        code: "unknown-command",
        message: `Unknown command: ${name}`,
        hint: `Try \`${args.json ? "mental schema --json" : "mental schema --json"}\` or \`mental --help\`.`,
      });
      return 1;
    }
  }
  const data = schemaDump(name || undefined);
  const jsonArgs = { ...args, json: true };
  printResult(stdout, jsonArgs, true, data);
  return 0;
}
