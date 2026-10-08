# Mod UI: render sites, panes, elements

Verified against `/docs/en/plugins/mods/interface` and `/reference`. Check the generated `.d.ts` for exact prop types.

## Model

1. Handle `ui.render` for a **render site**. Return an element tree built from `$.ui.resolve(e)`.
2. Call `$.ui.invalidate('ui.render')` when your data changes to trigger a redraw (throttled).
3. Handle `ui.press`, `ui.input`, `ui.select` for interaction.
4. For a pane, open it with `$.ui.open({ id, title?, focus?, closeOnEscape?, rows?, columns? })`.

```js
export function register(on) {
  on('ui.render', 'AbovePrompt', async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e);
    return Box({ borderStyle: 'round' }, Text({}, 'Hello from a mod'));
  });
}
```

(The exact call shape of `Box`/`Text` and the `$.ui.resolve` return is version-dependent. Confirm in the generated types.)

## Render sites

- **Both terminal and Desktop**: `Pane`, `AbovePrompt`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `AskUserQuestion`, `Spinner`, `SessionMode`, `PromptHint`.
- **Terminal only**: `ToolProgress`, `TurnDuration`, `InfoNotice`.
- The **permission prompt cannot be changed.**

## Elements

| Element | Notes | Terminal | Desktop |
| --- | --- | :-: | :-: |
| `Box` | layout container; has `borderStyle` (names below) | yes | yes |
| `Text` | styled text | yes | yes |
| `Button` | `key`, `label`, `onPress`, `hotkey`, `plain`, `dimColor`, `autoFocus`, `action` | yes | yes |
| `Link`, `Code`, `Markdown`, `Input`, `Select`, `Client` | see reference | yes | yes |
| `Svg` | SVG document up to 131,072 chars | | yes |
| `Raster` | `columns` up to 512, `rows` up to 256 | yes | |
| `Image` | PNG or RGBA up to 2 MiB | yes | |

`borderStyle` names: `single`, `double`, `round`, `bold`, `singleDouble`, `doubleSingle`, `classic`, `arrow`, `dashed`, `quote`. An unknown name (e.g. `'rounded'`) silently draws no border.

## Gotchas

- `focus`, `closeOnEscape`, `holdToasts`, `autoFocus` accept only `true` or omission. `false` throws.
- Only the first 100,000 characters of a tree draw.
- Redraws are throttled; do not call `invalidate` in a tight loop. Use `$.clock.every` for ticking UI.
- A pane the mod opens without a user action needs a terminal of at least 144 columns (110 once the user opened it).
- Design for both surfaces: do not depend on terminal-only elements unless the mod says it is terminal-only.
- Keep render hooks fast: precompute in `$.state`, render from it.
