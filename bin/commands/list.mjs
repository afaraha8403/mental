/**
 * `mental list` — concepts in the active bundle (filters: --type --status --tag).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { filterConcepts, listConcepts } from "../lib/index.mjs";
import { printResult } from "../lib/output.mjs";

function summarize(c) {
  return {
    path: c.path,
    type: c.type,
    title: c.title,
    status: c.status,
    tags: c.tags,
  };
}

export function cmdList(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
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
  const items = filterConcepts(listConcepts(resolved.data.root), { type, status, tag }).map(summarize);
  const data = { ...resolved.data, items, type: type ?? null, status: status ?? null, tag: tag ?? null };
  printResult(stdout, args.json, true, data, undefined, (d) => {
    if (d.items.length === 0) return "(none)";
    return d.items.map((i) => `[${i.type}] ${i.title} (${i.path})`).join("\n");
  });
  return 0;
}
