/**
 * `mental pulse` — compact cross-project rows. No journal dump.
 * Writes the pulse watermark for the *active* bundle after computing delta.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { collectPulseProjects, formatPulse, pulseDeltaFor } from "../lib/pulse.mjs";
import { writeWatermark } from "../lib/watermark.mjs";
import { printResult } from "../lib/output.mjs";

/**
 * @param {{ json: boolean, dir?: string, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdPulse(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const cwd = args.cwd ?? process.cwd();

  if (!home) {
    printResult(stdout, args, false, undefined, {
      code: "home",
      message: "HOME unset; no bindings",
    });
    return 1;
  }

  const projects = collectPulseProjects(home);
  const resolved = resolveBundle({
    cwd,
    home,
    env,
    dir: args.dir ?? null,
    write: false,
  });

  let delta = null;
  if (resolved.ok && resolved.data.id) {
    const root = resolved.data.root;
    delta = pulseDeltaFor(root, home, resolved.data.id, env);
    writeWatermark(home, resolved.data.id, env);
  }

  const data = { projects, ...(delta ? { delta } : {}) };
  printResult(stdout, args, true, data, undefined, () => formatPulse(projects));
  return 0;
}
