/**
 * `mental attention` — create or update residue still in the air after a hop.
 * Unlike decide/note, this command must close items (`--status resolved`).
 */
import { resolveWriteBundle } from "../lib/scope.mjs";
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { runMove } from "./move.mjs";
import {
  ATTENTION_KINDS,
  ATTENTION_STATUSES,
  bundleName,
  ensureSkeleton,
  findAttention,
  missingCreateTag,
  repoRelativePath,
  tagsFromFlag,
  updateAttention,
  writeAttention,
} from "../lib/okf.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";
import { VIA_USAGE, VIA_HINT, viaFromFlags } from "../lib/via.mjs";

const HISTORY_TITLE = /^\s*(DONE|CLOSED|COMPLETED?|CORRECTION|LEDGER CORRECTION)\b/i;
const HISTORY_WARNING =
  "this reads like a settled fact (outcome/correction), not residue. Record it with `mental note` or `mental journal`, or resolve the original item with `--status resolved`; otherwise it stays open indefinitely.";

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

  const moveTo = flagString(args.flags, "move-to");
  if (args.flags?.["move-to"] !== undefined && !moveTo) {
    printResult(stdout, args, false, undefined, { code: "usage", message: "--move-to requires a project id or name" });
    return EXIT_USAGE;
  }
  if (moveTo) {
    if (flagString(args.flags, "project")) {
      printResult(stdout, args, false, undefined, { code: "usage", message: "--move-to and --project cannot be combined" });
      return EXIT_USAGE;
    }
    const src = resolveBundle({
      cwd: args.cwd ?? process.cwd(),
      home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
      env: args.env ?? process.env,
      dir: args.dir ?? null,
      write: false,
    });
    const srcRoot = src.ok ? catalogRoot(src.data) : null;
    const item = srcRoot ? findAttention(srcRoot, { path: path || undefined, title: title || undefined }) : null;
    if (!item) {
      printResult(stdout, args, false, undefined, {
        code: "not-found",
        message: path ? `no attention file at ${path}` : `no attention item titled "${title}" to move`,
      });
      return 1;
    }
    return runMove(args, item.path, moveTo, io);
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

  const resolved = resolveWriteBundle(args);
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

  const tagged = tagsFromFlag(flagString(args.flags, "tag"));
  if (!tagged.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: tagged.message });
    return EXIT_USAGE;
  }
  if (!existing && tagged.tags === undefined) {
    printResult(stdout, args, false, undefined, missingCreateTag("attention"));
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
          tags: tagged.tags,
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
          tags: tagged.tags,
        });
    const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
    const indexed = refreshIndex(resolved.data, home, args.env ?? process.env);
    const verb = written.updated ? "updated" : "wrote";
    const warning =
      !existing && status !== "resolved" && HISTORY_TITLE.test(title || "")
        ? HISTORY_WARNING
        : undefined;
    printResult(
      stdout,
      args,
      true,
      { ...resolved.data, ...written, indexed, ...(warning ? { warning } : {}) },
      undefined,
      () =>
        kindLine("attention", `${verb} ${written.path}`) +
        (warning ? `\nwarning: ${warning}` : ""),
    );
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /** @type {{ code?: string }} */ (err).code || "write";
    printResult(stdout, args, false, undefined, { code, message });
    return 1;
  }
}
