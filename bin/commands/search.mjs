/**
 * `mental search` — query the derived index (sqlite) or scan OKF files.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { resolveScope } from "../lib/scope.mjs";
import { mergeSearchResults, searchBundle, tokenizeQuery } from "../lib/index.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";
import { getJev, jevHint, formatJevHint } from "../lib/jev.mjs";
import { recoverSearch } from "../lib/jev-assist.mjs";
import { rerankHits } from "../lib/rerank.mjs";
import { isStale, supersededByMap } from "../lib/supersede.mjs";
import { pageMeta, parseDateWindow, parsePaging } from "../lib/paging.mjs";

/**
 * Stale notes/decisions stay findable but rank after current ones and say what replaced them.
 * An explicit `--status superseded|obsolete` filter keeps its own order. Fields are additive.
 */
function demoteStale(root, f, statusFilter) {
  if (!f.hits.some((h) => isStale(h.status))) return f;
  const by = supersededByMap(root, f.hits);
  const hits = f.hits.map((h) => (by.has(h.path) ? { ...h, supersededBy: by.get(h.path) } : h));
  if (isStale(statusFilter)) return { ...f, hits };
  return { ...f, hits: [...hits.filter((h) => !isStale(h.status)), ...hits.filter((h) => isStale(h.status))] };
}

function emptyFound(q, any) {
  const tokens = tokenizeQuery(String(q).trim().toLowerCase());
  return { backend: "scan", hits: [], total: 0, tokens, op: any ? "or" : "and" };
}

export function cmdSearch(args, io = {}) {
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
  const fromRest = args.rest.join(" ").trim();
  const queries = Array.isArray(args.queries)
    ? args.queries.map((s) => String(s).trim()).filter(Boolean)
    : fromRest
      ? [fromRest]
      : [];
  if (queries.length === 0) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental search requires a query",
    });
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
  const any = args.flags?.any === true;
  const env = args.env ?? process.env;
  const { limit, offset } = paging;
  const multi = scope.scope === "all";
  const searchOne = (t, unbounded) => {
    const base = {
      root: t.root,
      id: t.id,
      home,
      env,
      type,
      status,
      tag,
      kind,
      sinceMs: win.sinceMs,
      untilMs: win.untilMs,
    };
    const lim = unbounded ? Infinity : limit;
    const off = unbounded ? 0 : offset;
    if (!t.root) {
      return queries.length === 1
        ? emptyFound(queries[0], any)
        : mergeSearchResults(queries.map((q) => emptyFound(q, false)));
    }
    return queries.length === 1
      ? searchBundle({ ...base, q: queries[0], any, limit: lim, offset: off })
      : mergeSearchResults(
          queries.map((q) => searchBundle({ ...base, q, any: false, limit: Infinity, offset: 0 })),
          lim,
          off,
        );
  };
  let found;
  /** @type {Array<Record<string, unknown>>} */
  let hits;
  if (scope.targets.length === 1) {
    const t = scope.targets[0];
    found = searchOne(t, false);
    hits = found.hits.map((h) => ({ ...h, project: t.id ?? null }));
  } else {
    const batches = scope.targets.map((t) => ({ t, r: searchOne(t, true) }));
    const all = batches.flatMap(({ t, r }) => r.hits.map((h) => ({ ...h, project: t.id ?? null })));
    const first = batches[0]?.r ?? emptyFound(queries[0], any);
    found = {
      backend: batches.some(({ r }) => r.backend === "scan") ? "scan" : (first.backend ?? "scan"),
      tokens: first.tokens,
      op: first.op,
      total: all.length,
      offset,
    };
    hits = all.slice(offset, offset + limit);
  }
  const q = queries.length === 1 ? queries[0] : queries;
  found = { ...found, hits };
  const single = scope.targets.length === 1 ? scope.targets[0] : null;
  const root = single?.root ?? null;
  const finish = (/** @type {typeof found} */ f0, extra = {}) => {
    const f = root ? demoteStale(root, f0, status) : f0;
    const meta = pageMeta({ total: f.total, offset: extra.recovered ? 0 : offset, limit, returned: f.hits.length });
    const data = {
      ...resolved.data,
      q,
      any: queries.length > 1 ? true : any,
      ...f,
      ...meta,
      scope: scope.scope,
      projects: scope.scope === "current" ? undefined : scope.targets.map((t) => t.id),
      since: win.since ?? null,
      on: win.on ?? null,
      ...extra,
    };
    printResult(stdout, args, true, data, undefined, (d) => {
      const label = Array.isArray(d.q) ? d.q.join(" | ") : d.q;
      if (d.hits.length === 0) {
        const line = `no hits for ${label} (${d.backend})`;
        return d.jev && d.jev.text ? `${line}\n${formatJevHint(d.jev)}` : line;
      }
      const lines = d.hits.map((h) => {
        const tag = isStale(h.status) ? ` - ${h.status}${h.supersededBy ? ` by ${h.supersededBy}` : ""}` : "";
        const where = multi ? `${h.project}:${h.path}` : h.path;
        const line = `[${h.type}] ${h.title} (${where})${tag}`;
        return h.snippet ? `${line}\n  ${h.snippet}` : line;
      });
      if (d.recovered) lines.unshift(`no exact hits; ${d.hits.length} related via jev${d.broad ? " (broad read of recent files)" : ""}:`);
      if (d.truncated) lines.push(`… ${d.returned} of ${d.total}; more: --offset ${d.nextOffset} (or --all)`);
      return lines.join("\n");
    });
    return 0;
  };

  if (found.hits.length > 0 || !root) {
    if (args.flags?.rank === true && root && found.hits.length > 1) {
      const rj = getJev(home, env);
      if (rj && !(resolved.data.mode === "personal" && !rj.personal)) {
        return rerankHits({ jev: rj, queries, hits: found.hits })
          .catch(() => null)
          .then((r) => (r && r.ok ? finish({ ...found, hits: r.hits }, { ranked: true, via: "jev", ...(r.intent ? { intent: r.intent } : {}) }) : finish(found)));
      }
    }
    return finish(found);
  }

  const jev = getJev(home, env);
  if (!jev) {
    const hint = jevHint({ home, env, surface: "search" });
    return finish(found, hint ? { jev: hint } : {});
  }
  // Async only on this path so keyless and hit-bearing searches stay synchronous.
  return recoverSearch({
    jev,
    root,
    id: single.id,
    home,
    env,
    queries,
    filters: { type, status, tag, kind },
  })
    .catch(() => null)
    .then((r) => {
      if (!r || !r.ok || r.hits.length === 0) return finish(found);
      const hits = r.hits.map(({ score, ...h }) => ({ ...h, jevScore: Math.round(score * 100) / 100 }));
      return finish({ ...found, hits, total: hits.length }, { recovered: true, via: "jev", variants: r.variants, ...(r.broad ? { broad: true } : {}) });
    });
}
