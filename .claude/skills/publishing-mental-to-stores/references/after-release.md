# After a release: what users run

The CLI install subcommand copies the skill and rules into `~/.claude`, `~/.codex`, `~/.cursor`, `~/.agents` and the OpenCode `AGENTS.md`. It does **not** refresh a host's plugin cache. Each host needs its own update step.

| Host | Update |
| --- | --- |
| npm CLI | `npm i -g @balacode/mental@latest`, then the install subcommand and `mental doctor` (see docs/install.md). Windows from 0.8.1 or older: run `mental-repair.cmd` once. |
| Claude Code | `claude plugin marketplace update mental`, `claude plugin update mental@mental`, then restart. |
| Copilot CLI | `copilot plugin marketplace update`, `copilot plugin update mental` |
| Cursor | Re-pull from the Git source in Customize, Plugins; for a symlinked local plugin, pull and reload the window. Team marketplaces refresh on their Auto Refresh schedule. |
| VS Code | Re-run Chat: Install Plugin From Source, or update from the plugin UI. |
| Codex | Run the install subcommand, then reinstall the plugin source if it was added as one. |

## Stale-version triage

1. `npm view @balacode/mental version` is the newest published.
2. `mental --version` is what runs locally.
3. A host plugin shows the version of its cached copy. If it differs, run that host's update row above; if still stale, confirm the repo's `.claude-plugin/plugin.json` version at the tagged commit matches.
4. If a plugin manifest sets `version` and a release forgot to bump it, hosts report "already at the latest version". Run `node scripts/bump-version.mjs --check`.
