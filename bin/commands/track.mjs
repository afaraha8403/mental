/**
 * `mental track` — optional wall/billable timers. Isolated add-on; default off.
 * Glance is not a focus ping. Hours never go to git.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { resolveBundle } from "../lib/resolve.mjs";
import { TRACK_OFF_USAGE, isFeatureOn, loadConfig } from "../lib/config.mjs";
import { assertLocalIgnorable } from "../lib/ignore.mjs";
import { bundleName, repoRelativePath } from "../lib/okf.mjs";
import { VIA_USAGE, VIA_HINT, viaFromFlags } from "../lib/via.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";
import { isBundleRoot } from "../lib/heartbeat.mjs";
import { loadBindings, projectSliceDir } from "../lib/bindings.mjs";
import { pulseRootForBinding } from "../lib/pulse.mjs";
import {
  amendInterval,
  assertExportOutPath,
  canWriteTime,
  discardInterval,
  focusInterval,
  glanceTime,
  renderExport,
  reportTime,
  startInterval,
  stopIntervals,
} from "../lib/time.mjs";

function flagString(flags, key) {
  return typeof flags?.[key] === "string" ? flags[key] : null;
}

/** --billable is the name; --user is an alias. */
function hoursHmm(flags) {
  const billable = flagString(flags, "billable");
  const user = flagString(flags, "user");
  if (billable && user && billable !== user) {
    return { ok: false, message: "pass --billable or --user, not both" };
  }
  return { ok: true, hmm: billable || user || undefined };
}

function trackOffResult(stdout, args) {
  printResult(stdout, args, false, undefined, { code: "usage", message: TRACK_OFF_USAGE });
  return EXIT_USAGE;
}

function resolveWhere(args, { write }) {
  return resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write,
  });
}

function formatGlance(data) {
  const lines = [];
  if (!data.running.length && !data.stoppedToday.length) return "no running timers";
  for (const t of data.tasks) {
    lines.push(`${t.title_internal}  ⏱ ${t.wall}  billable ${t.billable}`);
    for (const i of t.intervals) {
      const tag = i.neverStarted ? "never-started" : i.stale ? "stale" : i.status;
      lines.push(`  ${tag} ${i.id.slice(0, 8)}  ${i.live_wall}`);
    }
  }
  if (data.overlap?.length) lines.push("warn: overlapping running intervals (same clock twice)");
  return lines.join("\n");
}

/**
 * @param {object} args
 * @param {{ stdout?: NodeJS.WritableStream, isTTY?: boolean }} [io]
 */
