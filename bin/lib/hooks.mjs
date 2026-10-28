/**
 * Optional session hooks. Default off. Merge Mental's command into user hook
 * files without deleting other entries. Never enable from `mental install`.
 *
 * The hook command is `mental hooks session-start <host>`: it resolves through
 * PATH, so it survives Node reinstalls and nvm switches (the old absolute
 * `hooks/session-start.sh` path did not), and it prints the JSON shape each host
 * documents for injecting context.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CMD, PKG_ROOT } from "./pkg.mjs";
import { HOST_VIA } from "./via.mjs";

export const HOOK_MARKER = "mental status --json";
/** Pre-0.12.2 hook script; still shipped so existing hook entries keep working. */
export const HOOK_SCRIPT = join(PKG_ROOT, "hooks", "session-start.sh");

/** Hosts `mental hooks session-start` can emit for. */
export const HOOK_HOSTS = [HOST_VIA.claudeCode, HOST_VIA.cursor];

/**
 * Context budget in characters. Claude Code caps injected context at 10,000;
 * the old `.sh` hook capped at 4096 bytes, and the status packet is meant to stay small.
 */
export const HOOK_CONTEXT_MAX = 4000;

/**
 * Hook command line for one host.
 * win32 uses `mental.cmd`: Cursor runs hooks through PowerShell, which may refuse
 * npm's `mental.ps1` shim, and `.cmd` also runs from cmd and Git Bash (Claude Code).
 * @param {string} host
 * @param {string} [platform]
 */
export function hookCommand(host, platform = process.platform) {
  const bin = platform === "win32" ? `${CMD}.cmd` : CMD;
  return `${bin} hooks session-start ${host}`;
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function isMentalCommand(cmd) {
  return (
    typeof cmd === "string" &&
    (cmd.includes("mental status") || cmd.includes("session-start.sh") || cmd.includes("hooks session-start"))
  );
}

function isLegacyCommand(cmd) {
  return isMentalCommand(cmd) && !cmd.includes("hooks session-start");
}

function entryCommand(entry) {
  return typeof entry === "string" ? entry : entry?.command || entry?.hooks?.[0]?.command;
}

function isMentalEntry(entry) {
  return isMentalCommand(entryCommand(entry));
}

/**
 * Drop Mental commands from Claude-style `[{ matcher, hooks: [...] }]` blocks.
 * @param {unknown} blocks
 */
function withoutMentalBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      if (!Array.isArray(block?.hooks)) return block;
      return { ...block, hooks: block.hooks.filter((h) => !isMentalCommand(h.command)) };
    })
    .filter((block) => !Array.isArray(block?.hooks) || block.hooks.length > 0);
}

/**
 * @param {string} home
 */
export function cursorHooksPath(home) {
  return join(home, ".cursor", "hooks.json");
}

/**
 * @param {string} home
 */
export function claudeSettingsPath(home) {
  return join(home, ".claude", "settings.json");
}

/**
 * Write (or rewrite) Mental's session-start entries. Replaces older Mental entries,
 * so running it again migrates a pre-0.12.2 `.sh` install in place.
 * Claude Code gets SessionStart only: matcher "" also fires after compaction, and
 * PreCompact stdout never reaches the model.
 * @param {string} home
 * @param {{ platform?: string }} [opts]
 */
export function enableHooks(home, { platform = process.platform } = {}) {
  /** @type {string[]} */
  const written = [];

  const cursorFile = cursorHooksPath(home);
  const cursor = readJson(cursorFile, { version: 1, hooks: {} });
  if (!cursor) {
    return { ok: false, error: { code: "hooks-parse", message: `Could not parse ${cursorFile}` } };
  }
  const claudeFile = claudeSettingsPath(home);
  const claude = readJson(claudeFile, {});
  if (!claude) {
    return { ok: false, error: { code: "hooks-parse", message: `Could not parse ${claudeFile}` } };
  }

  cursor.version = cursor.version || 1;
  cursor.hooks = cursor.hooks || {};
  const sessionStart = Array.isArray(cursor.hooks.sessionStart) ? cursor.hooks.sessionStart : [];
  cursor.hooks.sessionStart = [
    ...sessionStart.filter((e) => !isMentalEntry(e)),
    { command: hookCommand(HOST_VIA.cursor, platform) },
  ];
  writeJson(cursorFile, cursor);
  written.push(cursorFile);

  claude.hooks = claude.hooks || {};
  claude.hooks.SessionStart = [
    ...withoutMentalBlocks(claude.hooks.SessionStart),
    { matcher: "", hooks: [{ type: "command", command: hookCommand(HOST_VIA.claudeCode, platform) }] },
  ];
  if (Array.isArray(claude.hooks.PreCompact)) {
    claude.hooks.PreCompact = withoutMentalBlocks(claude.hooks.PreCompact);
    if (claude.hooks.PreCompact.length === 0) delete claude.hooks.PreCompact;
  }
  writeJson(claudeFile, claude);
  written.push(claudeFile);

  return {
    ok: true,
    written,
    commands: {
      [HOST_VIA.cursor]: hookCommand(HOST_VIA.cursor, platform),
      [HOST_VIA.claudeCode]: hookCommand(HOST_VIA.claudeCode, platform),
    },
  };
}

