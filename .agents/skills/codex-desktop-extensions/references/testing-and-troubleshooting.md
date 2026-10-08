# Testing and troubleshooting

Sources: `https://developers.openai.com/plugins/build/plugins.md`, `https://developers.openai.com/plugins/build/extensions.md`, `https://learn.chatgpt.com/docs/windows/windows-app.md`.

## Local loop for a plugin with a UI

1. Run the MCP server locally and expose it at a reachable HTTPS URL (tunnel or deployed dev host) when the web app must reach it. The desktop app can use a local server.
2. In `https://chatgpt.com/plugins`: plus -> **Add custom MCP server** -> **Create as a plugin**. Copy the generated `plugin_asdk_app...` ID.
3. Ask `@plugin-creator` (Work mode) or `$plugin-creator` (Codex) to build the plugin with that ID, including a personal marketplace entry.
4. **Restart the desktop app.** It loads installed plugins from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` (version `local` for local plugins). If edits do not show up, reinstall so the cache is refreshed.
5. Open the app, find the plugin, trigger the entrypoint.

Marketplace and install details: `codex-desktop-plugins`.

## What to test

| Case | Check |
| --- | --- |
| Cold open of each entrypoint | UI renders, no console CSP errors |
| Global entrypoint | Works with `{}` arguments |
| Theme | Light, dark, and host theme change |
| Display modes | `inline` and `fullscreen` both usable |
| File handler | Open, edit, save, forced `conflict`, `too-large` |
| Missing capability | Web or an older host: fallback path works |
| Tool errors | Error text is useful and leaks no paths or secrets |
| Reinstall | State survives or is migrated; no stale cache |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| UI never appears | Tool lacks `_meta.ui.resourceUri`, resource MIME type wrong, or entrypoint not declared |
| Blank iframe | External CSS/script blocked by CSP; inline or bundle it |
| First tool result missing | `app.connect()` ran before `ontoolresult` was set |
| Global app errors on open | Tool has required arguments |
| Entry rejected | More than 3 entrypoints, or unsupported display mode (`pip`) |
| File saves fail | Missing `ifMatch`, stale ETag (`conflict`), or file over the size limit |
| Mentions not shown | Not desktop, or tool visibility lacks `"app"` |
| Form not shown | Contains an unsupported input type, or server MCP version too old for registered servers |
| Changes ignored | App not restarted, or cache copy older than source |

## Windows notes

The Windows app is native (PowerShell, Windows sandbox) with optional WSL2, and supports plugins and skills. Extension behavior specific to Windows was not verified; test on the target OS and treat path handling carefully (drive letters, `\\wsl$\` paths) in file handlers.

## When something is undocumented

Read `docs/spec.md` and the `bits-and-bolts` sample first, then `https://developers.openai.com/llms.txt`. State clearly what you could not confirm instead of guessing field names.
