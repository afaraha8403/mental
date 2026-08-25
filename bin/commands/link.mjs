/**
 * `mental link` — point this cwd at an existing UUID (second clone of same project).
 */
import { printResult } from "../lib/output.mjs";
import { cmdRemap } from "./remap.mjs";

export function cmdLink(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const to = typeof args.flags?.to === "string" ? args.flags.to : null;
  if (!to) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental link requires --to <uuid> (or run mental remap --to <uuid>)",
    });
    return 1;
  }
  return cmdRemap({ ...args, flags: { ...args.flags, to } }, io);
}
