# Mental CLI flags

Do not memorize flag tables. After `mental install`, run:

```text
mental -h
mental <command> --help
mental schema --json
mental schema heartbeat --json
```

Agents always pass `--json`. Humans on a TTY type `mental` for a one-shot heartbeat.

Daily: `heartbeat`, `park`, `handoff`, `decide`, `attention`, `search`.
Identity (`remap`, `split`, `link`, `local`, `backup`, `restore`) and setup (`install`, `doctor`, …) stay CLI — not MCP.

Optional Jev (user-set key; see SKILL.md): `relink [path]` dry-runs link suggestions (`--apply` only if the user agrees); `doctor` adds warn-only `jev-*` checks (`--offline` skips). Agents never run `option jev`.

`--via` is a short client token (`cursor`, `claude-code`, `copilot`, `codex`, `opencode`, `mcp`, `cli`). Never a session id, email, or URL.
