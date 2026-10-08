---
name: codex-desktop-extensions
description: >-
  Build custom UI for the ChatGPT desktop app (formerly the Codex app) with
  Plugin Extensions: MCP Apps tools carrying openai/ui metadata for sidebar,
  thread, file and settings entrypoints, display modes, settings, deep links,
  model context, file handlers, composer mentions and rich forms. Use when the
  user wants a panel, viewer or editor inside the ChatGPT or Codex desktop app,
  or asks how it differs from Claude mods. This is not a mod mechanism: it
  requires MCP. Not for packaging only.
license: MIT
compatibility: Needs Node 20+ and the @openai/mcp-extensions and @modelcontextprotocol/ext-apps packages (or the Python SDK), plus a ChatGPT desktop app with plugins enabled to try it. Desktop supports every extension; web and mobile support fewer.
metadata:
  author: Ali Farahat
  tags: chatgpt-desktop,codex,mcp-apps,plugin-extensions,ui
  verified-against: github.com/openai/mcp-extensions docs/spec.md and developers.openai.com/plugins/build/extensions
when_to_use: |
  USE WHEN:
  - The user wants custom UI in the ChatGPT or Codex desktop app: a sidebar
    app, a per-thread side-panel tab, a file viewer or editor, a settings page,
    composer @-mentions, or a rich form.
  - They say "Codex mods", "Codex UI", "MCP Apps", "openai/ui", "entrypoint",
    "plugin extensions", or ask how to extend the desktop app.

  DO NOT USE WHEN:
  - The work is only packaging, the manifest, marketplaces or submission: use
    codex-desktop-plugins.
  - The work is a SKILL.md or agents/openai.yaml: use codex-desktop-skills.
  - The user wants Claude Desktop mods: use claude-desktop-mods.
---

# ChatGPT / Codex desktop extensions (the "UI" mechanism)

**Not a mod.** Per project scope, a mod is a mechanism that changes the desktop app's own UI without MCP, like Claude Desktop mods. Plugin Extensions need an MCP server, so they do not count. This skill is reference for MCP-backed UI only; do not offer it as the Codex answer to "build a mod". For a mod request, say Codex has no mod mechanism.

The ChatGPT desktop app has **no JS-injection mod system**. Its official, supported way to add UI is **Plugin Extensions**: an MCP server whose tools return **MCP Apps** (sandboxed iframes served as `ui://` resources). The host reads `_meta["openai/ui"]` on tools and resources to decide where the UI appears. Extensions are `@openai/mcp-extensions` plus the MCP Apps SDK, packaged inside a plugin (`codex-desktop-plugins`).

Sources (fetch when unsure; they change): `https://developers.openai.com/plugins/build/extensions.md`, `https://github.com/openai/mcp-extensions` (read `docs/spec.md`), index `https://developers.openai.com/llms.txt`. The sample plugin is `plugins/bits-and-bolts` in that repo.

## Choose the entrypoint

| Want | Entrypoint in `_meta["openai/ui"].entrypoints[]` | Notes |
| --- | --- | --- |
| App in the sidebar / fullscreen | `{ "type": "global" }` | Tool must accept `{}` arguments. Optional `quickAction`. |
| Tab in the per-thread side panel | `{ "type": "thread" }` | Scoped to the open thread. |
| Viewer/editor for file types | `{ "type": "file", "extensions": [".stl"] }` | Desktop only. |
| Settings page | `settings` entry with `searchTerms` | Pair with `openai/settings` read/update tools. |

At most **3 entrypoints per app**. Display modes live on the **resource** `_meta["openai/ui"]`: `preferredDisplayMode` and `availableDisplayModes` (`inline`, `fullscreen`; `pip` is unsupported). Field-level detail: [references/entrypoints-and-ui.md](references/entrypoints-and-ui.md).

## Capabilities (all opt-in)

| Need | Mechanism |
| --- | --- |
| Structured settings | `openai/settings` capability with `readTool` and `updateTool` |
| Deep link to a tool | `codex://plugins/{pluginId}@{marketplace}/app/{tool}?path=...` on desktop; `chatgpt://` on mobile |
| Tell the model what the user sees | `ui/update-model-context` |
| Send a message from the UI | `ui/message` with `_meta["openai/message"]` (`target`, `send`) |
| Save files safely | opaque `resourceUri` plus `openai/resources/write` with `ifMatch` ETag |
| Open a local file | `openai/files/open` (host capability `openai/files`) |
| @-mention items in the composer | tool `_meta["openai/extensions"]["mentions/search"]`, visibility includes `"app"` |
| Rich forms | `openai/elicitation/create` with `x-openai-input`, `x-openai-suggestions`, thumbnails |

