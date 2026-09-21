/**
 * `mental install` — copy skill + tiny rule to user agent dirs; ~/.mental skeleton.
 * `--project` is project-only (no home recopy). `--hooks` and `--mcp` are optional and default off.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { userMentalDir } from "../lib/bindings.mjs";
import { ensureSkeleton } from "../lib/okf.mjs";
import { installSkills } from "../lib/install-skills.mjs";
import { enableHooks } from "../lib/hooks.mjs";
import { enableMcp } from "../lib/mcp-hosts.mjs";
import { CMD } from "../lib/pkg.mjs";
import { printResult, brandLine, EXIT_IO } from "../lib/output.mjs";
import { FEATURES, listOptionals, markOptionalSeen, setFeature } from "../lib/config.mjs";
import { formatOptionalsTable } from "./option.mjs";
import { copyTrackSkills } from "../lib/install-skills.mjs";
import { purgeBalakitMental } from "../lib/legacy-balakit.mjs";

export function cmdInstall(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args, false, undefined, {
      code: "no-home",
      message: "HOME is unset; refusing to install. Mental fails open — continue coding.",
    });
    return 1;
  }

  const projectOnly = Boolean(args.flags?.project);
  const force = Boolean(args.flags?.force);
  const hooks = Boolean(args.flags?.hooks);
  const mcp = Boolean(args.flags?.mcp);
  const track = Boolean(args.flags?.track);
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;

  const legacy = purgeBalakitMental({
    home,
    projectDir: cwd,
  });
  const installed = installSkills({
    home,
    projectDir: projectOnly ? cwd : null,
    homeInstall: !projectOnly,
    force,
  });
  const personal = userMentalDir(home);
  if (!projectOnly) ensureSkeleton(personal, { name: "personal" });

  let hookResult = null;
  let mcpResult = null;
  let resolved = { ok: false, data: null };
  let imported = null;
  let trackResult = null;
  let optionals = { optionals: [] };

  if (!projectOnly) {
    if (hooks) {
      hookResult = enableHooks(home);
      setFeature(home, "hooks", "on", { all: true });
    }
    if (mcp) {
      mcpResult = enableMcp(home);
      setFeature(home, "mcp", "on", { all: true });
    }
    resolved = resolveBundle({
      cwd,
      home,
      env,
      dir: args.dir ?? null,
      write: true,
    });
    imported = resolved.ok ? resolved.data.imported : null;
    if (track && resolved.ok && resolved.data.id) {
      trackResult = setFeature(home, "track", "on", { uuid: resolved.data.id });
      if (trackResult.ok) copyTrackSkills(home, { force });
    }
    optionals = listOptionals(home, resolved.ok ? resolved.data.id : null);
    for (const id of FEATURES) markOptionalSeen(home, id);
  }

  const data = {
    home,
    personalRoot: projectOnly ? null : personal,
    skills: installed.written,
    written: installed.written,
    skipped: installed.skipped,
    failed: installed.failed,
    project: projectOnly ? `${cwd}/.github/skills/mental` : null,
    hooks: hookResult,
    mcp: mcpResult,
    track: trackResult,
    optionals: optionals.optionals,
    where: resolved.ok ? resolved.data : null,
    imported: imported || null,
    legacyRemoved: legacy.removed,
    legacyLeftover: legacy.leftover,
  };
  const ok = installed.failed.length === 0;
  const importLine =
    imported?.copied?.length
      ? `\nimported ${imported.copied.length} leftover file(s) from ${imported.from}`
      : "";
  const hookLine = hooks && !projectOnly ? "\nhooks: enabled (session-start → mental status --json)" : "";
  const mcpLine =
    mcp && !projectOnly
      ? mcpResult?.ok
        ? `\nMCP: ${CMD} serve registered in ${mcpResult.written.join(", ")}`
        : `\nMCP: config write failed (${mcpResult?.error?.message ?? "unknown"}) — add \`${CMD} serve\` manually`
      : "";
  const legacyLine = legacy.removed.length
    ? `\nremoved ${legacy.removed.length} Balakit Mental leftover(s)`
    : "";
  const leftoverLine =
    legacy.leftover.length
      ? `\nstill mixed Balakit block(s) (Mental text inside a kit block): ${legacy.leftover.join(", ")}`
      : "";
  const failLine = installed.failed.length
    ? `\nfailed ${installed.failed.length} dest(s)`
    : "";
  printResult(
    stdout,
    args,
    ok,
    data,
    ok
      ? undefined
      : {
          code: installed.failed[0]?.code || "install",
          message: `install failed ${installed.failed.length} dest(s)`,
          path: installed.failed[0]?.path,
          hint: "target not writable — if you are a sandboxed agent, widen file permissions or rerun unsandboxed",
        },
    () =>
      `${brandLine(`installed skill + rule (${installed.written.length} paths)`)}\n${projectOnly ? "project dests only" : `~/.mental skeleton: ${personal}`}${hookLine}${mcpLine}${importLine}${legacyLine}${leftoverLine}${failLine}${projectOnly ? "" : `\n${formatOptionalsTable(optionals.optionals)}`}`,
  );
  if (!ok) return EXIT_IO;
  return 0;
}
