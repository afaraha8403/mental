# Platform support: what loads where

Source: `https://claude.com/docs/plugins/platform-support`. Re-check before promising behavior; this table drifts.

**Surfaces**: *Chat* = claude.ai and the Chat tab of the desktop app. *Cowork* = the desktop app's Cowork. *Claude Code* = terminal, IDE extensions, and the desktop app's Code tab.

| Component | Chat | Cowork | Claude Code |
| --- | --- | --- | --- |
| Skills | Loads | Loads | Loads |
| Commands | Loads as a skill | Loads | Loads |
| Agents | Ignored | Loads | Loads |
| Hooks | Ignored | Loads | Loads |
| Remote MCP (http/sse, fixed URL) | Listed under Connectors tab | Loads | Loads |
| Local MCP / `.mcpb` | Ignored | Loads when the session runs on the user's computer | Loads |
| MCP that references `${user_config.*}` | Ignored | Ignored if no default (no prompts) | Loads (prompts the user) |
| `bin/` executables | **Plugin cannot be installed** | **Plugin cannot be installed** | Loads |
| LSP servers, output styles, themes, `settings` | Ignored | Ignored | Loads |

"Ignored" = the rest of the plugin still installs. "Cannot be installed" = the surface refuses the **whole plugin**.

## Design rules that follow

- Want Chat reach: ship skills and commands only (plus remote MCP as a connector).
- Want Cowork: add agents, hooks, remote or local MCP, but **no `bin/`** and no required `userConfig` references in MCP without defaults.
- Want everything: Claude Code only; say clearly the plugin is "Claude Code only".
- Mods (JS modules) live in `hooks/hooks.json` `modules` and run only in the CLI and the Desktop Code tab. See `claude-desktop-mods`.

## Directory and install limits

- Per plugin: up to 5,000 files and 200 MB.
- Per account: up to 25 self-added marketplaces.
- Install from a file: Add -> **Upload plugin** (zip), or `claude --plugin-dir` in Claude Code.
- Admin states per plugin: Not available / Available to install / Installed by default / Required.
- `/plugin directory` needs Claude Code >= 2.1.287. Plugins installed on the account sync to Claude Code as `name@synced`.
