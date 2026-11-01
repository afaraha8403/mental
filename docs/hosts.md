# Host UIs

Two host surfaces call the CLI. The Claude Code mod draws a panel inside Claude. The Cursor extension draws the dashboard in the activity bar. Neither one writes Mental files. Park and Hand off ask the agent to write through the skill.

Install the CLI first: `npm i -g @balacode/mental`, then `mental install`. Plugin steps for each host: [Install](./install.md).

## Claude Code mod

The mod ships with the Claude plugin. It needs Claude Code **2.1.287** or newer. Older builds ignore the mod. The skill and the rule still work.

Open it with `/mental`. On Claude Desktop, click the **Mental** button in the prompt footer. Desktop shows the panel in the **Code** tab for local sessions. It does not show it for WSL or cloud sessions. Check the version with `/status`.

The panel reads `mental heartbeat --json --passive`. `--passive` does not ping a running time clock. When the Desktop pane is open it also reads `mental brief --json --hops 8`. Browse uses `mental list` and `mental show`.

**Park** and **Hand off** send a prompt. The agent records the hop through the skill. **Hide** removes a concern from the footer only. The item stays in Mental.

The Dashboard card starts `mental dashboard --idle-exit 30` when no server is answering, then opens `http://localhost:<port>/#/today?p=<project>`. The host name is `localhost`. Claude Desktop does not open a bare `127.0.0.1` link.

`mental doctor` reports `claude-panel` with the Claude Code version it found on PATH. Claude Desktop bundles its own Claude. Use `/status` there.

Typography props need **2.1.299** or newer. Older mods still draw. They skip those props.

This is not MCP. The root plugin does not start `mental serve`. Codex and other host panels are not this mod.

## Cursor sidebar

The sidebar is a VS Code extension in `cursor-ext/`. It is not the Cursor plugin. The plugin copies the skill and the rule. The extension draws UI.

Install the packaged `.vsix` with **Extensions: Install from VSIX**. It is not part of `npm i -g @balacode/mental`. The view shells the `mental` binary on PATH. Set `mental.cliPath` if that binary is somewhere else. On Windows the default command is `mental.cmd`.

The activity-bar view embeds the dashboard Today page for the first workspace folder (`?embed=1`). If no dashboard answers, the extension starts one with `--no-open --idle-exit 30` and finds it through `~/.mental/dashboard.json`.

| Command | What it does |
| --- | --- |
| Park this session | Copies the park prompt and opens a new agent chat |
| Hand off this session | Copies the handoff prompt and opens a new agent chat |
| Refresh | Reloads the sidebar and the status item |
| Open the dashboard in the browser | Opens the live page |
| Stop the dashboard | Stops the server named in `dashboard.json` |

Cursor has no supported way for an extension to type into its chat. Paste the clipboard prompt and send it. The extension does not write the journal itself.

A status item shows how many items need you. Its tooltip has the resume line.

## Three different installs

| You want | What you install |
| --- | --- |
| Agents follow the skill | `mental install` (and the host plugin, if you use one) |
| A panel inside Claude | Claude plugin, which includes the mod |
| A sidebar in Cursor | The `cursor-ext` `.vsix` |
| Tool calls without a shell | `mental serve` or `mental install --mcp` (default off) |

The page those panels open: [Dashboard](./dashboard.md).
