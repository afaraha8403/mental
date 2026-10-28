---
paths:
  - "claude-mod/**"
  - "test/claude-mod.test.mjs"
---

# Claude mod (`claude-mod/`)

Keep in sync with `.cursor/rules/claude-mod.mdc`.

A mod is a host UI module (not MCP). It runs in a sandbox: web globals only, no Node, no timers but `$.clock`. It reads Mental through the CLI (`process.run`) and never writes Mental data itself.

## Surfaces

`lib/model.mjs` turns heartbeat (and, for the open Desktop pane, `mental brief --hops 8`) into plain data (`paneModelOf`, `bandModelOf`, `threadOf`; host-neutral, keep it pure) and `lib/views.mjs` renders it. The terminal draws one native tree. `desktop`/`vscode` draw the console: `lib/desktop.mjs` drawings (`heroSvg` with the resume point and the thread of hops coloured by agent, `pulseSvg` tiles, `bandSvg` strip) with no background of their own, in light and dark palettes (`dual`; one teal accent, no purple), with every control a native element right under the drawing it acts on. `mobile` = leave alone. The pane title is the project's folder name, never its id. `Text` `size`/`weight`, `Button` `variant` and `Markdown` are used only when `$.session.version()` is 2.1.299+ (older builds refuse the whole tree). There is no left-nav slot and no web embed. A running dashboard opens through a native `Link` (`http://localhost:<port>/#/today?p=<id>`; Desktop opens no other `http:` host); `dash.mjs probe` finds it from `~/.mental/dashboard.json`, then port 3847. `dash.mjs stop` ends only the process the port file names, after its URL answers as a Mental dashboard.

## Host limits (learned the hard way)

- Never alias `$`. Spell `$.noun.verb(...)` at each call.
- `Svg` with `isInteractive` becomes an iframe and drops the logo. Use plain `Svg` (SMIL animation works). Svg regions are not clickable: use `Button` rows for clicks.
- `Button` is native and cannot be coloured. Text is monospace.
- `Text` and `Svg` take no `key`. `Button` needs a unique string `key`.
- `Box` has no `flexWrap`, `columnGap` or `rowGap`. `gap` is fine. Omit `wrap:"wrap"` (the default). Never pass `undefined` props.
- Width is in cells or a percent string. A tree that fails validation draws the original, silently.
- `$.prompt.submit({ text, asUser: true })` sends a turn. Do not await it in a hook.

## Behaviour rules

- `session.end` also fires on `/clear`, `/resume` and `/branch` (`e.reason` `clear` / `resume`) and `session.start` does not fire again: keep the timers then, tear down only on a real end.
- Native `Text` sits on the host's chrome: no hex colours. Primary text uncoloured, secondary `dimColor`, accents as colour names (`nativeTone`).
- Redraw only when `signatureOf()` changes. A redraw every tick makes the pane fight scrolling.
- Park and Hand off send a prompt; the agent records through the skill. Hidden needs are stored in `store.dismissed`; the panel still lists everything.
- Heartbeat is always `--passive` (no clock ping, no write).
- Show what Mental holds for this repo (resume point, the thread across agents, needs you, decisions in force, context, time), each with a native action nearby. No numbers without a reason to act on them.
- Motion lives inside drawings only: slow ambient SMIL (`dur` ≥ 1.8s) and live rings on real state. Never redraw the tree to animate.
- On Desktop every row that is one action (a need, a list entry, a link-back, a Read in Mental tile, Last hand-off) is its own `Client` (`lib/row-client.mjs`, created only in `mental-mod.mjs` so the module path stays a literal): the whole row takes the pointer, lights on hover, and a click or Enter posts `{ press: true }` to `ui.message`, which runs the action keyed by the Client key. Any `ui.fault` switches to native outlined rows, which still light through `Box` `hover`.
- Hide sits in the pane's "Needs you" ("Hide from band") and in the footer when the band is not shown. The band on Desktop is one strip plus a plain "N need you ›".

## Check before you commit

```bash
node --test test/claude-mod.test.mjs test/host-plugins.test.mjs
claude plugin validate . --strict
```

All `claude-mod/` files are LF. Types (git-ignored) live in `.claude-plugin/types/`. Every gating hook (`tool.call`, `command.run`, `ui.close`, `session.compact`) has a `.catch` that passes the event on; validate must show none "without .catch". User-visible change: add a CHANGELOG line. Next hosts (Codex, then DeepSeek) get their own folder; do not bend this one.
