/**
 * `mental search` — query the derived index (sqlite) or scan OKF files.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { mergeSearchResults, searchBundle, tokenizeQuery } from "../lib/index.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";
import { getJev, jevHint, formatJevHint } from "../lib/jev.mjs";
import { recoverSearch } from "../lib/jev-assist.mjs";

function emptyFound(q, any) {
  const tokens = tokenizeQuery(String(q).trim().toLowerCase());
  return { backend: "scan", hits: [], total: 0, tokens, op: any ? "or" : "and" };
}

export function cmdSearch(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
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
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const type = typeof args.flags?.type === "string" ? args.flags.type : undefined;
  const status = typeof args.flags?.status === "string" ? args.flags.status : undefined;
  const tag = typeof args.flags?.tag === "string" ? args.flags.tag : undefined;
  const kind = typeof args.flags?.kind === "string" ? args.flags.kind : undefined;
  const any = args.flags?.any === true;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const root = catalogRoot(resolved.data);
  const base = {
    root,
    id: resolved.data.id,
    home,
    env,
    type,
    status,
    tag,
    kind,
  };
  const found = !root
    ? queries.length === 1
      ? emptyFound(queries[0], any)
      : mergeSearchResults(queries.map((q) => emptyFound(q, false)))
    : queries.length === 1
      ? searchBundle({ ...base, q: queries[0], any })
      : mergeSearchResults(
          queries.map((q) => searchBundle({ ...base, q, any: false })),
        );
  const q = queries.length === 1 ? queries[0] : queries;
  const finish = (/** @type {typeof found} */ f, extra = {}) => {
    const data = { ...resolved.data, q, any: queries.length > 1 ? true : any, ...f, truncated: f.total > f.hits.length, ...extra };
    printResult(stdout, args, true, data, undefined, (d) => {
      const label = Array.isArray(d.q) ? d.q.join(" | ") : d.q;
      if (d.hits.length === 0) {
        const line = `no hits for ${label} (${d.backend})`;
        return d.jev && d.jev.text ? `${line}\n${formatJevHint(d.jev)}` : line;
      }
      const lines = d.hits.map((h) => {
        const line = `[${h.type}] ${h.title} (${h.path})`;
        return h.snippet ? `${line}\n  ${h.snippet}` : line;
      });
      if (d.recovered) lines.unshift(`no exact hits; ${d.hits.length} related via jev:`);
      return lines.join("\n");
    });
    return 0;
  };

  if (found.hits.length > 0 || !root) return finish(found);

  const jev = getJev(home, env);
  if (!jev) {
    const hint = jevHint({ home, env, surface: "search" });
    return finish(found, hint ? { jev: hint } : {});
  }
  // Async only on this path so keyless and hit-bearing searches stay synchronous.
  return recoverSearch({
    jev,
    root,
    id: resolved.data.id,
    home,
    env,
    queries,
    filters: { type, status, tag, kind },
  })
    .catch(() => null)
    .then((r) => {
      if (!r || !r.ok || r.hits.length === 0) return finish(found);
      const hits = r.hits.map(({ score, ...h }) => ({ ...h, jevScore: Math.round(score * 100) / 100 }));
      return finish({ ...found, hits, total: hits.length }, { recovered: true, via: "jev", variants: r.variants });
    });
}
