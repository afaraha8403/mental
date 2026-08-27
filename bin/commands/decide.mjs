/**
 * `mental decide` — create or update a decision. Paths are identities:
 * closing an open decision updates the existing file (same as attention).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import {
  DECISION_STATUSES,
  bundleName,
  ensureSkeleton,
  findDecision,
  updateDecision,
  writeDecision,
} from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult, kindLine } from "../lib/output.mjs";
import { VIA_USAGE, viaFromFlags } from "../lib/via.mjs";

function flagString(flags, key) {
  return typeof flags?.[key] === "string" ? flags[key] : null;
}

export function cmdDecide(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = flagString(args.flags, "title");
  const path = flagString(args.flags, "path");
  if (!title && !path) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental decide requires --title (or --path to update)",
    });
    return 1;
  }

  const statusFlag = flagString(args.flags, "status");
  if (statusFlag && !DECISION_STATUSES.has(statusFlag)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `status must be ${[...DECISION_STATUSES].join("|")}`,
    });
    return 1;
  }
  const status = statusFlag || "open";

  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE });
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
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  ensureSkeleton(resolved.data.root, {
    name: bundleName(resolved.data.root, resolved.data.id || "project"),
  });

  const existing = findDecision(resolved.data.root, {
    path: path || undefined,
    title: title || undefined,
  });

  if (path && !existing) {
    printResult(stdout, args, false, undefined, {
      code: "not-found",
      message: `no decision file at ${path}`,
    });
    return 1;
  }

  try {
    const written = existing
      ? updateDecision(resolved.data.root, existing.path, {
          title: title || undefined,
          status: statusFlag || undefined,
          description: flagString(args.flags, "description") || undefined,
          body: flagString(args.flags, "body") || undefined,
          via: viaParsed.via,
        })
      : writeDecision(resolved.data.root, {
          title,
          status,
          description: flagString(args.flags, "description") || "",
          body: flagString(args.flags, "body") || "",
          via: viaParsed.via,
          slug: flagString(args.flags, "slug") || undefined,
        });
    const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
    const indexed = refreshIndex(resolved.data, home, args.env ?? process.env);
    const verb = written.updated ? "updated" : "wrote";
    printResult(
      stdout,
      args,
      true,
      { ...resolved.data, ...written, indexed },
      undefined,
      () => kindLine("decision", `${verb} ${written.path}`),
    );
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    printResult(stdout, args, false, undefined, { code, message });
    return 1;
  }
}
