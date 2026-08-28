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

const MCP_ENTRY = () => ({ command: CMD, args: ["serve"] });

/**
 * Register `mental serve` in user-level MCP configs.
 * @param {string} home
 */
export function enableMcp(home) {
  /** @type {string[]} */
  const written = [];
  for (const file of [cursorMcpPath(home), claudeMcpPath(home)]) {
    const cfg = readJson(file, {});
    if (!cfg) {
      return { ok: false, error: { code: "mcp-parse", message: `Could not parse ${file}` }, written };
    }
    cfg.mcpServers = cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {};
    cfg.mcpServers[CMD] = MCP_ENTRY();
    writeJson(file, cfg);
    written.push(file);
  }
  return { ok: true, written, server: MCP_ENTRY() };
}

/**
 * Remove only Mental's own MCP entry (identified by `command: "mental"`).
 * @param {string} home
 */
export function disableMcp(home) {
  /** @type {string[]} */
  const written = [];
  for (const file of [cursorMcpPath(home), claudeMcpPath(home)]) {
    const cfg = readJson(file, null);
    const entry = cfg?.mcpServers?.[CMD];
    if (!entry || entry.command !== CMD) continue;
    delete cfg.mcpServers[CMD];
    writeJson(file, cfg);
    written.push(file);
  }
  return { ok: true, written };
}
