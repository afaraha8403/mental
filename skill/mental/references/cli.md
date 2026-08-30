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
Identity (`remap`, `split`, `link`, `local`) and setup (`install`, `doctor`, …) stay CLI — not MCP.

`--via` is a short client token (`cursor`, `claude-code`, `copilot`, `codex`, `opencode`, `mcp`, `cli`). Never a session id, email, or URL.
