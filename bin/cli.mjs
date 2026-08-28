#!/usr/bin/env node
/**
 * mental — local-first OKF continuity CLI.
 *
 * Layers (never invert): OKF files → resolver → CLI → index → skill/rule.
 * Agents use --json. They must not grep YAML.
 */
import { isCliEntry } from "./lib/entry.mjs";
import { parseArgv, usage, formatUsageShort, formatCommandHelp } from "./lib/args.mjs";
import { VERSION } from "./lib/pkg.mjs";
import { printResult, EXIT_USAGE } from "./lib/output.mjs";
import {
  DAILY_COMMANDS,
  getCommand,
  legalFlagHint,
  suggestCommands,
} from "./lib/catalog.mjs";
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
import { cmdAttention } from "./commands/attention.mjs";
import { cmdRemap } from "./commands/remap.mjs";
import { cmdSplit } from "./commands/split.mjs";
import { cmdLink } from "./commands/link.mjs";
import { cmdUninstall } from "./commands/uninstall.mjs";
import { cmdHooks } from "./commands/hooks.mjs";
import { cmdServe } from "./commands/serve.mjs";
import { cmdPark } from "./commands/park.mjs";
import { cmdHandoff } from "./commands/handoff.mjs";
import { cmdPulse } from "./commands/pulse.mjs";
import { cmdOption } from "./commands/option.mjs";
import { cmdTrack } from "./commands/track.mjs";
import { cmdSchema } from "./commands/schema.mjs";
import { cmdCompletion } from "./commands/completion.mjs";

export { parseArgv } from "./lib/args.mjs";
export { normalizeOrigin, findGitRoot } from "./lib/git.mjs";
export { resolveBundle, findLocalMental } from "./lib/resolve.mjs";
export { resolveOrCreateBinding, loadBindings } from "./lib/bindings.mjs";
export { cmdWhere } from "./commands/where.mjs";
export { cmdStatus } from "./commands/status.mjs";

export const COMMANDS = {
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
  heartbeat: cmdHeartbeat,
  attention: cmdAttention,
  remap: cmdRemap,
  split: cmdSplit,
  new: cmdSplit,
  link: cmdLink,
  uninstall: cmdUninstall,
  hooks: cmdHooks,
  serve: cmdServe,
  park: cmdPark,
  handoff: cmdHandoff,
  pulse: cmdPulse,
  option: cmdOption,
  track: cmdTrack,
  schema: cmdSchema,
  completion: cmdCompletion,
};

function dailyHint() {
  return `Daily: ${DAILY_COMMANDS.join(", ")}. See mental --help.`;
}

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

  const args = parseArgv(argv);
  const io = { stdout, stderr, stdin: ctx.stdin ?? process.stdin, isTTY };
  const ctxArgs = { ...args, cwd, home, env, stderr };
  const humanTty = isTTY && !args.json;

  if (args.version && !args.command && !args.help) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  const helpTarget =
    args.command === "help" ? args.rest[0] || null : args.help ? args.command : null;
  if (args.help || args.command === "help") {
    if (helpTarget && helpTarget !== "help") {
      const text = formatCommandHelp(helpTarget);
      if (!text) {
        printResult(stdout, ctxArgs, false, undefined, {
          code: "unknown-command",
          message: `Unknown command: ${helpTarget}`,
          hint: dailyHint(),
        });
        return 1;
      }
      stdout.write(text);
      return 0;
    }
    stdout.write(args.helpLong || args.command === "help" || !args.help ? usage() : formatUsageShort());
    return 0;
  }

  if (args.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (args.parseError) {
    printResult(stdout, ctxArgs, false, undefined, {
      code: "usage",
      message: args.parseError,
      hint: args.command ? legalFlagHint(args.command) : dailyHint(),
    });
    return EXIT_USAGE;
  }

  if (args.unknownFlags.length) {
    const flag = args.unknownFlags[0];
    printResult(stdout, ctxArgs, false, undefined, {
      code: "unknown-flag",
      message: `Unknown flag: --${flag}`,
      hint: args.command ? legalFlagHint(args.command) : dailyHint(),
    });
    return EXIT_USAGE;
  }

  if (!args.command) {
    if (args.json) return cmdHeartbeat(ctxArgs, io);
    if (humanTty) return cmdHeartbeat(ctxArgs, io);
    stdout.write(usage());
    return EXIT_USAGE;
  }

  const handler = COMMANDS[args.command];
  if (!handler) {
    const suggestions = suggestCommands(args.command);
    printResult(stdout, ctxArgs, false, undefined, {
      code: "unknown-command",
      message: `Unknown command: ${args.command}`,
      hint: humanTty && suggestions.length ? `Did you mean: ${suggestions.join(", ")}? ${dailyHint()}` : dailyHint(),
    });
    return 1;
  }

  if (!getCommand(args.command)) {
    printResult(stdout, ctxArgs, false, undefined, {
      code: "unknown-command",
      message: `Unknown command: ${args.command}`,
      hint: dailyHint(),
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
