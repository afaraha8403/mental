/**
 * `mental serve` — optional MCP stdio wrapping the CLI commands
 * (heartbeat/where/status/search/show/journal/attention/decide/note).
 */
import { serveMcp } from "../lib/mcp.mjs";

export function cmdServe(args, io = {}) {
  return serveMcp({
    cwd: args.cwd,
    home: args.home,
    env: args.env,
    dir: args.dir ?? null,
    stdin: io.stdin,
    stdout: io.stdout,
  });
}
