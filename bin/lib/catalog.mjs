/**
 * Single command catalog: help, schema, parse known flags, completions, MCP subset.
 * Do not hand-maintain a second flag list in args.mjs.
 */
import { CMD } from "./pkg.mjs";

/** @typedef {"Daily" | "Lookup" | "Write" | "Identity" | "Setup"} CatalogGroup */
/** @typedef {"read_only" | "idempotent" | "non_idempotent"} CatalogEffect */
/**
 * @typedef {{
 *   name: string,
 *   takesValue?: boolean | "optional",
 *   required?: boolean,
 *   enum?: string[],
 *   summary?: string,
 *   mcpName?: string,
 * }} CatalogFlag
 */
/**
 * @typedef {{
 *   name: string,
 *   group: CatalogGroup,
 *   summary: string,
 *   usage: string,
 *   examples: string[],
 *   flags: CatalogFlag[],
 *   effects: CatalogEffect,
 *   rest?: { name: string, summary?: string, mcpName?: string, required?: boolean },
 *   mcp?: boolean,
 *   aliasOf?: string,
 * }} CatalogCommand
 */

const v = (name, extra = {}) => ({ name, takesValue: extra.takesValue === undefined ? true : extra.takesValue, ...extra });
const b = (name, extra = {}) => v(name, { takesValue: false, ...extra });

/** Daily names on short `-h` and unknown-command JSON hints. */
export const DAILY_COMMANDS = ["heartbeat", "park", "handoff", "decide", "attention", "search"];

export const GROUP_ORDER = ["Daily", "Lookup", "Write", "Identity", "Setup"];

export const GLOBAL_FLAGS = [
  b("json", { summary: "Machine-readable { ok, data } | { ok, error }" }),
  v("dir", { summary: "Override resolve (same as MENTAL_DIR)" }),
  b("help", { summary: "Command help; with no command, full grouped usage" }),
  b("version", { summary: "Print version" }),
  b("plain", { summary: "No emoji, no ANSI (same as --no-color)" }),
  b("no-color", { summary: "No ANSI; also honored via NO_COLOR and TERM=dumb" }),
];

const FILTER_FLAGS = [
  v("type", { summary: "Concept type (Decision, Attention, Note, Journal)", enum: ["Decision", "Attention", "Note", "Journal"] }),
  v("status", { summary: "Frontmatter status filter" }),
  v("tag", { summary: "Tag filter" }),
  v("kind", { summary: "Attention kind", enum: ["direction", "concern", "thread", "verify"] }),
];

const VIA = v("via", { summary: "Short client token (cursor, claude-code, copilot, codex, mcp, cli). Not a session id." });
const AGAINST = v("against", { summary: "Repo-relative plan path (no ..)" });
const TITLE = v("title", { summary: "OKF title (same title updates)" });
const BODY = v("body", { summary: "Section or file body" });
const RESUME = v("resume", { required: true, summary: "Exact next action — open loops: none or list" });
const PATH = v("path", { summary: "Bundle-relative OKF path" });