export function cmdTrack(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const sub = (args.rest[0] || "glance").toLowerCase();
  const json = Boolean(args.json);
  const isTTY = Boolean(io.isTTY ?? stdout.isTTY);

  const resolved = resolveWhere(args, { write: sub === "start" });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const where = resolved.data;
  if (!canWriteTime(where) || !isBundleRoot(where)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "Time tracking needs a project bundle (git repo after a write, or mental local).",
    });
    return EXIT_USAGE;
  }

  const uuid = where.id || null;
  if (!home || !isFeatureOn(home, "track", uuid)) {
    return trackOffResult(stdout, args);
  }

  if (where.mode === "local") {
    const gate = assertLocalIgnorable(where.gitRoot || args.cwd, { env: args.env ?? process.env });
    if (!gate.ok) {
      printResult(stdout, args, false, undefined, gate.error);
      return 1;
    }
  }

  const viaParsed = viaFromFlags(args.flags);
  if (!viaParsed.ok) {
    printResult(stdout, args, false, undefined, { code: "usage", message: VIA_USAGE, hint: VIA_HINT });
    return EXIT_USAGE;
  }

  if (sub === "glance" || sub === "track") {
    const g = glanceTime(where.root);
    if (!g.ok) {
      printResult(stdout, args, false, undefined, g.error);
      return 1;
    }
    printResult(stdout, args, true, g.data, undefined, formatGlance);
    return 0;
  }

  if (sub === "start") {
    const started = flagString(args.flags, "started");
    if (started && (json || !isTTY)) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: "--started is TTY-only (agents cannot backfill a clock)",
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
    const defaultName = (where.gitRoot && basename(where.gitRoot)) || bundleName(where.root, where.id || "project");
    const result = startInterval(where.root, {
      titleInternal: flagString(args.flags, "title-internal") || "",
      titleExternal: flagString(args.flags, "title-external") || undefined,
      bodyInternal: flagString(args.flags, "body-internal") || undefined,
      bodyExternal: flagString(args.flags, "body-external") || undefined,
      projectName: flagString(args.flags, "project-name") || defaultName,
      against: against || "",
      via: viaParsed.via || "",
      taskId: flagString(args.flags, "task") || undefined,
      started: started || undefined,
      forceNew: Boolean(args.flags?.new),
    });
    if (!result.ok) {
      printResult(stdout, args, false, undefined, result.error);
      return 1;
    }
    printResult(
      stdout,
      args,
      true,
      result.data,
      undefined,
      () =>
        kindLine(
          "note",
          `${result.data.ensured ? "ensured" : "started"} ${result.data.title_internal}`,
        ),
    );
    return 0;
  }

  if (sub === "focus") {
    const result = focusInterval(where.root, { id: flagString(args.flags, "id") || "" });
    if (!result.ok) {
      printResult(stdout, args, false, undefined, result.error);
      return 1;
    }
    printResult(stdout, args, true, result.data, undefined, () => `focused ${result.data.id}`);
    return 0;
  }

  if (sub === "stop") {
    if (Boolean(args.flags?.["accept-stale"]) && json) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: "--accept-stale is TTY-only",
      });
      return EXIT_USAGE;
    }
    const hours = hoursHmm(args.flags);
    if (!hours.ok) {
      printResult(stdout, args, false, undefined, { code: "usage", message: hours.message });
      return EXIT_USAGE;
    }
    const result = stopIntervals(where.root, {
      id: flagString(args.flags, "id") || undefined,
      all: Boolean(args.flags?.all),
      userHmm: hours.hmm,
      acceptStale: Boolean(args.flags?.["accept-stale"]) && isTTY && !json,
      json,
      titleInternal: flagString(args.flags, "title-internal") || undefined,
      bodyInternal: flagString(args.flags, "body-internal") || undefined,
      titleExternal: flagString(args.flags, "title-external") || undefined,
      bodyExternal: flagString(args.flags, "body-external") || undefined,
      projectName: flagString(args.flags, "project-name") || undefined,
    });
    if (!result.ok) {
      printResult(stdout, args, false, undefined, result.error);
      return 1;
    }
    const first = result.data.stopped[0];
    printResult(
      stdout,
      args,
      true,
      result.data,
      undefined,
      () => kindLine("note", first ? `stopped ${first.title_internal}` : "stopped"),
    );
    return 0;
  }

  if (sub === "discard") {
    const result = discardInterval(where.root, { id: flagString(args.flags, "id") || undefined });
    if (!result.ok) {
      printResult(stdout, args, false, undefined, result.error);
      return 1;
    }
    printResult(
      stdout,
      args,
      true,
      result.data,
      undefined,
      () => kindLine("note", `discarded ${result.data.title_internal}`),
    );
    return 0;
  }

  if (sub === "amend") {
    const hours = hoursHmm(args.flags);
    if (!hours.ok) {
      printResult(stdout, args, false, undefined, { code: "usage", message: hours.message });
      return EXIT_USAGE;
    }
    const result = amendInterval(where.root, {
      id: flagString(args.flags, "id") || "",
      titleInternal: flagString(args.flags, "title-internal") || undefined,
      bodyInternal: flagString(args.flags, "body-internal") || undefined,
      titleExternal: flagString(args.flags, "title-external") || undefined,
      bodyExternal: flagString(args.flags, "body-external") || undefined,
      userHmm: hours.hmm,
      projectName: flagString(args.flags, "project-name") || undefined,
    });
    if (!result.ok) {
      printResult(stdout, args, false, undefined, result.error);
      return 1;
    }
    printResult(stdout, args, true, result.data, undefined, () => `amended ${result.data.id}`);
    return 0;
  }

  if (sub === "report" || sub === "export") {
    const since = flagString(args.flags, "since") || undefined;
    const until = flagString(args.flags, "until") || undefined;
    const external = Boolean(args.flags?.external);
    const project = flagString(args.flags, "project") || undefined;
    const all = Boolean(args.flags?.all);

    if (all) {
      if (!home) {
        printResult(stdout, args, false, undefined, { code: "no-home", message: "HOME is unset" });
        return 1;
      }
      const cfg = loadConfig(home);
      let bindings;
      try {
        bindings = loadBindings(home);
      } catch (err) {
        printResult(stdout, args, false, undefined, {
          code: "bindings",
          message: err instanceof Error ? err.message : String(err),
        });
        return 1;
      }
      const seen = new Set();
      /** @type {Array<{ id: string, name?: string, report: object }>} */
      const chunks = [];
      for (const b of bindings.bindings) {
        if (!b.id || seen.has(b.id)) continue;
        seen.add(b.id);
        const feat = cfg.features.track;
        const on = feat
          ? feat.off.includes(b.id)
            ? false
            : feat.on.includes(b.id) || feat.default === "on"
          : false;
        if (!on) continue;
        const root = pulseRootForBinding(home, b) || projectSliceDir(home, b.id);
        const rep = reportTime(root, {
          since,
          until,
          external,
          project,
          bundleId: b.id,
          gitRoot: where.gitRoot,
          env: args.env ?? process.env,
        });
        if (rep.ok) chunks.push({ id: b.id, name: b.name, report: rep.data });
      }
      if (sub === "export") {
        return writeExport(stdout, args, chunks, {
          external,
          project,
          all: true,
          cwd: args.cwd ?? process.cwd(),
          gitRoot: where.gitRoot,
        });
      }
      printResult(stdout, args, true, { chunks }, undefined, () =>
        chunks.map((c) => `${c.name || c.id}: wall ${c.report.wall} billable ${c.report.billable}`).join("\n"),
      );
      return 0;
    }

    const rep = reportTime(where.root, {
      since,
      until,
      external,
      project,
      bundleId: uuid,
      gitRoot: where.gitRoot,
      env: args.env ?? process.env,
    });
    if (!rep.ok) {
      printResult(stdout, args, false, undefined, rep.error);
      return 1;
    }
    if (sub === "export") {
      return writeExport(stdout, args, [{ id: uuid, name: where.id, report: rep.data }], {
        external,
        project,
        all: false,
        cwd: args.cwd ?? process.cwd(),
        gitRoot: where.gitRoot,
      });
    }
    printResult(
      stdout,
      args,
      true,
      rep.data,
      undefined,
      (d) => `wall ${d.wall}  billable ${d.billable}${d.overlap?.length ? "\nwarn: overlapping intervals" : ""}`,
    );
    return 0;
  }

  printResult(stdout, args, false, undefined, {
    code: "usage",
    message: "mental track [glance|start|stop|focus|discard|amend|report|export]",
  });
  return EXIT_USAGE;
}

