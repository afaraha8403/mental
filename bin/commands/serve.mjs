/**
 * `mental serve` — optional MCP stdio wrapping where/status/search/show/journal.
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
