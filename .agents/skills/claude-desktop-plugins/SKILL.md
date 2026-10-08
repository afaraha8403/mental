---
name: claude-desktop-plugins
description: >-
  Create, validate, and publish Claude plugins for Claude Desktop (Chat,
  Cowork, Code tab) and Claude Code: .claude-plugin/plugin.json, skills,
  commands, agents, hooks, MCP and LSP servers, userConfig, marketplaces and
  the Anthropic directory. Use when the user asks how to build a Claude Desktop
  plugin, what its requirements are, why a plugin will not install, or how to
  share it. Not for mods (JS modules) or .mcpb extensions.
license: MIT
compatibility: Needs the claude CLI (Claude Code) for validate, local test and marketplace commands; the finished plugin installs in Claude Desktop (Chat, Cowork, Code tab) and Claude Code. Some commands need newer versions (noted inline).
metadata:
  author: Ali Farahat
  tags: claude-desktop,claude-code,cowork,plugins,marketplace,mcp
  verified-against: code.claude.com/docs/en/plugins-reference and claude.com/docs/plugins/platform-support
when_to_use: |
  USE WHEN:
  - The user asks "how do I create a Claude Desktop plugin", "what are the
    requirements", "plugin.json", "marketplace.json", "claude plugin validate",
    "publish to the Claude plugin directory", or why a plugin is ignored.
  - They want to bundle skills, commands, agents, hooks, or MCP/LSP servers
    for Chat, Cowork or Claude Code.

  DO NOT USE WHEN:
  - The plugin needs JS code running inside Claude Code (panes, event handlers):
    use claude-desktop-mods (a mod is a plugin plus a module).
  - They want a double-click local MCP server package (.mcpb): use
    claude-desktop-extensions.
  - They only want a single standalone skill with no plugin packaging.
---

# Claude Desktop plugins

A **plugin** is a folder of components (skills, commands, agents, hooks, MCP/LSP servers...) with an optional manifest. One plugin works across surfaces, but **each surface loads only the components it supports**. Pick components with the support matrix in [references/platform-support.md](references/platform-support.md) first, or the plugin installs and does nothing.

Sources: `https://code.claude.com/docs/en/plugins-reference`, `https://claude.com/docs/plugins/platform-support`, `https://code.claude.com/docs/en/plugins/publish`. They change; fetch when unsure (`https://code.claude.com/docs/llms.txt`).

## Requirements (the short list)

