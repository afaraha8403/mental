# Extension capabilities (summary of `docs/spec.md`)

Source: `https://github.com/openai/mcp-extensions/blob/main/docs/spec.md`. This is a summary; the spec is the contract. Protocol versions referenced there include MCP `2025-11-25` and `2026-07-28`.

## Capability negotiation

The host advertises capabilities during `initialize`, for example `hostCapabilities.experimental["openai/files"]`. Check the capability before calling the matching method. If absent, degrade (hide the button, fall back to text).

## Structured settings

Server declares an `openai/settings` capability with a `readTool` and an `updateTool`. The host renders a settings page (entrypoint `settings`, `searchTerms` for search) and calls the tools. `updateTool` must validate input and return the stored result.

## Deep links

- Desktop: `codex://plugins/{pluginId}@{marketplace}/app/{tool}?path=...`
- Mobile: `chatgpt://...`
- Web: `https://chatgpt.com/plugins/<id>/app/<tool>?path=...`

`path` is forwarded to the tool. Treat it as untrusted input.

## Model context

`ui/update-model-context` lets the app tell the model what the user currently sees (selected row, open document). The host exposes the latest as `hostContext["openai/modelContext"]`. Send small summaries, not whole documents.

## Messages

`ui/message` posts a message into the conversation. `_meta["openai/message"]` controls `target` (`"new"` thread or `"active"` thread) and `send` (whether it is sent immediately or left in the composer for the user). Prefer leaving it in the composer for anything with side effects.

## File handlers

For `file` entrypoints:

- The app gets an **opaque `resourceUri`**, never a path.
- Read through the server tool; the server sees `_meta["openai/resource"].path`.
- Save with `openai/resources/write` and an `ifMatch` ETag.
- Outcomes: `saved`, `conflict` (file changed; reload and merge), `too-large`.

Server side: `realpath` the path, confine it to the opened file's directory, never echo host paths.

## Opening local files

`openai/files/open` with `{ "path": "<absolute path on the execution host>" }` returns `{}`. Requires the `openai/files` host capability. Not available on web.

## Composer @-mentions (desktop only)

Tool `_meta`:

```json
{
  "openai/extensions": { "mentions/search": {} },
  "ui": { "visibility": ["app"] }
}
```

The tool takes `{ "query": string }` (may be empty) and returns `structuredContent: { items: ResourceLink[] }`. Each item is `{ "type": "resource_link", "uri": "...", "name": "..." }`.

## OpenAI form elicitation

`openai/elicitation/create` is a superset of MCP `elicitation/create` (`mode: "form"`). The host advertises `extensions["openai/elicitation"].form`. OpenAI-registered servers must use MCP `2026-07-28` or later with multi-round-trip requests (MRTR); direct connections support both flows. Forms with unsupported input types are reported unsupported, not partly shown.

Extensions to the schema:

| Field | What it does |
| --- | --- |
| `pattern` on string | Regex validation |
| `oneOf[].description` | Supporting text per titled option |
| `oneOf[].x-openai-thumbnail` | Image choices (`src` must be HTTPS or a base64 data URI). If any option has a thumbnail, all render as images, so supply all |
| `x-openai-suggestions` | Suggested values plus free text (string, or array `items`) |
| `x-openai-input` `type: "resource"` | Pick server-provided resources and/or user-added files or directories |

Resource input details:

- Single-select (`string`, `format: uri`) submits a URI. Multi-select (`array`) submits URI strings.
- `selection`: `"explicit"` (default; select/deselect) or `"implicit"` (add/remove; everything left is submitted). Multi-select only. Do not set `default` with `implicit`.
- Defaults must come from `options`.
- `userOptions`: `{ kind: "file" | "directory", accept: [".stl", "image/*"] }`. Implicit selection always allows uploads; web MCP Apps forms allow explicit selection only.
- Options may carry `_meta["openai/thumbnail"]` and `_meta["openai/preview"]` (`mcp_app_tool` target with `name` and `arguments`, or an MCP `resource_link`).
- `type: "file"` is a deprecated alias of `"resource"`.

## Plugin onboarding

`extensions["com.openai"].onboardingSkill` in the plugin manifest points to a skill that runs after install. See `codex-desktop-plugins`.