/** @type {Record<string, CatalogCommand>} */
export const CATALOG = {
  heartbeat: {
    name: "heartbeat",
    group: "Daily",
    summary: "Cheap in-repo reload: resume, last outcome, git, hops, residue, unsettled + settled. No notes. Does not write the pulse watermark.",
    usage: `${CMD} heartbeat`,
    examples: [`${CMD} heartbeat`, `${CMD} heartbeat --json`, `${CMD} heartbeat --json --fields resume,attention`],
    flags: [v("fields", { takesValue: "optional", summary: "JSON field mask (comma-separated). Omit the value to list legal names." })],
    effects: "read_only",
    mcp: true,
  },
  park: {
    name: "park",
    group: "Daily",
    summary: "Encode at an interruption (default title Parked). Requires --resume. Optional --attention + --kind. Then heartbeat.",
    usage: `${CMD} park --resume <text>`,
    examples: [
      `${CMD} park --resume "Pick up the catalog next — open loops: none"`,
      `${CMD} park --resume "…" --via cursor --json`,
    ],
    flags: [RESUME, v("title", { summary: "Journal title (default Parked)" }), BODY, v("attention", { summary: "Residue title to record with this park" }), v("kind", { enum: ["direction", "concern", "thread", "verify"] }), v("from", { summary: "Who raised the residue" }), AGAINST, VIA],
    effects: "non_idempotent",
    mcp: true,
  },
  handoff: {
    name: "handoff",
    group: "Daily",
    summary: "Planned close: journal then heartbeat. Requires --title and --resume.",
    usage: `${CMD} handoff --title <text> --resume <text>`,
    examples: [
      `${CMD} handoff --title "Catalog landed" --resume "Phase A tests — open loops: none"`,
      `${CMD} handoff --title "…" --resume "…" --via cursor --json`,
    ],
    flags: [v("title", { required: true, summary: "Journal outcome title" }), RESUME, BODY, AGAINST, VIA],
    effects: "non_idempotent",
    mcp: true,
  },
  decide: {
    name: "decide",
    group: "Daily",
    summary: "Create or update a decision. Same title updates; --status decided closes. Not a per-turn reload.",
    usage: `${CMD} decide --title <text>`,
    examples: [
      `${CMD} decide --title "Keep lean MCP" --status decided --via cursor`,
      `${CMD} decide --title "…" --status open --json`,
    ],
    flags: [
      TITLE,
      PATH,
      v("status", { enum: ["open", "deferred", "decided", "superseded"] }),
      v("description"),
      BODY,
      v("slug"),
      VIA,
    ],
    effects: "idempotent",
    mcp: true,
  },
  attention: {
    name: "attention",
    group: "Daily",
    summary: "Create or update residue still in the air. Create needs --title + --kind; close with --status resolved.",
    usage: `${CMD} attention --title <text> --kind <kind>`,
    examples: [
      `${CMD} attention --title "Tom said ship the pointer" --kind direction --from Tom --via cursor`,
      `${CMD} attention --title "…" --status resolved --json`,
    ],
    flags: [
      TITLE,
      PATH,
      v("kind", { enum: ["direction", "concern", "thread", "verify"] }),
      v("status", { enum: ["open", "later", "resolved"] }),
      v("from"),
      v("description"),
      BODY,
      v("slug"),
      AGAINST,
      VIA,
    ],
    effects: "idempotent",
    mcp: true,
  },
  search: {
    name: "search",
    group: "Daily",
    summary: "Query notes/journal/decisions/attention (sqlite or scan). After --, remainder is the query (including leading dashes).",
    usage: `${CMD} search <q>`,
    examples: [`${CMD} search overlay`, `${CMD} search --json "lean MCP"`, `${CMD} search -- -label`],
    flags: FILTER_FLAGS,
    effects: "read_only",
    rest: { name: "q", summary: "Search query", mcpName: "q", required: true },
    mcp: true,
  },
  where: {
    name: "where",
    group: "Lookup",
    summary: "Active bundle identity only (root, id, mode). Read-only. Does not mint a binding.",
    usage: `${CMD} where`,
    examples: [`${CMD} where`, `${CMD} where --json`],
    flags: [],
    effects: "read_only",
    mcp: true,
  },
  status: {
    name: "status",
    group: "Lookup",
    summary: "Heartbeat plus notes. Writes status/current.md; first write can mint identity. The notes dump — not a per-turn reload.",
    usage: `${CMD} status`,
    examples: [`${CMD} status`, `${CMD} status --json`],
    flags: [],
    effects: "non_idempotent",
    mcp: true,
  },
  pulse: {
    name: "pulse",
    group: "Lookup",
    summary: "Cross-project compact rows from bindings.json (id, name, resume, counts). No journal bodies. Writes the pulse watermark. Orchestration, not a peer of heartbeat.",
    usage: `${CMD} pulse`,
    examples: [`${CMD} pulse`, `${CMD} pulse --json`],
    flags: [],
    effects: "non_idempotent",
    mcp: true,
  },
  list: {
    name: "list",
    group: "Lookup",
    summary: "List OKF concepts with typed frontmatter filters (no query). Default cap 50; JSON includes truncated and total.",
    usage: `${CMD} list`,
    examples: [`${CMD} list --type Decision --status open`, `${CMD} list --json --kind verify`],
    flags: FILTER_FLAGS,
    effects: "read_only",
    mcp: true,
  },
  show: {
    name: "show",
    group: "Lookup",
    summary: "Read one OKF file relative to the bundle root (includes backlinks).",
    usage: `${CMD} show <path>`,
    examples: [`${CMD} show notes/some-fact.md`, `${CMD} show --json decisions/2026-08-28-keep-lean-mcp.md`],
    flags: [PATH],
    effects: "read_only",
    rest: { name: "path", summary: "Bundle-relative path", mcpName: "path", required: true },
    mcp: true,
  },
  schema: {
    name: "schema",
    group: "Lookup",
    summary: "Dump the command catalog as JSON (no auth, no network). Optional command name for one entry.",
    usage: `${CMD} schema [command] --json`,
    examples: [`${CMD} schema --json`, `${CMD} schema heartbeat --json`],
    flags: [],
    effects: "read_only",
    rest: { name: "command", summary: "Optional command to describe" },
  },
  journal: {
    name: "journal",
    group: "Write",
    summary: "Append today's journal section (one per task boundary). Requires --title and --resume.",
    usage: `${CMD} journal --title <text> --resume <text>`,
    examples: [
      `${CMD} journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next — open loops: none" --against PLAN.md --via cursor`,
      `${CMD} journal --title "…" --resume "…" --json`,
    ],
    flags: [v("title", { required: true }), RESUME, BODY, AGAINST, VIA],
    effects: "non_idempotent",
    mcp: true,
  },
  note: {
    name: "note",
    group: "Write",
    summary: "Record a durable, non-obvious, repository-specific fact.",
    usage: `${CMD} note --title <text>`,
    examples: [`${CMD} note --title "Identity is a UUID in bindings.json"`, `${CMD} note --title "…" --json`],
    flags: [v("title", { required: true }), v("status", { enum: ["draft", "active", "superseded"] }), v("description"), BODY, v("slug")],
    effects: "idempotent",
    mcp: true,
  },
  local: {
    name: "local",
    group: "Identity",
    summary: "Create ./.mental after ignore check. --import copies home; --move switches store.",
    usage: `${CMD} local`,
    examples: [`${CMD} local`, `${CMD} local --import --json`],
    flags: [b("import"), b("move"), b("delete-home")],
    effects: "non_idempotent",
  },
  remap: {
    name: "remap",
    group: "Identity",
    summary: "List UUID bindings, or --to <id> / --from <id> for this clone.",
    usage: `${CMD} remap`,
    examples: [`${CMD} remap`, `${CMD} remap --to <uuid> --json`],
    flags: [v("to"), v("from")],
    effects: "non_idempotent",
  },
  split: {
    name: "split",
    group: "Identity",
    summary: "New UUID for this clone (--copy keeps OKF files).",
    usage: `${CMD} split`,
    examples: [`${CMD} split`, `${CMD} split --copy --json`],
    flags: [b("copy")],
    effects: "non_idempotent",
  },
  new: {
    name: "new",
    group: "Identity",
    summary: "Alias of split — new UUID for this clone.",
    usage: `${CMD} new`,
    examples: [`${CMD} new --json`],
    flags: [b("copy")],
    effects: "non_idempotent",
    aliasOf: "split",
  },
  link: {
    name: "link",
    group: "Identity",
    summary: "Point this clone at --to <id>.",
    usage: `${CMD} link --to <id>`,
    examples: [`${CMD} link --to <uuid>`],
    flags: [v("to", { required: true })],
    effects: "non_idempotent",
  },
  install: {
    name: "install",
    group: "Setup",
    summary: "Skill + rule + PATH. Optional --hooks / --mcp / --track only after the user says yes this turn.",
    usage: `${CMD} install`,
    examples: [`${CMD} install`, `${CMD} install --json`],
    flags: [b("project"), b("hooks"), b("mcp"), b("track")],
    effects: "idempotent",
  },
  uninstall: {
    name: "uninstall",
    group: "Setup",
    summary: "Remove installed skill/rule/hooks/MCP copies. OKF stays unless --delete-data --confirm DELETE.",
    usage: `${CMD} uninstall`,
    examples: [`${CMD} uninstall`, `${CMD} uninstall --delete-data --confirm DELETE`],
    flags: [b("delete-data"), v("confirm"), b("project")],
    effects: "non_idempotent",
  },
  option: {
    name: "option",
    group: "Setup",
    summary: "List or set optional features (track per-UUID; mcp/hooks user-global). Consent required.",
    usage: `${CMD} option [track|mcp|hooks] on|off`,
    examples: [`${CMD} option`, `${CMD} option track on --json`],
    flags: [b("all"), b("this")],
    effects: "non_idempotent",
    rest: { name: "feature", summary: "track | mcp | hooks, then on|off" },
    mcp: true,
  },
  track: {
    name: "track",
    group: "Setup",
    summary: "Optional wall/user timers (off until option track on). Glance / start / stop / focus / discard / report / export.",
    usage: `${CMD} track [glance|start|stop|focus|discard|amend|report|export]`,
    examples: [`${CMD} track`, `${CMD} track start --title-internal "Catalog" --json`],
    flags: [
      v("title-internal", { mcpName: "title_internal" }),
      v("title-external", { mcpName: "title_external" }),
      v("body-internal", { mcpName: "body_internal" }),
      v("body-external", { mcpName: "body_external" }),
      v("project-name"),
      v("task"),
      v("id"),
      v("user"),
      v("since"),
      v("until"),
      v("out"),
      v("project"),
      v("started"),
      v("format", { enum: ["csv", "md"] }),
      b("all"),
      b("external"),
      b("accept-stale"),
      VIA,
      AGAINST,
    ],
    effects: "non_idempotent",
    rest: { name: "sub", summary: "glance|start|stop|focus|discard|amend|report|export", mcpName: "sub" },
    mcp: true,
  },
  hooks: {
    name: "hooks",
    group: "Setup",
    summary: "Optional session-start hooks (default off). Alias of option hooks on|off.",
    usage: `${CMD} hooks on|off`,
    examples: [`${CMD} hooks on`, `${CMD} hooks off --json`],
    flags: [],
    effects: "non_idempotent",
    rest: { name: "action", summary: "on or off", required: true },
    aliasOf: "option",
  },
  serve: {
    name: "serve",
    group: "Setup",
    summary: "Optional MCP stdio (session verbs). Agents with a shell should prefer mental … --json.",
    usage: `${CMD} serve`,
    examples: [`${CMD} serve`],
    flags: [],
    effects: "read_only",
  },
  doctor: {
    name: "doctor",
    group: "Setup",
    summary: "PATH, bindings, ignore, skill, index, update. Exit 3 when error-level problems; JSON ok follows that.",
    usage: `${CMD} doctor`,
    examples: [`${CMD} doctor`, `${CMD} doctor --json`, `${CMD} doctor --fix-ignore`],
    flags: [b("fix-ignore"), v("days", { summary: "Stale-residue threshold in days (warn only)" })],
    effects: "idempotent",
  },
  reindex: {
    name: "reindex",
    group: "Setup",
    summary: "Rebuild the derived sqlite index from OKF files.",
    usage: `${CMD} reindex`,
    examples: [`${CMD} reindex`, `${CMD} reindex --json`],
    flags: [],
    effects: "idempotent",
  },
  completion: {
    name: "completion",
    group: "Setup",
    summary: "Print a bash, zsh, or fish completion script (stdout). Do not auto-write shell rc files.",
    usage: `${CMD} completion bash|zsh|fish`,
    examples: [`${CMD} completion bash`, `${CMD} completion zsh`],
    flags: [],
    effects: "read_only",
    rest: { name: "shell", summary: "bash, zsh, or fish", required: true },
  },
};

