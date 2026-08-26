/**
 * `mental search` — query the derived index (sqlite) or scan OKF files.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { searchBundle } from "../lib/index.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdSearch(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const q = args.rest.join(" ").trim();
  if (!q) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental search requires a query",
    });
    return 1;
  }
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) {
    printResult(stdout, args.json, false, undefined, resolved.error);
    return 1;
  }
  const type = typeof args.flags?.type === "string" ? args.flags.type : undefined;
  const status = typeof args.flags?.status === "string" ? args.flags.status : undefined;
  const tag = typeof args.flags?.tag === "string" ? args.flags.tag : undefined;
  const kind = typeof args.flags?.kind === "string" ? args.flags.kind : undefined;
  const found = searchBundle({
    root: resolved.data.root,
    id: resolved.data.id,
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    q,
    type,
    status,
    tag,
    kind,
  });
  const data = { ...resolved.data, q, ...found };
  printResult(stdout, args.json, true, data, undefined, (d) => {
    if (d.hits.length === 0) return `no hits for ${d.q} (${d.backend})`;
    return d.hits
      .map((h) => {
        const line = `[${h.type}] ${h.title} (${h.path})`;
        return h.snippet ? `${line}\n  ${h.snippet}` : line;
      })
      .join("\n");
  });
  return 0;
}
