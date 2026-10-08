# Copilot extensions: tools, hooks, canvases

Verified against the Copilot SDK docs shipped with the desktop app. Re-read `extensions_manage { operation: "guide" }` before relying on any detail here; the API is young.

## Process model

- The CLI forks each extension as a Node.js process and speaks JSON-RPC over stdio.
- Lifecycle: loaded at session start, reloaded on `/clear` or when the foreground session is replaced, stopped on CLI exit (SIGTERM, then SIGKILL after 5 seconds).
- `extensions_reload` re-reads everything from disk after you edit.
- `extensions_manage list` shows loaded extensions and a log file path. `inspect` returns details plus a log tail; use it first when something is `failed`.

## Tools

```js
import { joinSession } from "@github/copilot-sdk/extension";

await joinSession({
  tools: [
    {
      name: "acme_lookup",
      description: "Look up an Acme record by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      handler: async (args, invocation) => `record ${args.id}`,
    },
  ],
});
```

- `parameters` is JSON Schema.
- A handler returns a string, or `{ textResultForLlm, resultType }` where `resultType` is `success`, `failure`, `rejected` or `denied`.
- Prefix tool names with your extension name (`acme_*`) so they cannot collide with another extension.

## Hooks

Passed to `joinSession({ hooks })`. Examples: `onUserPromptSubmitted`, `onPreToolUse`, `onPostToolUse`. `agent-author.md` lists the full set. `onPreToolUse` can allow or deny a call, which is the right place for guardrails.

## Canvases

| Piece | Notes |
| --- | --- |
| `id` | Stable canvas type id. The agent passes it to `open_canvas`. |
| `inputSchema` | Optional JSON Schema for `open_canvas` input. |
| `actions[]` | `{ name, description, inputSchema?, handler(ctx) }`. The agent calls them with `invoke_canvas_action`. |
| `open(ctx)` | Returns `{ title, url }`. `ctx.instanceId` identifies the panel; reopening the same id should reuse state. |
| `onClose(ctx)` | Tear down servers, watchers and timers for that instance. |

Agent-side tools: `open_canvas({ canvasId, instanceId, input })`, `invoke_canvas_action({ instanceId, actionName, input })`, `list_canvas_capabilities({ canvasId })`. Built-in canvas types are `browser`, `editor` and `terminal`. Your own appear alongside them.

Hosting pattern from the scaffold: one `http.createServer` per instance, `listen(0, "127.0.0.1")`, return its URL. Keep canvases free of external network requests so they work offline and leak nothing.

## Debugging

1. `extensions_manage inspect` shows the log tail.
2. A tool-name collision means the second extension fails to load; rename.
3. If `joinSession` rejects, check whether an env-var request was denied.
4. Any stdout write corrupts the JSON-RPC channel. Search for `console.log`.
5. Nothing happens after an edit: you forgot `extensions_reload`.
