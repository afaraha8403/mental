---
name: cursor-canvas-and-plugins
description: >-
  Add UI and distribution to Cursor without MCP: Canvases (interactive artifacts
  beside the chat, created by the built-in /canvas skill and packaged as skills),
  Cursor Plugins (.cursor-plugin/plugin.json with rules, skills, agents,
  commands, hooks, variables), Agent Plugins, local testing, team marketplaces
  and public marketplace submission. Use when the user wants Cursor canvas,
  a Cursor plugin, or to know whether Cursor has a UI/mod mechanism and whether
  it needs MCP.
license: MIT
compatibility: Needs Cursor with Plugins. Canvas sharing needs a paid plan with a team and a privacy mode that allows storage. Public listing needs an open-source Git repository.
metadata:
  author: Ali Farahat
  tags: cursor,canvas,plugins,marketplace,skills
  verified-against: cursor.com/docs/agent/tools/canvas, /docs/plugins, /docs/reference/plugins, /docs/skills
when_to_use: |
  USE WHEN:
  - The user asks for Cursor "UI", "mods", canvases, or whether Cursor needs
    MCP for them.
  - They want to build, test, share or submit a Cursor plugin
    (.cursor-plugin/plugin.json, marketplace.json, rules, hooks, variables).

  DO NOT USE WHEN:
  - The task is Mental's own release: use publishing-mental-to-stores.
  - The task is Claude, Codex, Copilot or OpenCode UI: use that skill.
---

# Cursor: canvas, plugins and skills (no MCP required)

## The honest answer on "UI without MCP"

- **Canvas** is Cursor's UI surface: an interactive artifact (React) that renders next to the chat. No MCP server is involved. Users create one by asking the agent, and Cursor's built-in `/canvas` skill does the rendering work.
- There is **no documented developer API** for authoring canvases by hand. The supported way to make a reusable one is to **package the workflow as a skill**: trigger description, layout instructions, data sources or queries, formatting rules. Treat community claims about `.canvas.tsx` files and a `cursor/canvas` import as **unverified**.
- A plugin can **bundle prebuilt canvases** (the vendor examples are listed on cursor.com). Authoring those has no public spec either, so state that gap rather than inventing one.
- MCP is optional everywhere here. Skills, rules, hooks, commands and agents need none.

Re-verify at `https://cursor.com/docs/agent/tools/canvas` (this page has no `.md` twin) before stating more.

## Canvas facts

- Saved, reopened, rerun. **Publish** creates a read-only team link.
- Sharing needs a paid plan, a team, and a privacy mode that permits data storage.
- Do not put secrets into a canvas that will be published.

## Skills (the packaging for canvases and everything else)

- Loaded from `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`, and for compatibility `.claude/skills/`, `.codex/skills/` and their `~/` forms.
- `name` and `description` are required; `name` must equal the folder name. Nested directories are supported and scoped to their subtree.
- Built-in helpers: `/canvas`, `/create-skill`, `/create-rule`, `/create-hook`, `/create-subagent`.
- This repo already keeps repo-only skills in `.agents/skills/`, which Cursor reads directly.

## Plugins

Two formats. Details and field tables: [references/plugins.md](references/plugins.md).

| Format | Manifest | Carries |
| --- | --- | --- |
| Agent Plugins | root `plugin.json`, `$schema` agent-plugins.org | Skills and MCP servers only |
| Cursor Plugins | `.cursor-plugin/plugin.json` (`name` required) | Rules (`.mdc`), skills, agents, commands, hooks, MCP, variables |

Defaults: `skills/`, `rules/`, `agents/`, `commands/`, `hooks/hooks.json`, `mcp.json`. A path in the manifest **replaces** the default folder; it does not add to it.

## Workflow

1. Decide what is needed. UI wish: skill that drives `/canvas`. Behavior wish: rule or skill. Automation wish: hook. Only add MCP when a tool must call an external system.
2. Author under `.cursor-plugin/` (or the Agent Plugins root manifest).
3. Test locally: place or symlink the plugin at `~/.cursor/plugins/local/<name>`, then restart or run Developer: Reload Window. Enterprise can disable local imports. A marketplace install with the same name wins.
4. Share with a team: Dashboard, Plugins and MCPs, Add Marketplace, Import from Repo. Auto Refresh needs the Cursor GitHub App.
5. Public listing: submit at `https://cursor.com/marketplace/publish`. Every plugin and every update is manually reviewed, and the repo must be open source.

## Safety

- Variables in a manifest are a schema of names only. Never place secret values in a manifest, rule, skill or canvas.
- Review hooks as code: they run commands on the user's machine.
- Do not submit to the marketplace, tag a release or push a plugin repo without the user's explicit go-ahead this turn.
- Do not claim a canvas authoring API exists; say it is undocumented.

## Checklist

- [ ] `name` lowercase kebab-case (alphanumerics, hyphens, periods).
- [ ] Manifest paths start with `./` and stay inside the plugin; no `..`.
- [ ] `${CURSOR_PLUGIN_ROOT}` used in `mcp.json`, not `${PLUGIN_ROOT}`.
- [ ] Skill `name` equals its folder; description says when to use it.
- [ ] Tested from `~/.cursor/plugins/local/<name>` after a window reload.

## Anti-patterns

- Adding MCP just to get a panel. Canvas needs none.
- Putting a version in places the marketplace does not read, then letting copies drift.
- Declaring a custom `skills` path and forgetting that it replaces `skills/`.
- Presenting unverified canvas file formats as official.

## Pointers

| Need | Where |
| --- | --- |
| Manifest fields, discovery, hooks, variables, marketplaces | [references/plugins.md](references/plugins.md) |
| Canvas workflows packaged as skills | [references/canvas.md](references/canvas.md) |
