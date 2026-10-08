/**
 * `mental supersede <old> --by <new> [--restore]` and `mental obsolete <file> [--restore]`.
 * Model-free. Marks a note or decision as no longer current; the file stays on disk and in history.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { markStale } from "../lib/supersede.mjs";
import { printResult } from "../lib/output.mjs";
import { CMD } from "../lib/pkg.mjs";

/**
 * @param {"superseded" | "obsolete"} status
 */
function run(status) {
  return async function cmdMarkStale(args, io = {}) {
    const stdout = io.stdout ?? process.stdout;
    const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
    const env = args.env ?? process.env;
    const restore = args.flags?.restore === true;
    const name = status === "superseded" ? "supersede" : "obsolete";
    const path = args.rest[0] ? String(args.rest[0]).trim() : "";
    const by = args.flags?.by == null ? "" : String(args.flags.by).trim();
    if (!path) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: `${name} needs the file to mark`,
        hint: status === "superseded" ? `${CMD} supersede <old> --by <new>` : `${CMD} obsolete <file>`,
      });
      return 1;
    }
    if (status === "superseded" && !restore && !by) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: "supersede needs the replacing file: --by <new>",
        hint: `If nothing replaces it, use: ${CMD} obsolete ${path}`,
      });
      return 1;
    }
    if (status === "obsolete" && by) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: "obsolete takes no --by; use supersede when a newer file replaces it",
      });
      return 1;
    }
    const resolved = resolveBundle({ cwd: args.cwd ?? process.cwd(), home, env, dir: args.dir ?? null, write: true });
    if (!resolved.ok) {
      printResult(stdout, args, false, undefined, resolved.error);
      return 1;
    }
    const root = catalogRoot(resolved.data);
    if (!root) {
      printResult(stdout, args, false, undefined, { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });
      return 1;
    }
    const r = markStale(root, path, { status, by: by || undefined, restore });
    if (!r.ok) {
      printResult(stdout, args, false, undefined, r.error);
      return 1;
    }
    const indexed = r.changed ? refreshIndex(resolved.data, home, env) : undefined;
    printResult(stdout, args, true, { ...resolved.data, ...r, restore, indexed }, undefined, (d) => {
      if (!d.changed) return `no change: ${d.path} is already ${d.status}`;
      if (d.restore) return `restored ${d.path}: ${d.previous} -> ${d.status}`;
      return d.supersededBy
        ? `${d.path} is now superseded by ${d.supersededBy} (kept on disk; hidden from heartbeat and ranked last in search)`
        : `${d.path} is now obsolete (kept on disk; hidden from heartbeat and ranked last in search)`;
    });
    return 0;
  };
}

export const cmdSupersede = run("superseded");
export const cmdObsolete = run("obsolete");
