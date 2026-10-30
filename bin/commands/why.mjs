/**
 * `mental why <path|sha|path:line>` — history that explains a line of code.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { whyQuery } from "../lib/why.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

export function cmdWhy(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const target = (args.rest || []).join(" ").trim();
  if (!target) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental why requires a path, a commit, or path:line",
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
  if (!resolved.data.root) {
    printResult(stdout, args, false, undefined, {
      code: "no-bundle",
      message: "No Mental bundle for this directory yet.",
    });
    return 1;
  }
  const data = whyQuery({
    root: resolved.data.root,
    gitRoot: resolved.data.gitRoot,
    target,
    env: args.env ?? process.env,
  });
  printResult(stdout, args, true, data, undefined, () => formatWhy(data));
  return 0;
}

/** @param {{ target: string, hits: Array<{ path: string, type: string, title: string, head: string }> }} data */
function formatWhy(data) {
  if (!data.hits.length) return `why ${data.target}: nothing anchored`;
  const lines = [`why ${data.target}`];
  for (const hit of data.hits) {
    lines.push(`  ${hit.type}  ${hit.title}  (${hit.path})${hit.head ? `  ${hit.head.slice(0, 7)}` : ""}`);
  }
  return lines.join("\n");
}
