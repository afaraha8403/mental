# Cursor plugins reference

Sources: `https://cursor.com/docs/plugins`, `https://cursor.com/docs/reference/plugins`, template `https://github.com/cursor/plugin-template`. Marketplace security: `https://cursor.com/help/security-and-privacy/marketplace-security.md`.

## Manifest (`.cursor-plugin/plugin.json`)

Only `name` is required: lowercase kebab-case, alphanumerics, hyphens and periods.

Optional: `description`, `version`, `author` (`name`, `email`), `homepage`, `repository`, `license`, `keywords`, `logo`, `rules`, `agents`, `skills`, `commands`, `hooks`, `mcpServers`, `variables`.

```jsonc
{
  "name": "acme-tools",
  "version": "1.0.0",
  "description": "Acme workflows for Cursor.",
  "author": { "name": "Acme" },
  "license": "MIT",
  "logo": "assets/logo.png"
}
```

## Discovery

| Component | Default | Notes |
| --- | --- | --- |
| Skills | `skills/` | Each subfolder has a `SKILL.md` |
| Rules | `rules/` | `.mdc` files |
| Agents | `agents/` | |
| Commands | `commands/` | |
| Hooks | `hooks/hooks.json` | Events include `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `beforeShellExecution`, `afterFileEdit`, `beforeMCPExecution`, `workspaceOpen` (list is not exhaustive) |
| MCP | `mcp.json` | Use `${CURSOR_PLUGIN_ROOT}`; `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are not expanded |

A manifest path **replaces** the default folder for that component.

## Variables

A JSON Schema of variable names the user fills in. Never embed values.

## Agent Plugins (portable)

Root `plugin.json` with `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Skills and MCP only. Rules, hooks and logo are not portable v1 components, so Cursor-specific extras go in `.cursor-plugin/plugin.json`.

## Multi-plugin repos

`.cursor-plugin/marketplace.json` lists several plugins in one repository.

## Local testing

1. Put or symlink the plugin at `~/.cursor/plugins/local/<name>`.
2. Restart Cursor, or run Developer: Reload Window.
3. If it does not load: enterprise may disable local imports ("Allow Local Plugin Imports"), or a marketplace plugin with the same name is taking precedence.

## Team marketplaces

Teams get 1, Enterprise unlimited. Dashboard, Plugins and MCPs, Add Marketplace, Import from Repo (GitHub, GitLab, Bitbucket, Azure DevOps). Settings: Auto Refresh (needs the Cursor GitHub App; re-indexes at most every 10 minutes), Marketplace Access, install modes (Default Off, Default On, Required), Allow Members to Publish. A personal skill can be published to the team from Customize, Skills, Publish.

## Public marketplace

- Submit at `https://cursor.com/marketplace/publish`.
- Manual review of every plugin and every update.
- Must be open source; distributed as Git repos.
- Community directory: `cursor.directory` (separate, not the official store).
- The CLI has no marketplace install (plugin directory flag only).
