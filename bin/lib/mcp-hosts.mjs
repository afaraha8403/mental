/**
 * User-level MCP host config writers (`install --mcp` / `option mcp on`).
 * Split from the stdio server so option.mjs can import without a cycle.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CMD } from "./pkg.mjs";

/**
 * Cursor user-level MCP config (`mcpServers` at top level).
 * @param {string} home
 */
export function cursorMcpPath(home) {
  return join(home, ".cursor", "mcp.json");
}

/**
 * Claude Code user-level MCP config (`mcpServers` at top level of ~/.claude.json).
 * @param {string} home
 */
export function claudeMcpPath(home) {
  return join(home, ".claude.json");
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

/**
 * The stdio launch entry hosts store for `mental serve`.
 * It resolves `mental` on PATH (never an absolute path, so npm upgrades keep
 * working). On Windows npm installs `mental.cmd`, which hosts that spawn without
 * a shell cannot start, so the entry goes through `cmd /c`.
 * @param {NodeJS.Platform} [platform]
 */
export function mcpEntry(platform = process.platform) {
  if (platform === "win32") return { command: "cmd", args: ["/c", CMD, "serve"] };
  return { command: CMD, args: ["serve"] };
}

function isOwnEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.command === CMD) return true;
  return entry.command === "cmd" && Array.isArray(entry.args) && entry.args.includes(CMD);
}

/**
 * Codex user-level MCP config (`[mcp_servers.<name>]` tables in TOML).
 * @param {string} home
 */
export function codexMcpPath(home) {
  return join(home, ".codex", "config.toml");
}

const CODEX_HEADER = new RegExp(`^\\[mcp_servers\\.(?:${CMD}|"${CMD}")(?:\\.[^\\]]*)?\\]\\s*$`);

/**
 * Split TOML text into Mental's own `[mcp_servers.mental*]` tables and everything else.
 * Line-based on purpose: Mental never parses the rest of the file, it only keeps it.
 * @param {string} text
 */
function splitCodexToml(text) {
  const keep = [];
  const own = [];
  let inOwn = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) inOwn = CODEX_HEADER.test(line.trim());
    (inOwn ? own : keep).push(line);
  }
  return { keep: keep.join("\n").replace(/\n+$/, ""), own: own.join("\n") };
}

function codexToml(entry) {
  return `[mcp_servers.${CMD}]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n`;
}

/**
 * Register `mental serve` in user-level MCP configs (Cursor, Claude Code, and
 * Codex when `~/.codex` exists).
 * @param {string} home
 */
export function enableMcp(home) {
  /** @type {string[]} */
  const written = [];
  const entry = mcpEntry();
  for (const file of [cursorMcpPath(home), claudeMcpPath(home)]) {
    const cfg = readJson(file, {});
    if (!cfg) {
      return { ok: false, error: { code: "mcp-parse", message: `Could not parse ${file}` }, written };
    }
    cfg.mcpServers = cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {};
    cfg.mcpServers[CMD] = entry;
    writeJson(file, cfg);
    written.push(file);
  }
  const codex = codexMcpPath(home);
  if (existsSync(dirname(codex))) {
    const { keep } = splitCodexToml(existsSync(codex) ? readFileSync(codex, "utf8") : "");
    writeFileSync(codex, `${keep ? `${keep}\n\n` : ""}${codexToml(entry)}`);
    written.push(codex);
  }
  return { ok: true, written, server: entry };
}

/**
 * Remove only Mental's own MCP entry (`command: "mental"`, or `cmd /c mental` on Windows).
 * @param {string} home
 */
export function disableMcp(home) {
  /** @type {string[]} */
  const written = [];
  for (const file of [cursorMcpPath(home), claudeMcpPath(home)]) {
    const cfg = readJson(file, null);
    if (!isOwnEntry(cfg?.mcpServers?.[CMD])) continue;
    delete cfg.mcpServers[CMD];
    writeJson(file, cfg);
    written.push(file);
  }
  const codex = codexMcpPath(home);
  if (existsSync(codex)) {
    const { keep, own } = splitCodexToml(readFileSync(codex, "utf8"));
    if (own && new RegExp(`"${CMD}"`).test(own)) {
      writeFileSync(codex, keep ? `${keep}\n` : "");
      written.push(codex);
    }
  }
  return { ok: true, written };
}
