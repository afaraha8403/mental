---
name: cursor-extensions-and-plugins
description: >-
  Extend Cursor without MCP. Real UI extension path: VS Code extensions
  (webview panels, views, commands, status bar) published to Open VSX, because
  Cursor is a VS Code fork. Agent customization path: Cursor Plugins
  (.cursor-plugin/plugin.json with rules, skills, agents, commands, hooks) and
  skills. Also explains that Canvas is an agent-made artifact, not a mod system.
  Use when the user wants to build, test, publish or share a Cursor extension or
  plugin, or asks whether Cursor has a mod or UI mechanism and whether it needs
  MCP.
license: MIT
compatibility: Extensions need Node, the VS Code extension toolchain (yo code or vsce) and ovsx to publish. Plugins need Cursor with Plugins. Public plugin listing needs an open-source Git repository.
metadata:
  author: Ali Farahat
  tags: cursor,extensions,open-vsx,plugins,marketplace,skills,canvas
  verified-against: cursor.com/help/customization/extensions, cursor.com/docs/agent/tools/canvas, /docs/plugins, /docs/reference/plugins, /docs/skills
when_to_use: |
  USE WHEN:
  - The user asks for Cursor "UI", "mods", panels, custom views, or whether
    Cursor needs MCP for them.
  - They want to build, test, publish or share a Cursor extension, or a Cursor
    plugin (.cursor-plugin/plugin.json, marketplace.json, rules, hooks).

  DO NOT USE WHEN:
  - The task is Mental's own release: use publishing-mental-to-stores.
  - The task is Claude, Codex, Copilot or OpenCode UI: use that skill.
---

# Cursor: extensions, plugins and skills (no MCP required)

## Which mechanism matches a "mod"?

Claude Desktop mods change the app's own UI. Cursor has no first-party mod system, so match by intent:

| Goal | Right mechanism | MCP? | Reference |
| --- | --- | --- | --- |
| New panel, sidebar view, command, status bar item, editor UI | **VS Code extension** (Cursor is a Code OSS fork), published to **Open VSX** | No | [references/vscode-extensions.md](references/vscode-extensions.md) |
| Teach the agent: rules, skills, hooks, subagents, commands | **Cursor Plugin** or plain skills and rules | No | [references/plugins.md](references/plugins.md) |
| Interactive report or dashboard from the agent | **Canvas** (agent-made artifact; package as a skill) | No | [references/canvas.md](references/canvas.md) |
| Agent calls an external system | MCP server | Yes (only this) | |

**Canvas is not a mod.** It is an artifact the agent builds next to the chat. Its docs describe no authoring API, no component registration and no way to alter Cursor itself. Treat community claims about `.canvas.tsx` files and a `cursor/canvas` import as unverified.

Unofficial CSS/JS injection hacks for Cursor's workbench exist. They are unsupported, break on updates and are out of scope. Do not recommend them as a standard path.

## Extensions in short

- Cursor installs third-party extensions from **Open VSX** through Cursor's proxy (`marketplace.cursorapi.com`), which runs malware and supply-chain analysis. It does not use the Microsoft Marketplace.
- To reach Cursor users, publish the same `.vsix` to Open VSX (`ovsx publish`). Publishing only to the Microsoft Marketplace leaves Cursor users to sideload.
- Users can always install a `.vsix` by hand.
- Stick to the open VS Code API. Microsoft-proprietary APIs and backends may not work.
- Teams may restrict installs by allowlist, signature verification and install cooldown. Publisher verification is available by request.

Full workflow, testing and publishing: [references/vscode-extensions.md](references/vscode-extensions.md).

## Skills (packaging for agent behavior)

- Loaded from `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`, and for compatibility `.claude/skills/`, `.codex/skills/` and their `~/` forms.
- `name` and `description` are required; `name` must equal the folder name.
- Built-in helpers: `/canvas`, `/create-skill`, `/create-rule`, `/create-hook`, `/create-subagent`.

## Plugins

Two formats. Details: [references/plugins.md](references/plugins.md).

| Format | Manifest | Carries |
| --- | --- | --- |
| Agent Plugins | root `plugin.json`, `$schema` agent-plugins.org | Skills and MCP servers only |
| Cursor Plugins | `.cursor-plugin/plugin.json` (`name` required) | Rules (`.mdc`), skills, agents, commands, hooks, MCP, variables |

A path in the manifest **replaces** the default folder; it does not add to it.

## Workflow

1. Pick the row in the table above. Do not add MCP for a panel.
2. Extension: scaffold, build, test in the Extension Development Host or sideload the `.vsix` in Cursor, then publish to Open VSX.
3. Plugin: author under `.cursor-plugin/`, test from `~/.cursor/plugins/local/<name>` after a window reload.
4. Team sharing: Dashboard, Plugins and MCPs, Import from Repo.
5. Public plugin listing: `https://cursor.com/marketplace/publish` (manual review, open source).

## Safety

- Extensions run with full user privileges. Request minimal activation events and capabilities, keep webview content security policy strict, and never ship secrets in a `.vsix`, manifest, rule, skill or canvas.
- Never put an Open VSX token in the repo or logs.
- Review hooks as code: they run commands on the user's machine.
- Do not publish to Open VSX, submit to a marketplace, tag or push without the user's explicit go-ahead this turn.
- Do not claim a canvas authoring API exists.

## Checklist

- [ ] Right mechanism chosen from the table.
- [ ] Extension `publisher.name` is unique on Open VSX; namespace claimed.
- [ ] Extension tested in Cursor itself, not only VS Code.
- [ ] Plugin `name` lowercase kebab-case; manifest paths start with `./` and stay inside the plugin.
- [ ] `${CURSOR_PLUGIN_ROOT}` used in `mcp.json`, not `${PLUGIN_ROOT}`.

## Anti-patterns

- Calling Canvas a mod or an extension API.
- Adding MCP just to get a panel.
- Publishing only to the Microsoft Marketplace and expecting Cursor discovery.
- Declaring a custom `skills` path and forgetting it replaces `skills/`.

## Pointers

| Need | Where |
| --- | --- |
| VS Code extension build, test, Open VSX publish | [references/vscode-extensions.md](references/vscode-extensions.md) |
| Plugin manifest, discovery, hooks, variables, marketplaces | [references/plugins.md](references/plugins.md) |
| Canvas workflows packaged as skills | [references/canvas.md](references/canvas.md) |
