/**
 * `mental list` — concepts in the active bundle (filters: --type --status --tag --kind
 * --since --on; paging: --limit --offset --all).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { resolveScope } from "../lib/scope.mjs";
import { filterConcepts, listConcepts } from "../lib/index.mjs";
import { EXIT_USAGE, printResult } from "../lib/output.mjs";
import { filterByWindow, pageMeta, parseDateWindow, parsePaging, timeFields } from "../lib/paging.mjs";

function summarize(c, project) {
  return {
    path: c.path,
    type: c.type,
    title: c.title,
    description: c.description || "",
    status: c.status,
    kind: c.kind || "",
    tags: c.tags,
    project,
    ...timeFields(c),
  };
}

export function cmdList(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const paging = parsePaging(args.flags);
  if (!paging.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: paging.message });
    return EXIT_USAGE;
  }
  const win = parseDateWindow(args.flags);
  if (!win.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: win.message });
    return EXIT_USAGE;
  }
  const scopedFlags = args.flags?.project !== undefined || args.flags?.["all-projects"] === true;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  let resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok && scopedFlags) resolved = { ok: true, data: {} };
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const scope = resolveScope(args.flags, resolved, home);
  if (!scope.ok) {
    printResult(stdout, args, false, undefined, scope.error);
    return EXIT_USAGE;
  }
  const type = typeof args.flags?.type === "string" ? args.flags.type : undefined;
  const status = typeof args.flags?.status === "string" ? args.flags.status : undefined;
  const tag = typeof args.flags?.tag === "string" ? args.flags.tag : undefined;
  const kind = typeof args.flags?.kind === "string" ? args.flags.kind : undefined;
  const rows = [];
  for (const t of scope.targets) {
    if (!t.root) continue;
    for (const c of filterByWindow(filterConcepts(listConcepts(t.root), { type, status, tag, kind }), win)) {
      rows.push(summarize(c, t.id ?? null));
    }
  }
  const items = rows.slice(paging.offset, paging.offset + paging.limit);
  const meta = pageMeta({
    total: rows.length,
    offset: paging.offset,
    limit: paging.limit,
    returned: items.length,
  });
  const data = {
    ...resolved.data,
    items,
    ...meta,
    scope: scope.scope,
    projects: scope.scope === "current" ? undefined : scope.targets.map((t) => t.id),
    type: type ?? null,
    status: status ?? null,
    tag: tag ?? null,
    kind: kind ?? null,
    since: win.since ?? null,
    on: win.on ?? null,
  };
  printResult(stdout, args, true, data, undefined, (d) => {
    if (d.items.length === 0) return d.total > 0 ? `(none at offset ${d.offset}; total ${d.total})` : "(none)";
    const lines = d.items.map((i) =>
      d.scope === "all" ? `[${i.type}] ${i.title} (${i.project}:${i.path})` : `[${i.type}] ${i.title} (${i.path})`,
    );
    if (d.truncated) lines.push(`… ${d.returned} of ${d.total}; more: --offset ${d.nextOffset} (or --all)`);
    return lines.join("\n");
  });
  return 0;
}
