# Worked examples

From the explainx.ai walkthrough (Oct 2, 2026). The blog prints only partial snippets and says the generated types are the contract. Treat the code below as the shape of each recipe, not a drop-in file. Blog snippets use the matcher form `{ tool: "Bash" }`; confirm against `.claude-plugin/types/` before relying on it.

## Token Weather

A live context-window forecast in the band above the prompt, about 80 lines, refreshed after each main-loop turn.

| Context used | Forecast |
| --- | --- |
| under 25% | Clear |
| 25-49% | Cloudy |
| 50-74% | Showers |
| 75-89% | Storm |
| 90% and up | Compact soon |

Layout:

```text
token-weather/
  .claude-plugin/
    plugin.json
    types/            # written by Claude Code on load
  hooks/
    hooks.json
    token-weather.mjs
  types/
    index.d.ts
  tests/
    token-weather.test.ts
```

`plugin.json` uses the normal fields (name, version, description, author) plus `"types": "./types/index.d.ts"` to point at the state contract.

`hooks/hooks.json` is only:

```json
{
  "modules": ["./token-weather.mjs"]
}
```

Build notes:

- **Render target:** `AbovePrompt`; nothing draws there by default. Get element constructors from `$.ui.resolve(e)`, not globals. JSX works with `h` as the factory.
- **Data:** `$.session.usage()` returns the same figures as the status line. `context.tokens` is the last response's input, `context.window` the model window, `context.percent` their ratio. It sends a token-count request only if you ask for a breakdown.
- **Props on `e.props`:** `hasSurvey` means a survey wants the band, so yield with `next(e)`. `bodyColumns` is the band's real width (narrower when a pane is docked). `return next(e)` when there is nothing to draw hands the band back to Claude Code and other mods.
- **Cheap call:** `$.session.usage()` only sends a token-count request if you ask for a breakdown.
- **Built-in help:** Claude Code's own guide for writing mods covers where to keep state, running `claude plugin validate`, and which events to hook. Tweaks like "make Storm start at 70%" or "add dollar cost" reload in place.
- **Readings:** take them on `session.start` and `turn.complete`. Skip subagents with `e.agentId`. Call `await next(e)` first, then observe.
- **History:** keep it in `$.state` with a `{ plugin, key }` handle, and declare the key on `PluginState` in `types/index.d.ts` or `claude plugin validate` fails. A module-level array resets on hot reload (this is the "my sparkline vanished" bug).
- **Reactivity:** `$.state.get` inside a render hook subscribes it; `$.state.set` redraws.
- **Prompt for Claude to scaffold it:** icon, percent, tokens used over window, a 12-turn sparkline, last-turn delta, updates after each turn.

Run during development:

```bash
claude --plugin-dir ./token-weather
```

## Blast Radius

Intercepts `tool.call` for Bash when the command matches risky patterns: `rm -rf`, `git reset --hard`, `git clean`, force pushes, database migrations.

Flow: classify the command, return `next(e)` if not risky, otherwise measure impact (`git status`, `git clean -n`, `du`) with `$.process.run` and an argv array, open a pane, then wait for a decision.

```javascript
on("tool.call", { tool: "Bash" }, async ($, e, next) => {
  const risk = classify(String(e.command ?? ""));
  if (risk === null) return next(e);

  const report = await measure($, risk, await $.session.cwd());
  const opened = await $.ui.open({ id: "blast-radius", title: "Blast Radius", focus: true });
  // wait on $.process.run(["sleep", "0.25"]) until a button sets the decision
  if (held.decision === "proceed") return next(e);
  return { deny: `Blast Radius held this command: ... ${report.summary}` };
});
```

Worth copying:

- Argv arrays avoid shell interpolation.
- The 10 s hook budget does not count time inside `$` calls, so loop on short sleeps until a button sets the decision; abort when `next.signal` fires (Esc).
- Buttons: Proceed (key `1`) calls `next(e)`; Cancel (key `2`) returns a deny object with a reason. They work by click, Tab+Enter, or the digit.
- If `$.ui.open` returns `isPlaced: false`, fall back to drawing the report on `AbovePrompt`.
- `focus: true` is the only allowed non-default; never pass `false`.
- Give the hook a `.catch` that fails safe.

Limit: a text classifier. `$(...)`, aliases and scripts that call `rm` slip past. Pair it with permission modes; it does not replace `dontAsk` or permission rules.

## Replay Theater

Observes every Edit and Write (file, before text, after text) and never blocks them.

Lifecycle:

- `turn.start` clears the pending list (main loop only).
- `turn.complete` freezes it as the replay and shows a hint above the prompt; press `r` or run `/replay`.
- `session.start` registers the `/replay` slash command.
- `command.run` for `replay` opens the pane.

```javascript
on("session.start", async ($, e, next) => {
  const r = await next(e);
  await $.command.register({
    name: "replay",
    description: "Step through the last turn's file edits",
  });
  return r;
});
on("command.run", { command: "replay" }, async ($, e) => ({
  text: (await openReplay($)) ? "Replaying" : "No edits",
}));
```

Build notes: pane has numbered steps with Prev, Next, Close. For Writes, call `$.fs.read` before the write to capture old contents. Wide terminals dock a pane; at 80 columns it draws inline above the prompt. Filter `e.agentId` to keep subagent edits out.

## Share and install

Marketplace folder contains `.claude-plugin/marketplace.json` listing entries like `{ "name": "token-weather", "source": "./token-weather" }`.

```bash
claude plugin marketplace add ./my-mods
claude plugin install token-weather@my-mods --scope user
```

From GitHub, in a session:

```text
/plugin marketplace add your-org/my-mods
/plugin install token-weather@my-mods
/reload-plugins
```

If the mod does not appear, restart Claude Code. The Claude directory accepts plugins that contain mods (submission via the manage URL on claude.dev).

## Validate and test

- `claude plugin validate ./token-weather` checks manifest and source and reports hooked events, `$` methods used, and state keys read and written.
- `claude plugin test` runs `*.test.ts` against the real runtime. Test hooks run after the mod and can stub responses, so you can fake `$.session.usage()` without a real full context window.
