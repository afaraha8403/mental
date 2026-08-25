/**
 * `mental decide` — scaffold a decision file (paths are identities).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { bundleName, ensureSkeleton, writeDecision } from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult } from "../lib/output.mjs";

const STATUSES = new Set(["open", "deferred", "decided", "superseded"]);

export function cmdDecide(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = typeof args.flags?.title === "string" ? args.flags.title : null;
  if (!title) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental decide requires --title",
    });
    return 1;
  }
  const status = typeof args.flags?.status === "string" ? args.flags.status : "open";
  if (!STATUSES.has(status)) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: `status must be ${[...STATUSES].join("|")}`,
    });
    return 1;
  }
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
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });
  try {
    const written = writeDecision(resolved.data.root, {
      title,
      status,
      description: typeof args.flags?.description === "string" ? args.flags.description : "",
      body: typeof args.flags?.body === "string" ? args.flags.body : "",
      slug: typeof args.flags?.slug === "string" ? args.flags.slug : undefined,
    });
    const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
    const indexed = refreshIndex(resolved.data, home, args.env ?? process.env);
    printResult(stdout, args.json, true, { ...resolved.data, ...written, indexed }, undefined, () => `wrote ${written.path}`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    printResult(stdout, args.json, false, undefined, { code, message });
    return 1;
  }
}