/**
 * True when a hook file still runs the pre-0.12.2 `.sh` script or raw `mental status`.
 * @param {string} home
 */
export function hasLegacyHooks(home) {
  const cursor = readJson(cursorHooksPath(home), null);
  if (cursor?.hooks?.sessionStart?.some?.((e) => isLegacyCommand(entryCommand(e)))) return true;
  const claude = readJson(claudeSettingsPath(home), null);
  for (const key of ["SessionStart", "PreCompact"]) {
    const blocks = claude?.hooks?.[key];
    if (!Array.isArray(blocks)) continue;
    if (blocks.some((b) => (b?.hooks || []).some((h) => isLegacyCommand(h.command)))) return true;
  }
  return false;
}

/**
 * Remove only Mental hook entries. Leave the rest of the files intact.
 * @param {string} home
 */
export function disableHooks(home) {
  /** @type {string[]} */
  const written = [];

  const cursorFile = cursorHooksPath(home);
  const cursor = readJson(cursorFile, null);
  if (cursor?.hooks?.sessionStart) {
    cursor.hooks.sessionStart = cursor.hooks.sessionStart.filter((e) => !isMentalEntry(e));
    writeJson(cursorFile, cursor);
    written.push(cursorFile);
  }

  const claudeFile = claudeSettingsPath(home);
  const claude = readJson(claudeFile, null);
  if (claude?.hooks) {
    for (const key of ["SessionStart", "PreCompact"]) {
      if (!Array.isArray(claude.hooks[key])) continue;
      claude.hooks[key] = withoutMentalBlocks(claude.hooks[key]);
    }
    writeJson(claudeFile, claude);
    written.push(claudeFile);
  }

  return { ok: true, written };
}

/**
 * Host for a hook run that named none (the legacy `.sh` entry), from the stdin
 * payload's `hook_event_name`: Claude Code uses PascalCase, Cursor camelCase.
 * @param {string} stdinText
 * @returns {{ host: string | null, event: string | null }}
 */
export function detectHookHost(stdinText) {
  let event = null;
  try {
    const parsed = JSON.parse(stdinText);
    event = typeof parsed?.hook_event_name === "string" ? parsed.hook_event_name : null;
  } catch {
    event = null;
  }
  if (event === "SessionStart" || event === "PreCompact") return { host: HOST_VIA.claudeCode, event };
  if (event === "sessionStart") return { host: HOST_VIA.cursor, event };
  return { host: null, event };
}

const TRIM_STEPS = [
  { items: 10, chars: 400 },
  { items: 5, chars: 200 },
  { items: 3, chars: 120 },
  { items: 1, chars: 80 },
];

function trimValue(value, step) {
  if (typeof value === "string") {
    return value.length > step.chars ? `${value.slice(0, step.chars - 1)}…` : value;
  }
  if (Array.isArray(value)) {
    const kept = value.slice(0, step.items).map((v) => trimValue(v, step));
    if (value.length > step.items) kept.push(`… ${value.length - step.items} more`);
    return kept;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimValue(v, step)]));
  }
  return value;
}

/**
 * Serialize JSON within `max` characters without cutting it mid-token: long arrays
 * and strings are shortened step by step, and the result is marked `truncated`.
 * @param {unknown} value
 * @param {number} max
 */
export function fitJson(value, max) {
  const full = JSON.stringify(value);
  if (full.length <= max) return full;
  for (const step of TRIM_STEPS) {
    const trimmed = trimValue(value, step);
    const text = JSON.stringify(
      trimmed && typeof trimmed === "object" && !Array.isArray(trimmed) ? { truncated: true, ...trimmed } : trimmed,
    );
    if (text.length <= max) return text;
  }
  return JSON.stringify({ truncated: true, hint: `run \`${CMD} status --json\`` });
}

