---
name: mental-setup
description: >-
  Install or upgrade the Mental CLI when the Mental plugin is present, mental is
  missing from PATH, the user asks to set up or upgrade continuity, or doctor /
  JSON says the CLI is behind npm. Use when installing Mental CLI from a
  marketplace or plugin UI. For daily continuity once the CLI is current, follow
  the Mental skill copied by mental install.
license: MIT
compatibility: Requires Node.js >=22.13. Does not start MCP. Agent Plugins 1.0.0.
metadata:
  author: Ali Farahat
  tags: mental,continuity,cli,install
when_to_use: |
  USE WHEN:
  - The user installed the Mental plugin from a marketplace or host UI.
  - `mental` is missing from PATH.
  - The user asks to install or upgrade Mental CLI.
  - JSON includes `update`, or `mental doctor` says the CLI, copied skill, or
    host plugin is behind.

  DO NOT USE WHEN:
  - `mental` is on PATH, the user did not ask to upgrade, and there is no
    `update` hint — follow the Mental skill instead.
---

# Mental setup — install the CLI

The Mental **plugin** is discovery only. It does not run Mental CLI. The product is
the CLI on PATH.

Never execute a `.mjs` file as a command (Windows shows "how do you want to
open this file?"). Do not install from a git clone or plugin cache. npm owns
the executable; `mental install` only copies the procedure/rule/config.

## Fresh install — every supported shell

```text
npm i -g @balacode/mental
mental install
mental doctor
```

Daily invoke: `mental … --json`.

## Existing Windows install from Mental 0.8.1 or older

Run this migration once. The distinct repair bin remains reachable when an old
`mental` shadows npm.

```text
npm i -g @balacode/mental
mental-repair.cmd
mental install
mental doctor
```

If PowerShell blocks npm-generated `.ps1` launchers, use `npm.cmd` and
`mental.cmd` explicitly. Never change execution policy on the user's behalf.

## If `mental` is already current

Daily work: follow the **Mental** skill (copied by install into
`~/.cursor/skills/mental`, `~/.claude/skills/mental`,
`~/.agents/skills/mental`). Use the daily invoke for this OS. Stop.

Upgrade (the user asked, JSON includes `update`, or doctor says the CLI / copied
skill / host plugin is behind): run the fresh-install block again. Existing
Windows 0.8.1-or-older installs run the migration block once.
Journals stay. Do not re-run this client's plugin marketplace unless doctor says
the host plugin is behind. Then follow the Mental skill.

## If the CLI is missing

1. Continue the user's coding task; Mental fails open.
2. Tell the user to run the fresh-install block. If this is an existing Windows
   install, use the one-time migration block. Never run a `.mjs` file as a command.
3. Use **only this client's** plugin flow if they still need the host plugin.
   Do not run other hosts' `/plugin`, `copilot plugin`, or Command Palette
   steps from this session.
4. After doctor, ask whether they want optional hooks or time
   tracking (sit-down clock, default off), and whether MCP is needed
   (`mental install --mcp`). Skip MCP if this client can run the CLI.
   Never run `mental option … on` until they say yes **this turn**.

Do not start a plugin MCP server. Do not silent-global-install from a hook.
Missing Mental must not block the user's coding task (fail open).
