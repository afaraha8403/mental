/**
 * `mental move <path> --to <project>` — re-file one attention/decision/note into
 * another project's bundle, keeping its timestamp, frontmatter and body.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { resolveScope } from "../lib/scope.mjs";
import { moveConcept } from "../lib/move.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";

/**
 * @param {any} args
 * @param {string} rel
 * @param {string} to
 * @param {any} io
 */
export function runMove(args, rel, to, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const fail = (error, code = 1) => {
    printResult(stdout, args, false, undefined, error);
    return code;
  };
  if (!rel) return fail({ code: "usage", message: "mental move requires a bundle-relative path" }, EXIT_USAGE);
  if (!to) return fail({ code: "usage", message: "mental move requires --to <project id|name>" }, EXIT_USAGE);

  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home,
    env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) return fail(resolved.error);
  const srcRoot = catalogRoot(resolved.data);
  if (!srcRoot) return fail({ code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });

  const scope = resolveScope({ project: to }, resolved, home);
  if (!scope.ok) return fail(scope.error, scope.error.code === "usage" ? EXIT_USAGE : 1);
  const target = scope.targets[0];
  if (!target?.root) {
    return fail({ code: "not-found", message: `project ${to} has no bundle on this machine` });
  }

  const moved = moveConcept({
    srcRoot,
    srcId: resolved.data.id ?? null,
    destRoot: target.root,
    destId: target.id,
    destName: target.name,
    rel,
    home,
    env,
  });
  if (!moved.ok) return fail(moved.error, moved.error.code === "usage" ? EXIT_USAGE : 1);

  const indexed = {
    from: refreshIndex(resolved.data, home, env),
    to: refreshIndex({ id: target.id, root: target.root }, home, env),
  };
  const warnings = [];
  if (moved.data.danglingBacklinks.length) {
    warnings.push(
      `${moved.data.danglingBacklinks.length} file(s) in the source project still link to ${moved.data.from}: ${moved.data.danglingBacklinks.map((b) => b.path).join(", ")}`,
    );
  }
  if (moved.data.outboundLinks.length) {
    warnings.push(
      `moved file links to source-project files that did not move: ${moved.data.outboundLinks.join(", ")}`,
    );
  }
  const payload = {
    from: moved.data.from,
    to: moved.data.to,
    renamed: moved.data.renamed,
    fromProject: { id: resolved.data.id ?? null, name: resolved.data.name ?? null },
    project: { id: target.id, name: target.name },
    indexed,
    ...(warnings.length ? { warning: warnings.join("; ") } : {}),
  };
  printResult(
    stdout,
    args,
    true,
    payload,
    undefined,
    (d) =>
      kindLine("move", `${d.from} -> ${d.project.name || d.project.id}:${d.to}`) +
      (d.warning ? `\nwarning: ${d.warning}` : ""),
  );
  return 0;
}

export function cmdMove(args, io = {}) {
  const rel = (args.rest?.[0] || (typeof args.flags?.path === "string" ? args.flags.path : "")).trim();
  const to = typeof args.flags?.to === "string" ? args.flags.to.trim() : "";
  return runMove(args, rel, to, io);
}