function writeExport(stdout, args, chunks, { external, project, all, cwd, gitRoot }) {
  const format = flagString(args.flags, "format") || "csv";
  if (format !== "csv" && format !== "md") {
    printResult(stdout, args, false, undefined, { code: "usage", message: "--format md|csv" });
    return EXIT_USAGE;
  }
  const out = flagString(args.flags, "out");
  const dest = assertExportOutPath(out, { cwd, gitRoot });
  if (!dest.ok) {
    printResult(stdout, args, false, undefined, dest.error);
    return 1;
  }
  if (all && external && format === "csv" && !project) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message:
        "a single customer CSV requires --project <name>; without it print per-UUID banners and do not emit one mixed invoice",
    });
    return EXIT_USAGE;
  }
  const skippedNeedsExternal = chunks.reduce(
    (total, chunk) => total + Number(chunk.report.skippedNeedsExternal || 0),
    0,
  );
  const intervalIds = chunks.flatMap((chunk) => chunk.report.review?.interval_ids || []);
  const review = intervalIds.length
    ? {
        kind: "customer-copy",
        interval_ids: intervalIds,
        questions: chunks.find((chunk) => chunk.report.review)?.report.review.questions || [],
      }
    : null;
  if (external && review) {
    printResult(stdout, args, false, undefined, {
      code: "needs-customer-copy",
      message: `${skippedNeedsExternal} time ${skippedNeedsExternal === 1 ? "entry needs" : "entries need"} customer-ready copy`,
      review,
    });
    return 1;
  }
  let body = "";
  if (all && !project) {
    body = chunks
      .map((c) => renderExport({ rows: c.report.rows, external, format, banner: c.name || c.id }))
      .join("\n");
  } else {
    const rows = chunks.flatMap((c) => c.report.rows);
    body = renderExport({ rows, external, format });
  }
  mkdirSync(dirname(dest.abs), { recursive: true });
  writeFileSync(dest.abs, body);
  printResult(
    stdout,
    args,
    true,
    {
      out: dest.abs,
      rows: chunks.reduce((n, c) => n + c.report.rows.length, 0),
      skippedNeedsExternal,
    },
    undefined,
    () => kindLine("note", "exported"),
  );
  return 0;
}
