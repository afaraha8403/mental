/**
 * `mental install` — copy skill + tiny rule to user agent dirs; ~/.mental skeleton.
 * `--hooks` and `--mcp` are optional and default off.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { userMentalDir } from "../lib/bindings.mjs";
import { ensureSkeleton } from "../lib/okf.mjs";
import { installSkills } from "../lib/install-skills.mjs";
import { installGlobalCli, spawnCli } from "../lib/install-cli.mjs";
import { enableHooks } from "../lib/hooks.mjs";
import { enableMcp } from "../lib/mcp-hosts.mjs";
import { CMD, NAME, VERSION } from "../lib/pkg.mjs";
import { printResult, brandLine } from "../lib/output.mjs";
import { FEATURES, listOptionals, markOptionalSeen, setFeature } from "../lib/config.mjs";
import { formatOptionalsTable } from "./option.mjs";
import { copyTrackSkills } from "../lib/install-skills.mjs";
import { purgeBalakitMental } from "../lib/legacy-balakit.mjs";
import { checkForUpdate, cmpSemver, isDevCheckout } from "../lib/update.mjs";

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

  const project = Boolean(args.flags?.project);
  const hooks = Boolean(args.flags?.hooks);
  const mcp = Boolean(args.flags?.mcp);
  const track = Boolean(args.flags?.track);
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  const stderr = io.stderr ?? process.stderr;

  if (env.MENTAL_SKIP_SELF_UPDATE !== "1" && !isDevCheckout()) {
    const upd = checkForUpdate({ env });
    if (upd.latest && cmpSemver(upd.latest, VERSION) > 0) {
      const bumped = installGlobalCli({ home, env, spec: NAME });
      if (bumped.npm && bumped.script) {
        if (!args.json) {
          stdout.write(`${brandLine(`updating CLI ${VERSION} → ${upd.latest}`)}\n`);
        }
        const childArgs = ["install"];
        if (args.json) childArgs.push("--json");
        if (project) childArgs.push("--project");
        if (hooks) childArgs.push("--hooks");
        if (mcp) childArgs.push("--mcp");
        if (track) childArgs.push("--track");
        if (args.dir) childArgs.push("--dir", args.dir);
        const child = spawnCli(bumped.script, childArgs, {
          encoding: "utf8",
          cwd,
          env: { ...env, MENTAL_SKIP_SELF_UPDATE: "1", MENTAL_SKIP_UPDATE_CHECK: "1" },
        });
        if (child.stdout) stdout.write(child.stdout);
        if (child.stderr) stderr.write(child.stderr);
        return child.status ?? 1;
      }
    }
  }

  const legacy = purgeBalakitMental({
    home,
    projectDir: cwd,
  });
  const installed = installSkills({
    home,
    projectDir: project ? cwd : null,
  });
  const cli = installGlobalCli({ home, env });
  const personal = userMentalDir(home);
  ensureSkeleton(personal, { name: "personal" });

  let hookResult = null;
  if (hooks) {
    hookResult = enableHooks(home);
    setFeature(home, "hooks", "on", { all: true });
  }

  let mcpResult = null;
  if (mcp) {
    mcpResult = enableMcp(home);
    setFeature(home, "mcp", "on", { all: true });
  }

  const resolved = resolveBundle({
    cwd,
    home,
    env,
    dir: args.dir ?? null,
    write: true,
  });

  const imported = resolved.ok ? resolved.data.imported : null;
  let trackResult = null;
  if (track && resolved.ok && resolved.data.id) {
    trackResult = setFeature(home, "track", "on", { uuid: resolved.data.id });
    if (trackResult.ok) copyTrackSkills(home);
  }
  const optionals = listOptionals(home, resolved.ok ? resolved.data.id : null);
  for (const id of FEATURES) markOptionalSeen(home, id);

  const data = {
    home,
    personalRoot: personal,
    skills: installed.written,
    cli,
    project: project ? `${cwd}/.github/skills/mental` : null,
    hooks: hookResult,
    mcp: mcpResult,
    track: trackResult,
    optionals: optionals.optionals,
    where: resolved.ok ? resolved.data : null,
    imported: imported || null,
    legacyRemoved: legacy.removed,
    legacyLeftover: legacy.leftover,
  };
  const importLine =
    imported?.copied?.length
      ? `\nimported ${imported.copied.length} leftover file(s) from ${imported.from}`
      : "";
  const cliLine = cli.bin ? `\nCLI: ${cli.bin}` : "";
  const hookLine = hooks ? "\nhooks: enabled (session-start → mental status --json)" : "";
  const mcpLine = mcp
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
  printResult(
    stdout,
    args,
    true,
    data,
    undefined,
    () =>
      `${brandLine(`installed skill + rule (${installed.written.length} paths)`)}\n~/.mental skeleton: ${personal}${cliLine}${hookLine}${mcpLine}${importLine}${legacyLine}${leftoverLine}\n${formatOptionalsTable(optionals.optionals)}`,
  );
  return 0;
}
