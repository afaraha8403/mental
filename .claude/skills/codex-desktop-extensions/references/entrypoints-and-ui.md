# Entrypoints, resources, display modes and styling

Source: `https://github.com/openai/mcp-extensions` (`docs/spec.md`) and `https://developers.openai.com/plugins/build/extensions.md`. The shapes below are illustrative; confirm exact field names in `spec.md` before shipping.

## How the pieces connect

1. A **tool** declares where it appears: `_meta["openai/ui"].entrypoints`.
2. The tool points at a **resource** via MCP Apps `_meta.ui.resourceUri` (a `ui://...` URI).
3. The **resource** (HTML, MIME type `RESOURCE_MIME_TYPE`) is rendered in a sandboxed iframe and carries its own `_meta["openai/ui"]` display preferences.
4. The iframe app talks back to the server through `@openai/mcp-extensions/app` and can call other tools.

## Tool metadata

```json
{
  "ui": { "resourceUri": "ui://notes/dashboard.html" },
  "openai/ui": {
    "entrypoints": [
      { "type": "global" },
      { "type": "thread" }
    ]
  }
}
```

Entry types:

- `global`: sidebar app, can go fullscreen. The tool is called with `{}`, so every argument must be optional. May add `quickAction`.
- `thread`: a tab in the side panel of the current thread.
- `file`: `{ "type": "file", "extensions": [".stl"] }`. Receives an opaque `resourceUri` for the opened file. Desktop only.
- `settings`: a settings page, discoverable through `searchTerms`.

Limit: **3 entrypoints per app**.

## Resource metadata

```json
{
  "openai/ui": {
    "preferredDisplayMode": "inline",
    "availableDisplayModes": ["inline", "fullscreen"]
  }
}
```

`pip` is not supported. Choose `fullscreen` as the preferred mode only for dense tools (editors, dashboards).

## App-only tools

Helper tools the iframe calls (save, search, refresh) should not be offered to the model:

```json
{ "ui": { "visibility": ["app"] } }
```

Tools that the model should call use `["model", "app"]` (the default).

## Iframe app skeleton (TypeScript)

Order matters: register handlers, then connect.

```ts
import { App } from "@openai/mcp-extensions/app";
import "@openai/mcp-extensions/app/styles.css";

const app = new App({ name: "notes", version: "1.0.0" });

app.ontoolresult = (result) => {
  render(result.structuredContent);
};

await app.connect();
```

Confirm constructor options and entry-point names in the package README; the SDK may rename APIs.

## Styling rules

- The iframe CSP blocks external stylesheets, fonts and scripts. Bundle or inline everything (Vite single-file or `vite-plugin-singlefile` works well).
- Use the shipped `styles.css` tokens so light, dark and host themes match; avoid hard-coded colors.
- Tool icons: monochrome SVG using `currentColor`, 20x20 viewport, about 1.33px strokes.
- Respect `hostContext` (theme, display mode, locale) and re-render on change.
- Keep the first paint fast; show a skeleton until `ontoolresult` fires.

## Design guidance

- One clear job per entrypoint. Prefer a global app for dashboards, a thread tab for per-conversation state, a file entrypoint for viewers/editors.
- Provide a text fallback in the tool result `content` so the model and non-UI surfaces still work.
- Return compact `structuredContent`; large blobs belong behind a resource read.