1. A folder with **either** `.claude-plugin/plugin.json` **or** the standard layout (auto-discovered). The manifest is optional; if present, **`name` is the only required key**.
2. `name`: kebab-case, **permanent** (a rename is a different plugin). It must **not** start with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-`, must not be exactly `claude`, `anthropic`, `anthropics`, `claude-code`, or `claude-mods`, and must not combine `official` with `claude`/`anthropic`. Use `displayName` for the label users see.
3. **Only** `plugin.json` goes inside `.claude-plugin/`. Everything else sits at the plugin root.
4. Component paths in the manifest start with `./`, resolve **inside** the plugin root, and exist. `..` is an error. Inside hooks and MCP configs use `${CLAUDE_PLUGIN_ROOT}/...`.
5. Passes `claude plugin validate ./plugin --strict`.
6. To list in a directory: `description`, `author`, `homepage` (a parseable URL), `repository`, a README, and a privacy policy if it connects to external services.
7. Limits for the directory/Upload path: **5,000 files and 200 MB** per plugin (200 MB also caps the largest file for Upload plugin).

## Layout

```
my-plugin/
  .claude-plugin/plugin.json       # only this file lives here
  skills/<name>/SKILL.md           # directories
  commands/*.md                    # slash commands (load as skills in Chat)
  agents/*.md
  hooks/hooks.json                 # {"hooks": {...}}  (and "modules" for mods)
  .mcp.json                        # MCP servers
  .lsp.json                        # language servers (Claude Code only)
  output-styles/  themes/  monitors/monitors.json  workflows/
  bin/                             # executables added to PATH (Claude Code only)
  settings.json
```

Manifest keys that **replace** the default folder: `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors` (validate warns "Default folder is ignored"). `skills` **adds** to `skills/`. `hooks`, `mcpServers`, `lspServers` **merge**. Full field table, naming rules, `userConfig`, `lspServers`, `monitors`: [references/manifest.md](references/manifest.md).

## Workflow

1. **Decide the surfaces** (Chat, Cowork, Claude Code) and choose only components that load there. Say so to the user in one table.
2. **Scaffold** (`claude plugin init` if available; else hand-create). Pick the permanent name carefully.
3. **Write components.** Skills: `SKILL.md` with `name` + `description` (what + when). Commands: short `.md`. Hooks: wrap in a top-level `"hooks"` key. Use `userConfig` for settings and keys (`sensitive: true`); never hardcode secrets.
4. **Validate**: `claude plugin validate --strict ./my-plugin`. It exits 1 on warnings (drop `--strict` if you intentionally omit `version`). MCP checks need Claude Code >= 2.1.281.
5. **Try it**: `claude --plugin-dir ./my-plugin`; after edits, `/reload-plugins`. For Desktop: Add -> **Upload plugin** (a zip), or load the folder in the Code tab.
6. **Test a real install** through a local marketplace: `claude plugin marketplace add ./path`, `claude plugin install my-plugin@my-marketplace`, new session.
7. **Publish** via the route that fits ([references/publishing.md](references/publishing.md)): share the folder/zip, your own marketplace (`.claude-plugin/marketplace.json`), or the Anthropic directory.
8. **Version** deliberately: bump `version` every release, **or** omit it in a git-hosted marketplace so the commit SHA is the version. If `version` is set and unchanged, `claude plugin update` says "already at the latest version".

## Safety

- Hooks, `bin/` executables, and local MCP/LSP servers run code with the user's permissions. Ship only what the plugin needs and say what each one does in the README.
- Never commit tokens or keys; collect them with `userConfig` + `sensitive: true`.
- A plugin that sends user data to an external service needs a privacy policy URL (`privacyPolicyUrl`).
- Tell users to `claude plugin validate` and read a third-party plugin before installing it.

## Verification checklist

- [ ] `name` is kebab-case, permanent, and not a reserved/prefixed name
- [ ] `claude plugin validate --strict ./plugin` passes (no warnings)
- [ ] Every manifest path starts with `./`, exists, and stays inside the plugin
- [ ] Hooks/MCP use `${CLAUDE_PLUGIN_ROOT}`; no absolute or machine-specific paths
- [ ] No secrets in files; sensitive `userConfig` uses `sensitive: true`
- [ ] Components match the target surface (matrix checked); no `bin/` if Chat or Cowork must install it
- [ ] Loads with `claude --plugin-dir` and from a local marketplace install
- [ ] Metadata + README + `homepage` URL parse (if going to a directory)
- [ ] Under 5,000 files / 200 MB; no `node_modules`, `.git`, or build junk shipped by accident

## Anti-patterns

- Putting `skills/`, `hooks/` etc. **inside** `.claude-plugin/`.
- Naming the plugin `claude-something`, or renaming after release.
- Using `${user_config.*}` where it is not supported (shell-form hooks, monitors, `headersHelper`); use exec-form hook args or the `CLAUDE_PLUGIN_OPTION_<KEY>` env var.
- Shipping `bin/` and expecting Chat/Cowork to install it: those surfaces refuse the whole plugin.
- Relying on hooks, agents or local MCP in Chat. They are ignored there.
- Setting `version` and forgetting to bump it, then wondering why users get no update.
- Assuming marketplace auto-update: it is off by default for third-party marketplaces.
- Guessing field names. Unknown top-level keys are stripped with a warning; unknown keys in `userConfig`, `channels`, `lspServers`, `monitors` entries are **errors**.

## Pointers

| Need | Read |
| --- | --- |
| What works where | [references/platform-support.md](references/platform-support.md) |
| plugin.json fields, naming, userConfig, LSP, monitors | [references/manifest.md](references/manifest.md) |
| Routes, marketplace.json, directory submission, update flow | [references/publishing.md](references/publishing.md) |
| JS modules inside Claude Code | `claude-desktop-mods` |
| Local MCP server packaged as `.mcpb` | `claude-desktop-extensions` |
