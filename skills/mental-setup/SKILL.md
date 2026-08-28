---
name: mental-setup
description: >-
  Install the Mental CLI when the Mental plugin is present, mental is missing
  from PATH, or the user asks to set up continuity. Use when installing Mental
  from a marketplace or plugin UI. Do not use once mental is on PATH — follow
  the Mental skill copied by mental install.
license: MIT
compatibility: Requires Node.js >=18. Does not start MCP. Agent Plugins 1.0.0.
metadata:
  author: Ali Farahat
  tags: mental,continuity,cli,install
when_to_use: |
  USE WHEN:
  - The user installed the Mental plugin from a marketplace or host UI.
  - `mental` is missing from PATH.
  - Continuity is needed but the CLI is not installed.

  DO NOT USE WHEN:
  - `mental` is already on PATH — follow the Mental skill instead.
---

# Mental setup — install the CLI

The Mental **plugin** is discovery only. It does not run Mental. The product is
the CLI on PATH.

## If `mental` is already on PATH

Do not duplicate the procedure. Follow the **Mental** skill (copied by
`mental install` into `~/.cursor/skills/mental`, `~/.claude/skills/mental`,
`~/.agents/skills/mental`). Use `mental … --json`. Stop.

## If `mental` is missing

1. Try `npx @balacode/mental where --json`. If that works, continue with npx
   for this turn and tell the user to install.
2. Tell the user to run:

```bash
npm i -g @balacode/mental
mental install
mental doctor
```

3. Use **only this client's** plugin flow if they still need the host plugin.
   Do not run other hosts' `/plugin`, `copilot plugin`, or Command Palette
   steps from this session.
4. After `mental doctor`, ask whether they want optional hooks or time
   tracking, and whether MCP is needed (`mental install --mcp` for
   tool-only agents that cannot shell the CLI). Skip MCP if this client can
   run `mental`. Never run `mental option … on` until they say yes **this turn**.

Do not start a plugin MCP server. Do not silent-global-install from a hook.
Missing Mental must not block the user's coding task (fail open).
