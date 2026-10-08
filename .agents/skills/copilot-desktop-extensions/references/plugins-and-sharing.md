# Copilot plugins and sharing

Primary sources: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference` and `.../how-tos/copilot-cli/customize-copilot/plugins-marketplace`. App repo config: `.github/github-app.yml` (reference under docs.github.com "repository configuration" for the Copilot app).

## Sharing a single extension

- `share_extension { name, scope }` uploads the extension folder to a **private gist** and returns the URL.
- `install_extension { url, scope, name? }` installs from a gist URL, a bare gist id, or a GitHub repo folder URL (`https://github.com/<owner>/<repo>/tree/<ref>/<path>`), then reloads. Scopes: `user`, `project`, `session`.
- Only share or install with the user's explicit go-ahead. Installing runs third-party code.

## Plugins (the packaging unit)

A Copilot plugin is a directory with a manifest. Two manifest dialects:

| Dialect | Manifest | Notes |
| --- | --- | --- |
| Agent Plugins 1.0 (portable) | root `plugin.json` with `$schema` agent-plugins.org 1.0.0 or 1.1.0 | Closed schema. Portable components are only `skills/` and root `mcp.json`. Copilot-specific parts live under `com.github.copilot/` (`agents/`, `commands/`, `rules/`, `hooks/hooks.json`, `lsp.json`). Name: 1 to 64 chars of lowercase letters, digits, hyphens, periods; no `--` or `..`. |
| Legacy | `plugin.json`, `.plugin/plugin.json` or `.claude-plugin/plugin.json` | Only `name` required. Component path fields: `agents`, `skills`, `commands`, `hooks`, `extensions`, `mcpServers`, `lspServers`. |

A plugin that declares an Agent Plugins version Copilot does not support is **rejected** and contributes nothing. In a legacy manifest, `extensions` lists **extension directories**; `{ paths: [...], exclusive: true }` suppresses built-in extensions. In an Agent Plugins manifest, `extensions` means something else (client-specific data keyed by reverse-domain namespace).

For stdio MCP servers inside a plugin, `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand in `args`, `env` and `cwd`. Remote server values are passed through literally.

## Marketplaces

A marketplace is any Git repo (or local path) with `marketplace.json`.

- Location: `.github/plugin/marketplace.json`. Copilot also reads `.claude-plugin/marketplace.json`, which is why one file can serve both Claude Code and Copilot.
- Required shape: `name`, `owner`, `plugins[]` with `name` and `source` per entry. `source` is a path relative to the repo root, or an object that points at another repo.
- Users: `copilot plugin marketplace add OWNER/REPO`, `copilot plugin marketplace browse NAME`, `copilot plugin install PLUGIN@MARKETPLACE`, `copilot plugin update NAME` (or `--all`), `copilot plugin marketplace update`.
- Direct install forms also work: `OWNER/REPO`, `OWNER/REPO:PATH`, a Git URL, or a local path.
- Auto-update at session start applies to the built-in `awesome-copilot` marketplace, and to your own marketplace only if the user opts in with `autoUpdate: true` in their user settings.
- There is no submission portal. The built-in default marketplace is `awesome-copilot`; ask GitHub's maintainers via that repo's contribution process if inclusion is wanted. Do not claim a portal exists.

## Skills-only install

`copilot skill add` installs a skill directly, outside plugins and marketplaces.
