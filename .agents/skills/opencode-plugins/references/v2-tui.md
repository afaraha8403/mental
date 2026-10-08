# OpenCode v2 TUI (CLI) plugins

Source: `https://opencode.ai/v2/docs/build/plugins/cli`. This is OpenCode's UI mechanism: terminal only, no MCP. The page was truncated after the "Model" section during research, so slot APIs are unverified.

```tsx
import { Plugin } from "@opencode/plugin/tui";

export default Plugin.define({
  id: "acme-tui",
  setup(context) {
    // register commands, routes, dialogs
  },
});
```

The import resolves at runtime; do not use an absolute path.

## Context

| Member | Purpose |
| --- | --- |
| `options`, `app` (`version`, `channel`), `location` | Config and environment |
| `client` | Generated client; can reach a remote server |
| `renderer`, `theme` | OpenTUI renderer and theme |
| `data.*` | Session, project, shell and location data: `list`, `get`, `sync`, `invalidate`. Events via `data.on` and `data.listen`, each returning an unsubscribe function |
| `attention.notify` | Draw the user's attention |
| `markdown.registerCodeBlockRenderer` | Custom code-block rendering |
| `keymap.layer` | Commands with `id`, `title`, `bind`, `palette`, `slash`; mode push/pop; dispatch. The layer factory must be pure |
| `storage.store`, `storage.memory` | Durable JSON synced across TUI instances, or in-memory |
| `ui.dialog` | `alert`, `confirm`, `prompt`, `select` (with `search` and `actions`), custom JSX via `show`, `set`, `clear` |
| `ui.toast.show` | Toasts |
| `ui.router` | `register` and `navigate` routes |
| `ui.tabs` | Tabs |

A Solid/OpenTUI JSX `usePlugin()` hook is available for components.

## Rules

- Do not bind `ctrl+n` or `ctrl+p` inside dialogs.
- Return or call every unsubscribe function you receive.
- Config lives in `cli.json` under `plugins`. A `-id` or `-wildcard` prefix disables a plugin. Plugins in `opencode.json(c)` that expose a TUI component also load automatically.
- Discovery: `<global-config>/plugins/<name>/{index.ts,tui.ts}` and `<project>/.opencode/plugins/<name>/`.