/**
 * @param {string} name
 * @returns {CatalogCommand | undefined}
 */
export function getCommand(name) {
  return CATALOG[name];
}

/**
 * Catalog keys, including aliases.
 * @returns {string[]}
 */
export function catalogNames() {
  return Object.keys(CATALOG);
}

/**
 * Resolve alias to the real catalog entry (hooks → option, new → split).
 * @param {string} name
 */
export function resolveCatalog(name) {
  const c = CATALOG[name];
  if (!c) return undefined;
  if (c.aliasOf && CATALOG[c.aliasOf] && name !== c.aliasOf) {
    return { ...CATALOG[c.aliasOf], name: c.name, aliasOf: c.aliasOf, summary: c.summary, usage: c.usage, examples: c.examples };
  }
  return c;
}

/**
 * Flags legal for a command (globals + command-local). Unknown command → globals only plus union for parse pass-1.
 * @param {string | null} command
 * @returns {CatalogFlag[]}
 */
export function flagsForCommand(command) {
  const local = command && CATALOG[command] ? CATALOG[command].flags : [];
  return [...GLOBAL_FLAGS, ...local];
}

/**
 * Union of every flag name (for parse pass-1, flags before the command).
 * @returns {Map<string, CatalogFlag>}
 */
export function allFlagsByName() {
  /** @type {Map<string, CatalogFlag>} */
  const map = new Map();
  for (const f of GLOBAL_FLAGS) map.set(f.name, f);
  for (const c of Object.values(CATALOG)) {
    for (const f of c.flags) {
      if (!map.has(f.name)) map.set(f.name, f);
    }
  }
  return map;
}