Schemas and outcomes: [references/extensions-api.md](references/extensions-api.md). Always feature-detect the host capability; never assume it.

## Platform support

Desktop supports everything. **Web** lacks the file entrypoint, file opening, file resources and composer mentions. **Mobile** is partial. Design a graceful fallback, and tell the user which surfaces the plugin reaches. Windows desktop exists and runs plugins; Windows-specific extension behavior was not verified.

## Workflow

1. **Pick the entrypoint and the data flow.** Draw: tool -> `ui://` resource -> iframe -> tools called back from the app.
2. **Scaffold** the MCP server with the TypeScript or Python SDK (start from `bits-and-bolts`). Register each UI with `registerAppTool` + `registerAppResource` and `RESOURCE_MIME_TYPE`.
3. **Declare** `_meta["openai/ui"]` on tools (entrypoints, quickAction) and on resources (display modes). App-only helper tools get `_meta.ui.visibility: ["app"]`.
4. **Build the iframe app** with `@openai/mcp-extensions/app`. Register `app.ontoolresult` **before** `app.connect()`.
5. **Style**: bundle or inline all CSS (the iframe CSP blocks external stylesheets). Use `@openai/mcp-extensions/app/styles.css` tokens and a monochrome SVG icon using `currentColor` (20x20 viewport, 1.33px strokes).
6. **Package** as a plugin and test locally per [references/testing-and-troubleshooting.md](references/testing-and-troubleshooting.md): custom MCP server -> "Create as a plugin" -> `@plugin-creator`.
7. **Test every surface** you claim; verify fallbacks where a capability is absent.
8. **Distribute** via a marketplace or public submission (`codex-desktop-plugins`). The MCP server must be reachable at a public HTTPS URL for public listing.

## Security (filesystem and data)

- The host **never gives raw paths** to the app. The server receives `_meta["openai/resource"].path`; it must `realpath` it and confine reads/writes to the opened file's directory. Reject symlink escapes.
- Never expose host paths, tokens or stack traces in error text shown in the UI.
- Writes use `ifMatch`; handle `saved`, `conflict` and `too-large` outcomes instead of overwriting.
- Treat tool arguments from the iframe as untrusted input; validate with a schema.
- No secrets in the plugin ZIP or in iframe bundles. Keep credentials server-side.
- Local-process plugins run with the user's permissions; document what each tool can do. Anything unofficial (see below) needs explicit user consent.

## Verification checklist

- [ ] Every tool that returns UI has a matching `ui://` resource with `RESOURCE_MIME_TYPE`
- [ ] Global entrypoint tool succeeds with `{}` arguments
- [ ] No more than 3 entrypoints; display modes limited to `inline`/`fullscreen`
- [ ] `ontoolresult` is registered before `connect()`
- [ ] CSS is inlined or bundled; no external stylesheet, font or script URLs
- [ ] File handlers: paths realpath-confined; `conflict` and `too-large` handled
- [ ] Optional capabilities are feature-detected; web/mobile fallback checked
- [ ] Tested on desktop after restarting the app; plugin reinstalled from cache if needed
- [ ] Icon is monochrome `currentColor` SVG

## Anti-patterns

- Looking for an injection or theming API. Use MCP Apps; DOM patching of the app is unsupported.
- Using `pip` display mode or more than 3 entrypoints.
- Calling `app.connect()` first and losing the initial tool result.
- Loading CSS or fonts from a CDN inside the iframe.
- Accepting an arbitrary path from the iframe and reading it directly.
- Required arguments on a `global` entrypoint tool.
- Assuming a capability exists on every surface.
- Adding an MCP server to a skills-only plugin that is already published (unsupported).

## Pointers

| Need | Read |
| --- | --- |
| Entrypoints, resources, display modes, styling | [references/entrypoints-and-ui.md](references/entrypoints-and-ui.md) |
| Settings, links, context, messages, files, mentions, forms | [references/extensions-api.md](references/extensions-api.md) |
| Local test loop, debugging, platform quirks | [references/testing-and-troubleshooting.md](references/testing-and-troubleshooting.md) |
| Unofficial macOS-only injection (Explodex) | [references/unofficial-explodex.md](references/unofficial-explodex.md) |
| Manifest, marketplaces, hooks, submission | `codex-desktop-plugins` |
| SKILL.md and agents/openai.yaml | `codex-desktop-skills` |
