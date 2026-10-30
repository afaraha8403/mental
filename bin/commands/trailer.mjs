/**
 * `mental trailer` — read-only trailers for the prepare-commit-msg hook.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { decisionTrailers } from "../lib/trailer.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdTrailer(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home,
    env,
    dir: args.dir ?? null,
    write: false,
  });
  const trailers =
    resolved.ok && resolved.data.root
      ? decisionTrailers({
          root: resolved.data.root,
          id: resolved.data.id,
          gitRoot: resolved.data.gitRoot,
          home,
          env,
        })
      : [];
  printResult(stdout, args, true, { trailers }, undefined, (d) =>
    d.trailers.length ? d.trailers.map((t) => `Mental-Decision: ${t}`).join("\n") : "no trailers",
  );
  return 0;
}
