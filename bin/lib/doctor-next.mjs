/**
 * Portable doctor "next:" command. ASCII, no &&, no .mjs.
 * Same `mental doctor --fix` on Windows, macOS, and Linux.
 * Only the legacy-repair launcher name differs (mental-repair.cmd on win32).
 */
import { CMD, NAME } from "./pkg.mjs";

const FIXABLE = new Set([
  "skills",
  "rule-claude-md",
  "rule-claude-rules",
  "rule-codex",
  "rule-opencode",
  "rule-cursor-global",
  "local-ignore",
  "legacy-balakit",
  "track-skill-drift",
  "track-skill-version",
  "skills-version",
]);

/**
 * @param {string} [platform]
 */
export function repairCommand(platform = process.platform) {
  return platform === "win32" ? "mental-repair.cmd" : "mental-repair";
}

/**
 * One next command for TTY + JSON. Null when nothing to run.
 * @param {{
 *   checks: Array<{ id: string, ok: boolean, level?: string }>,
 *   alreadyFixed?: boolean,
 *   platform?: string,
 * }} opts
 * @returns {{ action: "fix" | "ask" | "tell", command: string } | null}
 */
export function doctorNextAction({ checks, alreadyFixed = false, platform = process.platform }) {
  const failed = checks.filter((c) => !c.ok);
  const errors = failed.filter((c) => (c.level || "error") === "error");
  const canFix = alreadyFixed ? [] : failed.filter((c) => FIXABLE.has(c.id));
  if (canFix.length) {
    return { action: "fix", command: `${CMD} doctor --fix` };
  }
  if (errors.some((c) => c.id === "cli-shadow")) {
    return { action: "tell", command: repairCommand(platform) };
  }
  if (failed.some((c) => c.id === "update")) {
    return { action: "tell", command: `npm i -g ${NAME}` };
  }
  if (failed.some((c) => c.id === "rule-cursor-project")) {
    return { action: "ask", command: `${CMD} install --project` };
  }
  return null;
}

/**
 * ASCII TTY footer. Empty string when there is no next command.
 * @param {{ action: string, command: string } | null | undefined} next
 */
export function formatDoctorNextLine(next) {
  if (!next?.command) return "";
  if (next.action === "ask") return `\nnext: ${next.command} (optional Cloud/CLI)`;
  if (next.action === "tell" && next.command.startsWith("npm ")) {
    return `\nnext: ${next.command} then ${CMD} install then ${CMD} doctor`;
  }
  return `\nnext: ${next.command}`;
}
