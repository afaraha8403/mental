/**
 * `mental brief [--hops N] [--find WORD] [--since park|handoff] [--no-rank]` — one paste-ready continue packet (#63).
 * Read-only. Works without a key; a configured decision model only re-orders residue by relevance.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { collectHeartbeat, catalogRoot, formatWhen } from "../lib/heartbeat.mjs";
import { getJev } from "../lib/jev.mjs";
import { buildBrief, formatBrief, DEFAULT_HOPS, MAX_HOPS } from "../lib/brief.mjs";
import { printResult } from "../lib/output.mjs";

export async function cmdBrief(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const rawHops = args.flags?.hops;
  const hops = rawHops == null ? DEFAULT_HOPS : Number.parseInt(String(rawHops), 10);
  if (!Number.isInteger(hops) || hops < 1 || hops > MAX_HOPS) {
    printResult(stdout, args, false, undefined, { code: "usage", message: `--hops must be an integer from 1 to ${MAX_HOPS}` });
    return 1;
  }
  const find = typeof args.flags?.find === "string" ? args.flags.find : "";
  const since = args.flags?.since == null ? "" : String(args.flags.since).toLowerCase();
  if (since && since !== "park" && since !== "handoff") {
    printResult(stdout, args, false, undefined, { code: "usage", message: "--since must be park or handoff" });
    return 1;
  }

  const resolved = resolveBundle({ cwd: args.cwd ?? process.cwd(), home, env, dir: args.dir ?? null, write: false });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const root = catalogRoot(resolved.data);
  if (!root) {
    printResult(stdout, args, false, undefined, { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });
    return 1;
  }
  const hb = collectHeartbeat(args, { pingTrack: false, where: resolved.data });
  if (!hb.ok) {
    printResult(stdout, args, false, undefined, hb.error);
    return 1;
  }

  let jev = args.flags?.["no-rank"] === true ? null : getJev(home, env);
  if (jev && resolved.data.mode === "personal" && !jev.personal) jev = null;

  const data = await buildBrief({ root, hb: hb.data, jev, hops, find, since });
  printResult(stdout, args, true, { id: resolved.data.id ?? null, ...data }, undefined, (d) => formatBrief(d, (w) => formatWhen(w)));
  return 0;
}
