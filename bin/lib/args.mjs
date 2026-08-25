/**
 * Shared CLI argument helpers and usage text.
 */
import { CMD, VERSION } from "./pkg.mjs";

export function usage() {
  return `${CMD} v${VERSION} — local-first OKF continuity

Usage:
  ${CMD}                       Heartbeat (TTY): resume, last outcome, git, open decisions
  ${CMD} where                 Active bundle (root, id, mode) — read-only
  ${CMD} status                Git + latest Resume + open decisions + notes
  ${CMD} search <q>            Query notes/journal/decisions (sqlite or scan)
  ${CMD} list                  List concepts (--type --status --tag)
  ${CMD} show <path>           One file, relative to the bundle root
  ${CMD} journal               Append today's journal section
  ${CMD} decide                Scaffold a decision file
  ${CMD} note                  Scaffold a note
  ${CMD} local                 Create ./.mental after ignore check (--import copies home, --move switches store)
  ${CMD} remap                 List UUID bindings, or --to <id> / --from <id> for this clone
  ${CMD} split                 New UUID for this clone (--copy keeps OKF files)
  ${CMD} link                  Point this clone at --to <id>
  ${CMD} install               Skill + rule + put ${CMD} on PATH (overrides previous)
  ${CMD} uninstall             Remove installed skill/rule/hooks (OKF stays unless --delete-data DELETE)
  ${CMD} hooks on|off          Optional session-start hooks (default off)
  ${CMD} serve                 Optional MCP stdio (where/status/search/show/journal)
  ${CMD} doctor                PATH, bindings, ignore, skill, index
  ${CMD} reindex               Rebuild derived sqlite index from OKF files

TTY: no args prints a one-shot heartbeat and exits. Named commands are one-shot.
Non-TTY / agents: always pass --json. Do not grep OKF / YAML.

Global flags:
  --json             Machine-readable { ok, data } | { ok, error }
  --dir <path>       Override resolve (same as MENTAL_DIR)
  -h, --help         Show this help
  -v, --version      Print version

Privacy: default store is ~/.mental (never commit). Project ./.mental
only after \`${CMD} local\`. Leftover ./.mental is normalized into
~/.mental/projects/<uuid> and indexed (source is not deleted).
Never store secrets.
`;
}

/**
 * Parse argv into a structured args object.
 * Global flags may appear before or after the command.
 *
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  const args = {
    command: null,
    json: false,
    dir: undefined,
    help: false,
    version: false,
    /** @type {string[]} */
    rest: [],
    /** @type {Record<string, string | boolean>} */
    flags: {},
  };

  const takesValue = new Set([
    "--dir",
    "--title",
    "--body",
    "--resume",
    "--status",
    "--slug",
    "--description",
    "--from",
    "--to",
    "--type",
    "--tag",
    "--confirm",
  ]);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      args.help = true;
    } else if (a === "-v" || a === "--version") {
      args.version = true;
    } else if (a === "--json") {
      args.json = true;
    } else if (a === "--dir") {
      const v = argv[++i];
      if (v == null) throw new Error("--dir requires a path");
      args.dir = v;
    } else if (takesValue.has(a)) {
      const v = argv[++i];
      if (v == null) throw new Error(`${a} requires a value`);
      args.flags[a.slice(2)] = v;
    } else if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      const key = a.slice(2, eq);
      args.flags[key] = a.slice(eq + 1);
      if (key === "dir") args.dir = a.slice(eq + 1);
      if (key === "json") args.json = true;
    } else if (a.startsWith("--")) {
      args.flags[a.slice(2)] = true;
    } else if (!args.command) {
      args.command = a;
    } else {
      args.rest.push(a);
    }
  }

  return args;
}
