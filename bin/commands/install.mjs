/**
 * `mental install` — copy skill + tiny rule to user agent dirs; ~/.mental skeleton.
 * `--hooks` and `--mcp` are optional and default off.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { userMentalDir } from "../lib/bindings.mjs";
import { ensureSkeleton } from "../lib/okf.mjs";
import { installSkills } from "../lib/install-skills.mjs";
import { installGlobalCli } from "../lib/install-cli.mjs";
import { enableHooks } from "../lib/hooks.mjs";
import { enableMcp } from "../lib/mcp.mjs";
import { CMD } from "../lib/pkg.mjs";
import { printResult, brandLine } from "../lib/output.mjs";
import { purgeBalakitMental } from "../lib/legacy-balakit.mjs";

export function cmdInstall(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args.json, false, undefined, {
      code: "no-home",
      message: "HOME is unset; refusing to install. Mental fails open — continue coding.",
    });
    return 1;
  }

  const project = Boolean(args.flags?.project);
  const hooks = Boolean(args.flags?.hooks);
  const mcp = Boolean(args.flags?.mcp);
  const cwd = args.cwd ?? process.cwd();

  const legacy = purgeBalakitMental({
    home,
    projectDir: cwd,
  });
  const installed = installSkills({
    home,
    projectDir: project ? cwd : null,
  });
  const cli = installGlobalCli({ home, env: args.env ?? process.env });
  const personal = userMentalDir(home);
  ensureSkeleton(personal, { name: "personal" });

  let hookResult = null;
  if (hooks) hookResult = enableHooks(home);

  let mcpResult = null;
  if (mcp) mcpResult = enableMcp(home);

  const resolved = resolveBundle({
    cwd,
    home,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: true,
  });

  const imported = resolved.ok ? resolved.data.imported : null;
  const data = {
    home,
    personalRoot: personal,
    skills: installed.written,
    cli,
    project: project ? `${cwd}/.github/skills/mental` : null,
    hooks: hookResult,
    mcp: mcpResult,
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
    args.json,
    true,
    data,
    undefined,
    () =>
      `${brandLine(`installed skill + rule (${installed.written.length} paths)`)}\n~/.mental skeleton: ${personal}${cliLine}${hookLine}${mcpLine}${importLine}${legacyLine}${leftoverLine}`,
  );
  return 0;
}
