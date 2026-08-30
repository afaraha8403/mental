/**
 * `mental status` — derive git + latest Resume + open/deferred decisions + notes.
 * Writes `status/current.md` as a disposable cache. OKF files remain SoT.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBundle } from "../lib/resolve.mjs";
import { gitSnapshot } from "../lib/git.mjs";
import {
  bundleName,
  ensureSkeleton,
  latestJournalHandoff,
  listNotes,
  listOpenAttention,
  listOpenDecisions,
  localDate,
  renderStatus,
} from "../lib/okf.mjs";
import { printResult } from "../lib/output.mjs";

function formatGit(git, gitRoot) {
  if (!gitRoot) return "Not a git repository.";
  const branch = git.branch || "(unknown branch)";
  const dirty = git.dirty ? "uncommitted changes" : "clean";
  const recent = git.recent.length ? git.recent.map((l) => `  ${l}`).join("\n") : "  (no commits)";
  return `${branch}; ${dirty}\n${recent}`;
}

function formatHuman(data) {
  const airItems = data.attention.filter((a) => a.status !== "later");
  const laterItems = data.attention.filter((a) => a.status === "later");
  const formatAtt = (a) => {
    const tag = a.kind || a.status;
    return `  - [${tag}] ${a.title} (${a.path})`;
  };
  const air = airItems.length === 0 ? "  none" : airItems.map(formatAtt).join("\n");
  const later = laterItems.length === 0 ? "  none" : laterItems.map(formatAtt).join("\n");
  const dec =
    data.openDecisions.length === 0
      ? "  none"
      : data.openDecisions.map((d) => `  - [${d.status}] ${d.title} (${d.path})`).join("\n");
  const notes =
    data.notes.length === 0
      ? "  none"
      : data.notes.map((n) => `  - ${n.title} (${n.path})`).join("\n");
  const laterBlock = laterItems.length ? [`later:`, later] : [];
  return [
    `root:    ${data.root}`,
    `mode:    ${data.mode}`,
    `git:     ${data.git.branch || "—"} ${data.git.dirty ? "(dirty)" : "(clean)"}`,
    `resume:  ${data.resume || "—"}`,
    `against: ${data.against || "—"}`,
    `now:     ${data.latestOutcome || "—"}`,
    `in the air:`,
    air,
    ...laterBlock,
    `unsettled:`,
    dec,
    `notes:`,
    notes,
  ].join("\n");
}

/**
 * @param {{ json: boolean, dir?: string, cwd?: string, home?: string, env?: NodeJS.ProcessEnv }} args
 * @returns {number}
 */
export function cmdStatus(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
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

  const { data: where } = resolved;
  const now = new Date();
  ensureSkeleton(where.root, { name: bundleName(where.root, where.id || "project"), now });
  const git = gitSnapshot(where.gitRoot, { env: args.env ?? process.env });
  const handoff = latestJournalHandoff(where.root);
  const openDecisions = listOpenDecisions(where.root);
  const attention = listOpenAttention(where.root);
  const notes = listNotes(where.root);
  const name = bundleName(where.root, where.id || "project");
  const inFlight = formatGit(git, where.gitRoot);
  const resume = handoff.resume || "No journal yet — start work, then `mental journal` at the task boundary.";
  const latestOutcome = handoff.outcome || "No journal sections yet.";
  const against = handoff.against || null;

  writeFileSync(
    join(where.root, "status", "current.md"),
    renderStatus({
      name,
      date: localDate(now),
      ts: now.toISOString(),
      now: latestOutcome,
      inFlight,
      decisions: openDecisions.map((d) => ({
        title: d.title,
        file: d.file,
        status: d.status,
      })),
      attention: attention.map((a) => ({
        title: a.title,
        file: a.file,
        status: a.status,
        kind: a.kind,
      })),
      notes: notes.map((n) => ({
        title: n.title,
        file: n.file,
        status: n.status,
        description: n.description,
      })),
      resume,
      against,
    }),
  );

  const payload = {
    ...where,
    git: { branch: git.branch, dirty: git.dirty, recent: git.recent },
    resume,
    latestOutcome,
    against,
    attention,
    openDecisions,
    notes,
    statusFile: "status/current.md",
  };
  printResult(stdout, args, true, payload, undefined, formatHuman);
  return 0;
}