/**
 * @param {string | null} command
 * @returns {Set<string>}
 */
export function knownFlagNames(command) {
  return new Set(flagsForCommand(command).map((f) => f.name));
}

/**
 * Legal flag names for unknown-flag hints.
 * @param {string | null} command
 */
export function legalFlagHint(command) {
  const names = flagsForCommand(command).map((f) => `--${f.name}`);
  return `Legal flags: ${names.join(", ")}`;
}

/**
 * JSON-serializable catalog (mental schema).
 * @param {string} [name]
 */
export function schemaDump(name) {
  const globals = GLOBAL_FLAGS.map(flagPublic);
  if (name) {
    const c = CATALOG[name];
    if (!c) return null;
    return { command: commandPublic(c), globals };
  }
  return {
    globals,
    commands: GROUP_ORDER.flatMap((g) =>
      Object.values(CATALOG)
        .filter((c) => c.group === g)
        .map(commandPublic),
    ),
  };
}

function flagPublic(f) {
  return {
    name: f.name,
    takesValue: f.takesValue === undefined ? true : f.takesValue,
    required: Boolean(f.required),
    enum: f.enum,
    summary: f.summary || "",
  };
}

function commandPublic(c) {
  return {
    name: c.name,
    group: c.group,
    summary: c.summary,
    usage: c.usage,
    examples: c.examples,
    flags: c.flags.map(flagPublic),
    effects: c.effects,
    rest: c.rest || null,
    mcp: Boolean(c.mcp),
    aliasOf: c.aliasOf || null,
  };
}

