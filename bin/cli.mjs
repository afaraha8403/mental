#!/usr/bin/env node
/**
 * mental — local-first OKF continuity CLI.
 *
 * Layers (never invert): OKF files → resolver → CLI → index → skill/rule.
 * Agents use --json. They must not grep YAML.
 */
import { isCliEntry } from "./lib/entry.mjs";
import { parseArgv, usage } from "./lib/args.mjs";
import { VERSION } from "./lib/pkg.mjs";
import { printResult } from "./lib/output.mjs";
import { cmdWhere } from "./commands/where.mjs";
import { cmdStatus } from "./commands/status.mjs";
import { cmdJournal } from "./commands/journal.mjs";
import { cmdDecide } from "./commands/decide.mjs";
import { cmdNote } from "./commands/note.mjs";
import { cmdInstall } from "./commands/install.mjs";
import { cmdDoctor } from "./commands/doctor.mjs";
import { cmdLocal } from "./commands/local.mjs";
import { cmdSearch } from "./commands/search.mjs";
import { cmdReindex } from "./commands/reindex.mjs";
import { cmdList } from "./commands/list.mjs";
import { cmdShow } from "./commands/show.mjs";
import { cmdHeartbeat } from "./commands/heartbeat.mjs";
import { cmdRemap } from "./commands/remap.mjs";
import { cmdSplit } from "./commands/split.mjs";
import { cmdLink } from "./commands/link.mjs";
import { cmdUninstall } from "./commands/uninstall.mjs";
import { cmdHooks } from "./commands/hooks.mjs";
import { cmdServe } from "./commands/serve.mjs";

export { parseArgv } from "./lib/args.mjs";
export { normalizeOrigin, findGitRoot } from "./lib/git.mjs";
export { resolveBundle, findLocalMental } from "./lib/resolve.mjs";
export { resolveOrCreateBinding, loadBindings } from "./lib/bindings.mjs";
export { cmdWhere } from "./commands/where.mjs";
export { cmdStatus } from "./commands/status.mjs";

const COMMANDS = {
  where: cmdWhere,
  status: cmdStatus,
  journal: cmdJournal,
  decide: cmdDecide,
  note: cmdNote,
  install: cmdInstall,
  doctor: cmdDoctor,
  local: cmdLocal,
  search: cmdSearch,
  reindex: cmdReindex,
  list: cmdList,
  show: cmdShow,
  remap: cmdRemap,
  split: cmdSplit,
  new: cmdSplit,
  link: cmdLink,
  uninstall: cmdUninstall,
  hooks: cmdHooks,
  serve: cmdServe,
};

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, home?: string, env?: NodeJS.ProcessEnv, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, stdin?: NodeJS.ReadableStream, isTTY?: boolean }} [ctx]
 * @returns {Promise<number>}
 */
export async function run(argv, ctx = {}) {
  const stdout = ctx.stdout ?? process.stdout;
  const stderr = ctx.stderr ?? process.stderr;
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();
  const home = ctx.home ?? env.HOME ?? env.USERPROFILE ?? null;
  const isTTY = ctx.isTTY ?? Boolean(stdout.isTTY);

  let args;
  try {
    args = parseArgv(argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printResult(stdout, argv.includes("--json"), false, undefined, {
      code: "usage",
      message,
    });
    return 1;
  }

  if (args.version && !args.command) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (args.help || args.command === "help") {
    stdout.write(usage());
    return 0;
  }
  if (args.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  const io = { stdout, stderr, stdin: ctx.stdin ?? process.stdin };
  const ctxArgs = { ...args, cwd, home, env };
  const humanTty = isTTY && !args.json;

  if (!args.command) {
    if (humanTty) return cmdHeartbeat(ctxArgs, io);
    stdout.write(usage());
    return 2;
  }

  const handler = COMMANDS[args.command];
  if (!handler) {
    printResult(stdout, args.json, false, undefined, {
      code: "unknown-command",
      message: `Unknown command: ${args.command}`,
    });
    return 1;
  }

  const result = handler(ctxArgs, io);
  return await Promise.resolve(result);
}

async function main() {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}

if (isCliEntry(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
