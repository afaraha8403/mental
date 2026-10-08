# GitHub Copilot CLI and VS Code

Sources: `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace`, `.../reference/copilot-cli-reference/cli-plugin-reference`.

## There is no central Copilot store submission

Copilot distribution is **push a marketplace repo**. A marketplace is any Git repo with `marketplace.json`, in `.github/plugin/` or `.claude-plugin/`. Copilot reads `.claude-plugin/marketplace.json`, so Mental's existing Claude marketplace file already serves Copilot. No portal or review exists. The built-in default marketplace is `awesome-copilot`; getting into it is a contribution to that project, not a form. Do not tell users there is a store listing.

## Users

```text
copilot plugin marketplace add afaraha8403/mental
copilot plugin install mental@mental
```

Alternative direct forms: `copilot plugin install afaraha8403/mental`, a Git URL, or a local path.

Update:

```text
copilot plugin marketplace update
copilot plugin update mental
```

Auto-update at session start covers the built-in `awesome-copilot` marketplace. A marketplace users add themselves updates automatically only if they set `autoUpdate: true` in their user settings. A repository-level setting cannot enable it. Path-sourced plugins from a local marketplace load live; no update command is needed.

## VS Code

Command Palette, **Chat: Install Plugin From Source**, then the GitHub URL.

## Manifest notes

Mental's root `plugin.json` is Agent Plugins 1.0.0: closed schema, skills in `skills/`, MCP in root `mcp.json` only. Names are 1 to 64 chars of lowercase letters, digits, hyphens and periods. Unknown top-level fields are reported and ignored; an unsupported Agent Plugins version is rejected outright.

## Managed environments

Organizations can pin or lock plugins with `enabledPlugins` and `extraKnownMarketplaces` in managed policy. If a user's org blocks the marketplace, the fix is with their admin.
