/**
 * `mental attention` — create or update residue still in the air after a hop.
 * Unlike decide/note, this command must close items (`--status resolved`).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import {
  ATTENTION_KINDS,
  ATTENTION_STATUSES,
  bundleName,
  ensureSkeleton,
  findAttention,
  repoRelativePath,
  updateAttention,
  writeAttention,
} from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";
import { VIA_USAGE, VIA_HINT, viaFromFlags } from "../lib/via.mjs";

function flagString(flags, key) {
  return typeof flags?.[key] === "string" ? flags[key] : null;
}

export function cmdAttention(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const title = flagString(args.flags, "title");
  const path = flagString(args.flags, "path");
  if (!title && !path) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental attention requires --title (or --path to update)",
    });
    return EXIT_USAGE;
  }

  const statusFlag = flagString(args.flags, "status");
  if (statusFlag && !ATTENTION_STATUSES.has(statusFlag)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `status must be ${[...ATTENTION_STATUSES].join("|")}`,
    });
    return EXIT_USAGE;
  }
  const status = statusFlag || "open";

  const kindFlag = flagString(args.flags, "kind");
  if (kindFlag && !ATTENTION_KINDS.has(kindFlag)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `kind must be ${[...ATTENTION_KINDS].join("|")}`,
    });
    return EXIT_USAGE;
  }

  const againstRaw = flagString(args.flags, "against");
  const against = againstRaw != null ? repoRelativePath(againstRaw) : undefined;
  if (againstRaw != null && against === null) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "--against must be a repo-relative path (no ..)",
    });
    return EXIT_USAGE;
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

  const existing = findAttention(resolved.data.root, {
    path: path || undefined,
    title: title || undefined,
  });

  if (path && !existing) {
    printResult(stdout, args, false, undefined, {
      code: "not-found",
      message: `no attention file at ${path}`,
    });
    return 1;
  }

  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE, hint: VIA_HINT });
    return EXIT_USAGE;
  }

  if (!existing && !kindFlag) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental attention create requires --kind direction|concern|thread|verify",
    });
    return EXIT_USAGE;
  }

  try {
    const written = existing
      ? updateAttention(resolved.data.root, existing.path, {
          title: title || undefined,
          status: statusFlag || undefined,
          kind: kindFlag || undefined,
          from: flagString(args.flags, "from") || undefined,
          against: against || undefined,
          via: viaParsed.via,
          description: flagString(args.flags, "description") || undefined,
          body: flagString(args.flags, "body") || undefined,
        })
      : writeAttention(resolved.data.root, {
          title,
          status,
          kind: kindFlag,
          from: flagString(args.flags, "from") || undefined,
          against: against || undefined,
          via: viaParsed.via,
          description: flagString(args.flags, "description") || "",
          body: flagString(args.flags, "body") || "",
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
      () => kindLine("attention", `${verb} ${written.path}`),
    );
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    printResult(stdout, args, false, undefined, { code, message });
    return 1;
  }
}