/**
 * MCP tools from catalog rows with mcp: true (not aliases).
 */
export function mcpToolsFromCatalog() {
  return Object.values(CATALOG)
    .filter((c) => c.mcp && !c.aliasOf)
    .map((c) => ({
      name: c.name,
      description: c.summary,
      inputSchema: mcpInputSchema(c),
    }));
}

/**
 * @param {CatalogCommand} c
 */
export function mcpInputSchema(c) {
  /** @type {Record<string, object>} */
  const properties = {};
  /** @type {string[]} */
  const required = [];
  if (c.rest?.mcpName) {
    properties[c.rest.mcpName] = { type: "string", description: c.rest.summary || c.rest.name };
    if (c.rest.required) required.push(c.rest.mcpName);
  }
  if (c.name === "option") {
    properties.feature = { type: "string", enum: ["track", "hooks", "mcp"] };
    properties.action = { type: "string", enum: ["on", "off"] };
    properties.all = { type: "boolean" };
  }
  for (const f of c.flags) {
    const key = f.mcpName || f.name.replace(/-/g, "_");
    if (properties[key]) continue;
    /** @type {Record<string, unknown>} */
    const prop = { type: f.takesValue === false ? "boolean" : "string" };
    if (f.summary) prop.description = f.summary;
    if (f.enum) prop.enum = f.enum;
    properties[key] = prop;
    if (f.required) required.push(key);
  }
  /** @type {{ type: "object", properties: object, required?: string[] }} */
  const schema = { type: "object", properties };
  if (required.length) schema.required = required;
  return schema;
}

/**
 * Short `-h` (Daily + pointer).
 */
