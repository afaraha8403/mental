// Pure helpers for the Cursor extension: no `vscode`, no I/O, so the main
// test suite can load them.
"use strict";

const PARK_PROMPT = "Park this session in Mental";
const HANDOFF_PROMPT = "Hand off this session in Mental";

/**
 * How to start the Mental CLI. npm installs `mental.cmd` on Windows, and
 * Node will not start a `.cmd` without a shell, so it runs through
 * `cmd.exe /d /s /c` with the line quoted rather than `shell: true`.
 * @param {string[]} args
 * @param {{ platform?: string, cliPath?: string, comSpec?: string }} [o]
 * @returns {{ file: string, args: string[], verbatim: boolean }}
 */
function cliCommand(args, o = {}) {
  const platform = o.platform || process.platform;
  const cli = o.cliPath || (platform === "win32" ? "mental.cmd" : "mental");
  if (platform !== "win32") return { file: cli, args, verbatim: false };
  const quote = (a) => (/^[\w@.\/\\:=+,-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
  return { file: o.comSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${[cli, ...args].map(quote).join(" ")}"`], verbatim: true };
}

/** The first JSON object in CLI output (a warning line may come first), or null. */
function jsonOf(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

/**
 * The dashboard the port file advertises, when it names a loopback URL and
 * a process that is still alive.
 * @param {unknown} body parsed `~/.mental/dashboard.json`
 * @param {(pid: number) => boolean} isAlive
 * @returns {string | null}
 */
function advertisedUrl(body, isAlive) {
  const b = /** @type {any} */ (body);
  const url = typeof b?.url === "string" ? b.url : "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}\/$/.test(url)) return null;
  if (Number.isInteger(b.pid) && b.pid > 0 && !isAlive(b.pid)) return null;
  return url;
}

/**
 * The dashboard's Today view for one project in embed mode (no sidebar or tab
 * bar), as the sidebar frames it.
 * @param {string} url the dashboard root, e.g. `http://127.0.0.1:3847/`
 * @param {string | null} projectId
 */
function embedUrl(url, projectId) {
  return `${url}?embed=1#/today${projectId ? `?p=${encodeURIComponent(projectId)}` : ""}`;
}

/**
 * The status bar item for a heartbeat: what needs you leads, else the state.
 * @param {any} hb `mental heartbeat --json` output, or null when it failed
 * @returns {{ text: string, tooltip: string, tone: "needs" | "ok" | "off" }}
 */
function statusOf(hb) {
  const d = hb && hb.ok !== false ? hb.data : null;
  if (!d || !d.id) return { text: "$(circle-outline) mental", tooltip: "Mental is not linked to this folder. Ask the agent to link it, or park once.", tone: "off" };
  const later = Number(d.laterCount) || 0;
  const needs = Math.max(0, (Number(d.attentionCount) || 0) - later) + (Number(d.openDecisionCount) || 0);
  const resume = String(d.handoff?.resume || "").replace(/\s+/g, " ").trim();
  const lines = [resume ? `Pick up here: ${resume}` : "No resume point yet. Park when you pause."];
  const items = [...(d.attention || []).filter((x) => x?.status !== "later"), ...(d.openDecisions || [])].slice(0, 5);
  if (items.length) lines.push("", `Needs you (${needs}):`, ...items.map((x) => `- ${String(x.title || x.path || "").replace(/\s+/g, " ")}`));
  if (d.git?.branch) lines.push("", `Branch: ${d.git.branch}${d.git.dirty ? " (uncommitted changes)" : ""}`);
  return needs
    ? { text: `$(bell-dot) mental · ${needs} need${needs === 1 ? "s" : ""} you`, tooltip: lines.join("\n"), tone: "needs" }
    : { text: "$(check) mental", tooltip: lines.join("\n"), tone: "ok" };
}

module.exports = { PARK_PROMPT, HANDOFF_PROMPT, cliCommand, jsonOf, advertisedUrl, embedUrl, statusOf };
