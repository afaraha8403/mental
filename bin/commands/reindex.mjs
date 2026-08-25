/**
 * `mental reindex` — rebuild the derived sqlite index from OKF files.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { reindexBundle } from "../lib/index.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdReindex(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: true,
  });
  if (!resolved.ok) {
    printResult(stdout, args.json, false, undefined, resolved.error);
    return 1;
  }
  if (!resolved.data.id) {
    printResult(stdout, args.json, false, undefined, {
      code: "no-id",
      message: "No project UUID yet; reindex needs a git binding. Run `mental where` in a repo.",
    });
    return 1;
  }
  const indexed =
    resolved.data.indexed ??
    reindexBundle({
      root: resolved.data.root,
      id: resolved.data.id,
      home: args.home ?? process.env.HOME ?? process.env.USERPROFILE,
      env: args.env ?? process.env,
    });
  printResult(
    stdout,
    args.json,
    indexed.ok,
    { ...resolved.data, indexed },
    indexed.ok ? undefined : { code: "index", message: indexed.error || "reindex failed" },
    (d) =>
      d.indexed.ok
        ? `indexed ${d.indexed.concepts} concept(s) → ${d.indexed.path}`
        : d.indexed.error || "reindex failed",
  );
  return indexed.ok ? 0 : 1;
}
