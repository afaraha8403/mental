# Mental CLI flags

Do not memorize flag tables. After `mental install`, run:

```text
mental -h
mental <command> --help
mental schema --json
mental schema heartbeat --json
```

Agents always pass `--json`. Humans on a TTY type `mental` for a one-shot heartbeat.

Daily: `heartbeat`, `park`, `handoff`, `decide`, `attention`, `search`. Read-only: `brief` (continue packet for a new chat or tool; `--hops N`, `--find WORD`, `--since park|handoff`, `--no-rank`).
Identity (`remap`, `split`, `link`, `local`, `backup`, `restore`) and setup (`install`, `doctor`, …) stay CLI — not MCP.

Stale content: `supersede <path> --by <newer>` and `obsolete <path>` (`--restore` undoes) mark a note or decision as replaced or no longer true; the file is kept, only frontmatter changes, and journals are refused. Use them when you learn something is overwritten; do not guess, and do not mark on a hunch. `doctor` may propose marks (`--apply` only if the user agrees).

Optional decision model (Jev, OpenAI Decisions or Cloudflare Clef; user-set key; see SKILL.md): `relink [path]` dry-runs typed link suggestions and `retag [path]` dry-runs topic tags for untagged files and `extract <file|->` dry-runs actions, decisions and concerns from meeting notes (`--apply` only if the user agrees; extract also needs `--tag`); `search --rank` re-orders hits (and favors the kind of file the question points at); `doctor` adds warn-only `jev-*` checks and previews tags/links for old files (`doctor --apply` writes only if the user agrees; `--offline` skips). Agents never run `option decide` (alias `option jev`).

`--via` is a short client token (`cursor`, `claude-code`, `copilot`, `codex`, `opencode`, `mcp`, `cli`). Never a session id, email, or URL.