const NEED_WORD = { verify: "check", concern: "concern", direction: "direction", thread: "thread" };

/**
 * Context text injected at session start: a short brief an agent can act on,
 * built from `mental status --json` output. It leads with where to pick up,
 * lists what needs the person (not items parked for later) and open decisions,
 * and names the next command with the host's `--via` token. Paths and ids stay
 * out; the agent asks the CLI for detail. Lists are cut to fit `max`, keeping
 * their true counts.
 * @param {string} statusText
 * @param {number} [max]
 * @param {string | null} [host] `--via` token for the next-step line
 * @example
 * sessionStartContext(statusJson, 4000, "cursor")
 * // "# Mental — where this repo stands\nPick up here: …\nNeeds you (2):\n- check: …"
 */
export function sessionStartContext(statusText, max = HOOK_CONTEXT_MAX, host = null) {
  const head = "# Mental — where this repo stands";
  const unavailable = `${head}\nMental is unavailable here; run \`${CMD} heartbeat --json\`.`;
  let d;
  try {
    d = JSON.parse(statusText)?.data;
  } catch {
    return unavailable;
  }
  if (!d || typeof d !== "object") return unavailable;
  const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const needs = (Array.isArray(d.attention) ? d.attention : []).filter((x) => x && x.status !== "later" && x.status !== "resolved");
  const decisions = Array.isArray(d.openDecisions) ? d.openDecisions : [];
  const git = d.git && typeof d.git === "object" ? d.git : null;
  const via = host ? `--via ${host}` : "--via <your host>";
  const next = `Next: run \`${CMD} heartbeat --json\` for the full picture; record with \`${CMD} park|attention|decide … ${via}\`.`;

  /** Build the brief with lists cut to `room` items each and text clipped to `clip` characters. */
  const build = (room, clip) => {
    const cut = (s) => (s.length > clip ? `${s.slice(0, clip - 1)}…` : s);
    const list = (label, items, fmt) => {
      if (!items.length) return [];
      const shown = items.slice(0, room).map((x) => `- ${cut(fmt(x))}`);
      const more = items.length - shown.length;
      return [`${label} (${items.length}):`, ...shown, ...(more > 0 ? [`- … ${more} more — run \`${CMD} heartbeat --json\``] : [])];
    };
    const out = [head];
    out.push(d.resume ? `Pick up here: ${cut(line(d.resume))}` : "Pick up here: no resume point yet; park when you pause.");
    if (d.latestOutcome) out.push(`Last hop: ${cut(line(d.latestOutcome))}`);
    out.push(...list("Needs you", needs, (x) => `${NEED_WORD[x.kind] || x.kind || "item"}: ${line(x.title)}`));
    out.push(...(decisions.length ? list("Open decisions", decisions, (x) => line(x.title)) : ["Open decisions: none"]));
    if (git?.branch) {
      const recent = Array.isArray(git.recent) && git.recent[0] ? ` · last commit ${cut(line(git.recent[0]))}` : "";
      out.push(`Branch: ${git.branch}${git.dirty ? " (uncommitted changes)" : ""}${recent}`);
    }
    out.push(next);
    return out.join("\n");
  };
  for (const [room, clip] of [[8, 400], [5, 200], [3, 120], [1, 60], [0, 40]]) {
    const text = build(room, clip);
    if (text.length <= max) return text;
  }
  return `${head}\n${next}`.slice(0, max);
}

/**
 * Hook stdout in the shape each host documents.
 * Claude Code: `hookSpecificOutput.additionalContext`. Cursor: `additional_context`.
 * Unknown host: the bare context JSON, as the `.sh` hook printed.
 * Claude PreCompact: empty, since that event does not inject context.
 * @param {{ host: string | null, event?: string | null, statusText: string, max?: number }} opts
 */
export function sessionStartOutput({ host, event = null, statusText, max = HOOK_CONTEXT_MAX }) {
  if (event === "PreCompact") return "";
  const context = sessionStartContext(statusText, max, host);
  if (host === HOST_VIA.claudeCode) {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
  }
  if (host === HOST_VIA.cursor) return JSON.stringify({ additional_context: context });
  try {
    return fitJson(JSON.parse(statusText), max);
  } catch {
    return "";
  }
}
