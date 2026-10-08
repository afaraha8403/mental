# OpenCode v2 server plugins

Source: `https://opencode.ai/v2/docs/build/plugins`. The page is long; the domains below are the ones confirmed.

```ts
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "acme-guard",
  async setup(ctx) {
    const off = ctx.tool.hook("execute.before", async (event) => {
      // inspect or block
    });
    return () => off.dispose();
  },
});
```

`ctx` is an OpenCode client plus an extension API grouped by domain.

| Domain | Use |
| --- | --- |
| `ctx.location`, `ctx.options`, `ctx.storage`, `ctx.app` | Context, options from config, storage scoped by plugin `id`, app info |
| `ctx.tool` | `hook("execute.before" or "execute.after")`, `transform` |
| `ctx.shell` | `hook("create.before")` |
| `ctx.session` | `hook("prompt", "context", "model.request", "http.request", "compaction", "generate", "title")` |
| `ctx.permission` | `hook("evaluate")` |
| `ctx.event` | `subscribe()` |
| `ctx.command` | `transform(editor => editor.add({ name, description, execute }))` |
| `ctx.integration`, `ctx.mcp`, `ctx.reference`, `ctx.provider`, `ctx.model`, `ctx.agent` | Transform registrations; each domain also has `reload()` and `list()` |

Registrations are disposed on unload. `registration.dispose()` removes one early.

Config: `plugins` (plural) in `opencode.json(c)`. Entries: package name with optional `@version`, a path, a `file://` URL, or `{ package, options }`. Local plugins load automatically from `.opencode/plugins/<name>/index.ts`.

A custom slash command is a `ctx.command.transform` registration, so no MCP is needed for one.
