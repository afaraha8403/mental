---
name: opencode-plugins
description: >-
  Build OpenCode plugins and terminal UI extensions without MCP: v1 hook plugins
  (@opencode-ai/plugin, config key plugin), v2 Plugin.define server plugins
  (@opencode/plugin, config key plugins), v2 TUI/CLI plugins
  (@opencode/plugin/tui, dialogs, keymap, routes, toasts), discovery paths,
  the V1 to V2 migration, and npm distribution. Use when the user wants an
  OpenCode plugin, mod, TUI customization, or asks whether OpenCode has a UI
  extension mechanism.
license: MIT
compatibility: Needs OpenCode. Two doc generations exist (v1 at opencode.ai/docs, v2 at opencode.ai/v2/docs); V1 plugin implementations do not run on V2, so confirm which the user runs before writing code.
metadata:
  author: Ali Farahat
  tags: opencode,plugins,tui,hooks,npm
  verified-against: opencode.ai/docs/plugins and opencode.ai/v2/docs/build/plugins (server, cli, migrate-v1)
when_to_use: |
  USE WHEN:
  - The user wants an OpenCode plugin, hook, custom tool, command, or TUI
    dialog/route/keybinding, or asks if OpenCode has "mods" or UI.
  - They mention Plugin.define, @opencode/plugin, @opencode-ai/plugin,
    .opencode/plugins, cli.json, or migrating a V1 plugin.

  DO NOT USE WHEN:
  - The task is Mental's own release: use publishing-mental-to-stores.
  - The task is Claude, Codex, Copilot or Cursor UI: use that skill.
---

# OpenCode plugins and TUI extensions

**Not a desktop mod target.** OpenCode's docs say plugins change behavior, and "to change the terminal UI, build a CLI plugin" (`opencode.ai/v2/docs/build/plugins`). No documented plugin API changes the UI of the OpenCode desktop app or web UI. Do not treat this skill as the OpenCode equivalent of Claude Desktop mods; it covers server plugins (hooks, tools) and TUI plugins only. Both need no MCP. Re-check the docs for a desktop UI extension API before stating otherwise.

## First: which generation?

| | v1 | v2 |
| --- | --- | --- |
| Docs | `opencode.ai/docs/plugins/` | `opencode.ai/v2/docs/build/plugins` |
| Package | `@opencode-ai/plugin` | `@opencode/plugin` (TUI: `@opencode/plugin/tui`) |
| Shape | `export const X: Plugin = async (ctx) => hooks` | `export default Plugin.define({ id, async setup(ctx) { return cleanup } })` |
| Config key | `plugin` | `plugins` |

V1 implementations **do not run in V2**. Ask or check the user's version, then follow one generation only. Details: [references/v1-hooks.md](references/v1-hooks.md), [references/v2-server.md](references/v2-server.md), [references/v2-tui.md](references/v2-tui.md), [references/migrate-and-publish.md](references/migrate-and-publish.md).

## Requirements (v2)

1. A stable `id` on every plugin. Storage is scoped by it.
2. Default export from `Plugin.define`.
3. Return a cleanup function from `setup` instead of a `dispose` hook.
4. Published plugins depend on a compatible `@opencode/plugin` range.
5. No Bun `$` shell helper; v2 removed it.

## Where plugins load

- Local server plugins: `.opencode/plugins/<name>/index.ts` (v2 also reads `.opencode/plugin/`); v1 also reads `~/.config/opencode/plugins/`.
- TUI plugins: `<global-config>/plugins/<name>/{index.ts,tui.ts}` and `<project>/.opencode/plugins/<name>/`.
- Config: `opencode.json(c)` for server plugins, `cli.json` for TUI plugins. Entries are a package name (optionally `@version`), a path, a `file://` URL, or `{ package, options }`. A `-id` or `-wildcard` prefix disables a TUI plugin. The docs do not give the global `cli.json` path; do not assert one.

## Workflow

1. Pick the generation and the surface (server or TUI).
2. Write `.opencode/plugins/<name>/index.ts` (or `tui.ts`).
3. Restart OpenCode and exercise the feature.
4. For distribution, publish an npm package and list it in the user's config by name.

## Safety

- Plugins run with the user's privileges. Never read or log environment secrets; do not forward prompts, tool inputs or files to remote servers without disclosure.
- `shell.env` and `permission` hooks can change what the agent may do. Keep them narrow and explainable.
- Do not bind `ctrl+n` or `ctrl+p` in dialogs; they are reserved for navigation.
- Keep `keymap.layer` factories pure.
- Do not `npm publish` or open an upstream PR without the user's explicit go-ahead this turn.

## Checklist

- [ ] Generation confirmed; config key matches (`plugin` vs `plugins`).
- [ ] Stable `id`; cleanup returned; every subscription unsubscribed.
- [ ] Dependency range on `@opencode/plugin` (v2) or `@opencode-ai/plugin` (v1).
- [ ] Tested in a project-local `.opencode/plugins/` before publishing.

## Anti-patterns

- Copying a V1 example into a V2 project.
- Building an MCP server to add a keybinding or dialog.
- Importing the plugin SDK by absolute path (TUI imports resolve at runtime).
- Leaving listeners registered without returning cleanup.

## Pointers

| Need | Where |
| --- | --- |
| V1 hooks, events, custom tools | [references/v1-hooks.md](references/v1-hooks.md) |
| V2 server `ctx` API | [references/v2-server.md](references/v2-server.md) |
| V2 TUI context, dialogs, keymap, routes | [references/v2-tui.md](references/v2-tui.md) |
| Migration table and publishing | [references/migrate-and-publish.md](references/migrate-and-publish.md) |
