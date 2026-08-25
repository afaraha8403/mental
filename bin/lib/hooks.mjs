/**
 * Optional session hooks. Default off. Merge Mental's command into user hook
 * files without deleting other entries. Never enable from `mental install`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PKG_ROOT } from "./pkg.mjs";

export const HOOK_MARKER = "mental status --json";
export const HOOK_SCRIPT = join(PKG_ROOT, "hooks", "session-start.sh");

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
    (cmd.includes("mental status") || cmd.includes("session-start.sh"))
  );
}

function isMentalEntry(entry) {
  const cmd = typeof entry === "string" ? entry : entry?.command || entry?.hooks?.[0]?.command;
  return isMentalCommand(cmd);
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
 * @param {string} home
 */
export function enableHooks(home) {
  /** @type {string[]} */
  const written = [];

  const cursorFile = cursorHooksPath(home);
  const cursor = readJson(cursorFile, { version: 1, hooks: {} });
  if (!cursor) {
    return { ok: false, error: { code: "hooks-parse", message: `Could not parse ${cursorFile}` } };
  }
  cursor.version = cursor.version || 1;
  cursor.hooks = cursor.hooks || {};
  const sessionStart = Array.isArray(cursor.hooks.sessionStart) ? cursor.hooks.sessionStart : [];
  if (!sessionStart.some(isMentalEntry)) {
    sessionStart.push({ command: `${HOOK_SCRIPT}` });
  }
  cursor.hooks.sessionStart = sessionStart;
  writeJson(cursorFile, cursor);
  written.push(cursorFile);

  const claudeFile = claudeSettingsPath(home);
  const claude = readJson(claudeFile, {});
  if (!claude) {
    return { ok: false, error: { code: "hooks-parse", message: `Could not parse ${claudeFile}` } };
  }
  claude.hooks = claude.hooks || {};
  const session = Array.isArray(claude.hooks.SessionStart) ? claude.hooks.SessionStart : [];
  const hasMental = session.some((block) =>
    (block.hooks || []).some((h) => isMentalCommand(h.command)),
  );
  if (!hasMental) {
    session.push({
      matcher: "",
      hooks: [{ type: "command", command: `${HOOK_SCRIPT}` }],
    });
  }
  claude.hooks.SessionStart = session;
  const compact = Array.isArray(claude.hooks.PreCompact) ? claude.hooks.PreCompact : [];
  const hasCompact = compact.some((block) =>
    (block.hooks || []).some((h) => isMentalCommand(h.command)),
  );
  if (!hasCompact) {
    compact.push({
      matcher: "",
      hooks: [{ type: "command", command: `${HOOK_SCRIPT}` }],
    });
  }
  claude.hooks.PreCompact = compact;
  writeJson(claudeFile, claude);
  written.push(claudeFile);

  return { ok: true, written, script: HOOK_SCRIPT };
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
      claude.hooks[key] = claude.hooks[key]
        .map((block) => {
          if (!Array.isArray(block.hooks)) return block;
          return {
            ...block,
            hooks: block.hooks.filter((h) => !isMentalCommand(h.command)),
          };
        })
        .filter((block) => !Array.isArray(block.hooks) || block.hooks.length > 0);
    }
    writeJson(claudeFile, claude);
    written.push(claudeFile);
  }

  return { ok: true, written };
}