export function formatUsageShort() {
  const lines = [
    `${CMD} — local-first OKF continuity`,
    "",
    "Daily:",
  ];
  for (const name of DAILY_COMMANDS) {
    const c = CATALOG[name];
    lines.push(`  ${padName(name)} ${oneLine(c.summary)}`);
  }
  lines.push(
    "",
    `  ${CMD} --help              all commands`,
    `  ${CMD} <command> --help    one command (examples first)`,
    `  --json                     agents (same envelope every time)`,
    "",
    "TTY: no args = one-shot heartbeat. Non-TTY: pass --json or a command.",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Full grouped `--help`.
 */
export function formatUsageFull() {
  const lines = [
    `${CMD} — local-first OKF continuity`,
    "",
    "Usage:",
    `  ${CMD}                       Heartbeat (TTY)`,
  ];
  for (const group of GROUP_ORDER) {
    const cmds = Object.values(CATALOG).filter((c) => c.group === group);
    if (!cmds.length) continue;
    lines.push("", `${group}:`);
    for (const c of cmds) {
      lines.push(`  ${padName(c.name)} ${oneLine(c.summary)}`);
    }
  }
  lines.push(
    "",
    "Global flags:",
    "  --json             Machine-readable { ok, data } | { ok, error }",
    "  --dir <path>       Override resolve (same as MENTAL_DIR)",
    "  -h                 Short Daily help",
    "  --help             This list",
    "  -v, --version      Print version",
    "  --plain            No emoji / ANSI (also NO_COLOR, TERM=dumb, --no-color)",
    "",
    "TTY: no args prints a one-shot heartbeat and exits. Named commands are one-shot.",
    "Non-TTY / agents: always pass --json. Do not grep OKF / YAML.",
    `Per-command help: ${CMD} <command> --help`,
    "",
    "Privacy: default store is ~/.mental (never commit). Project ./.mental",
    `only after \`${CMD} local\`. Never store secrets.`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string} name
 */
export function formatCommandHelp(name) {
  const raw = CATALOG[name];
  if (!raw) return null;
  const c = raw.aliasOf && CATALOG[raw.aliasOf] ? { ...CATALOG[raw.aliasOf], name: raw.name, summary: raw.summary, usage: raw.usage, examples: raw.examples, aliasOf: raw.aliasOf } : raw;
  const lines = [`${CMD} ${c.name} — ${c.summary}`, ""];
  if (c.aliasOf) lines.push(`Alias of ${c.aliasOf}.`, "");
  lines.push(`Usage: ${c.usage}`, "", "Examples:");
  for (const ex of c.examples) lines.push(`  ${ex}`);
  lines.push("", "Flags:");
  const locals = c.flags.length ? c.flags : [];
  if (c.rest) {
    const req = c.rest.required ? "required" : "optional";
    lines.push(`  <${c.rest.name}>${padFlag(c.rest.name)} ${req}  ${c.rest.summary || ""}`.trimEnd());
  }
  for (const f of locals) {
    const spec = f.takesValue === false ? `--${f.name}` : f.takesValue === "optional" ? `--${f.name} [${f.name}]` : `--${f.name} <${f.name}>`;
    const req = f.required ? "required" : "optional";
    const en = f.enum ? ` (${f.enum.join("|")})` : "";
    lines.push(`  ${spec.padEnd(28)} ${req}  ${(f.summary || "")}${en}`.trimEnd());
  }
  lines.push(`  --json`.padEnd(30) + "optional  machine envelope");
  lines.push(`  -h, --help`.padEnd(30) + "          this text");
  return `${lines.join("\n")}\n`;
}

function padName(name) {
  return name.padEnd(22);
}

function padFlag(name) {
  return " ".repeat(Math.max(1, 22 - name.length));
}

function oneLine(s) {
  const cut = s.split(". ")[0];
  return cut.endsWith(".") ? cut : `${cut}.`;
}

/**
 * Tiny Levenshtein for TTY did-you-mean. Never auto-run.
 * @param {string} a
 * @param {string} b
 */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  /** @type {number[]} */
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * @param {string} input
 * @param {number} [maxDist]
 * @returns {string[]}
 */
export function suggestCommands(input, maxDist = 2) {
  const names = catalogNames();
  /** @type {{ name: string, d: number }[]} */
  const scored = names.map((name) => ({ name, d: editDistance(input, name) })).filter((x) => x.d > 0 && x.d <= maxDist);
  scored.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name));
  return scored.slice(0, 3).map((x) => x.name);
}

/**
 * Completion script (no new deps).
 * @param {"bash" | "zsh" | "fish"} shell
 */
export function completionScript(shell) {
  const names = catalogNames().join(" ");
  if (shell === "bash") {
    return `# mental bash completion — eval "$(mental completion bash)"
_mental() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${names} help" -- "\$cur") )
  fi
}
complete -F _mental ${CMD}
`;
  }
  if (shell === "zsh") {
    return `# mental zsh completion — eval "$(mental completion zsh)"
#compdef ${CMD}
_mental() {
  local -a cmds
  cmds=(${catalogNames().join(" ")})
  _describe 'command' cmds
}
compdef _mental ${CMD}
`;
  }
  return `# mental fish completion — mental completion fish > ~/.config/fish/completions/mental.fish
complete -c ${CMD} -f
${catalogNames().map((n) => `complete -c ${CMD} -n "__fish_use_subcommand" -a ${n} -d ${(JSON.stringify(oneLine(CATALOG[n].summary)))}`).join("\n")}
`;
}
