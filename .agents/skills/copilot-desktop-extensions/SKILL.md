---
name: copilot-desktop-extensions
description: >-
  Build extensions for the GitHub Copilot desktop app and Copilot CLI: the
  extension.mjs Node process, joinSession, custom tools, lifecycle hooks, and
  canvases (side-panel UI the agent can open and drive) with no MCP server.
  Covers discovery paths, scaffolding, reload and debugging with
  extensions_manage, sensitive env vars, sharing via gists, and shipping
  extensions inside a Copilot plugin. Use when the user wants to create, debug
  or share a Copilot desktop extension, canvas or tool.
license: MIT
compatibility: Needs the GitHub Copilot desktop app or Copilot CLI with extensions enabled. Extensions are Node.js ES modules; @github/copilot-sdk is auto-resolved by the CLI and must not be installed.
metadata:
  author: Ali Farahat
  tags: github-copilot,desktop,extensions,canvas,tools,hooks
  verified-against: Copilot SDK docs shipped with the app (extensions.md, agent-author.md) and docs.github.com CLI plugin reference
when_to_use: |
  USE WHEN:
  - The user wants a Copilot desktop or CLI extension, a custom tool, a hook,
    or a canvas (panel UI) and asks what it requires.
  - They mention extension.mjs, joinSession, createCanvas, .github/extensions,
    extensions_reload, extensions_manage, or share_extension.

  DO NOT USE WHEN:
  - The task is a Copilot plugin (plugin.json, marketplace, skills bundle):
    see references/plugins-and-sharing.md, and publishing-mental-to-stores for
    Mental's own release.
  - The user wants Claude, Codex, Cursor or OpenCode UI: use that platform's
    skill.
---

# Copilot desktop extensions (no MCP needed)

Copilot is the one platform here where "mods" are first-class and need **no MCP server**. An extension is a separate Node.js process the CLI forks and talks to over JSON-RPC on stdio. It can add tools, register hooks, request env vars, and register **canvases**. Canvases are the UI: a panel in the app that the agent opens (`open_canvas`) and drives (`invoke_canvas_action`).

Source of truth, in order: the `extensions_manage` tool with `operation: "guide"` (always call it before writing code), then the SDK docs shipped with the desktop app (`extensions.md`, `agent-author.md`, `examples.md`, `index.d.ts` under the app's `copilot-sdk\docs` folder; the path is machine-specific, so locate it rather than assuming).

## Requirements

1. File named exactly `extension.mjs`. Only `.mjs` is supported.
2. One immediate subdirectory per extension. Discovery is not recursive.
3. Import from `@github/copilot-sdk/extension`. Never add it to `package.json`; the CLI resolves it.
4. Call `joinSession({ tools, hooks, canvases, requestedEnvironmentVariables })` once.
5. Tool names are globally unique across all loaded extensions. A collision makes the second extension fail to load.
6. Never write to stdout (`console.log`). Stdout is the JSON-RPC channel. Use `session.log()`.

## Where extensions live

| Scope | Path |
| --- | --- |
| Project | `.github/extensions/<name>/extension.mjs` (relative to the git root) |
| User | the Copilot config directory's `extensions/<name>/` |
| Session | `<session-state>/extensions/<name>/` (this session only) |
| Plugin | a plugin that declares extension directories |

A project extension shadows a user extension of the same name. Pick a scope on purpose: project for repo tooling that teammates share, user for personal tools, session for experiments.

## Workflow

1. Call `extensions_manage` with `operation: "guide"`.
2. Scaffold: `extensions_manage { operation: "scaffold", kind: "basic" | "canvas", location, name }`.
3. Edit the generated `extension.mjs`. Split a complex canvas into sibling files.
4. Call `extensions_reload`. New tools are available immediately, even mid-turn.
5. Verify: `extensions_manage { operation: "list" }`, then `inspect` for the log tail of a failed extension.
6. Exercise it: for a canvas, `list_canvas_capabilities`, `open_canvas`, then `invoke_canvas_action`.

## Canvas in one screen

A canvas has an `id`, `displayName`, `description`, optional `inputSchema`, `actions`, an `open(ctx)` that returns `{ title, url }`, and `onClose(ctx)`. The scaffold serves HTML from a loopback server per `ctx.instanceId`.

```js
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";
import http from "node:http";

const servers = new Map();

const status = createCanvas({
  id: "status",
  displayName: "Status",
  description: "Shows project status the agent can update.",
  actions: [{ name: "set", description: "Replace the text", handler: (ctx) => { state.text = String(ctx.input?.text ?? ""); } }],
  async open(ctx) {
    let entry = servers.get(ctx.instanceId);
    if (!entry) {
      const server = http.createServer((_q, res) => res.end(`<p>${escapeHtml(state.text)}</p>`));
      await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
      entry = { server };
      servers.set(ctx.instanceId, entry);
    }
    return { title: "Status", url: `http://127.0.0.1:${entry.server.address().port}/` };
  },
  onClose(ctx) { servers.get(ctx.instanceId)?.server.close(); servers.delete(ctx.instanceId); },
});

const state = { text: "ready" };
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
await joinSession({ canvases: [status] });
```

Treat that as a shape, not a template: start from the scaffold, which is current. Full API detail: [references/canvas-and-tools.md](references/canvas-and-tools.md).

## Sensitive environment variables

The CLI strips secrets such as `GITHUB_TOKEN` from extension processes. An extension asks by name through `requestedEnvironmentVariables`; the user is prompted and the approval is remembered per exact name set. A denial makes `joinSession` reject and the extension does not load. Request only what is needed.

## Safety

- Bind canvas servers to `127.0.0.1` on an ephemeral port only. Never `0.0.0.0`.
- Escape every value interpolated into canvas HTML. Tool and action input is untrusted.
- Never log or echo secrets. Never hard-code tokens in an extension.
- A project extension runs with the user's permissions the moment a teammate opens the repo. Review `.github/extensions/` changes as code, and do not auto-install extensions from untrusted gists.
- Do not publish, share to a gist, or install a third-party extension without the user's explicit go-ahead this turn.

## Checklist

- [ ] `extension.mjs` in an immediate subdirectory; no `console.log`.
- [ ] Tool names unique; handlers return a string or `{ textResultForLlm, resultType }`.
- [ ] Canvas `onClose` frees every server, timer and watcher.
- [ ] `extensions_reload` run, then `list` shows it loaded and `inspect` has no errors.
- [ ] Only the env vars it truly needs are requested.

## Anti-patterns

- Adding an MCP server for something an extension tool or canvas already does.
- Installing `@github/copilot-sdk` locally.
- Naming the entry file `extension.js` or `index.mjs`.
- One giant file for a stateful canvas.
- Leaving a loopback server running after `onClose`.

## Pointers

| Need | Where |
| --- | --- |
| Tools, hooks, canvas API, debugging | [references/canvas-and-tools.md](references/canvas-and-tools.md) |
| Plugins, sharing, extension dirs in a plugin | [references/plugins-and-sharing.md](references/plugins-and-sharing.md) |
