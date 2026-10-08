# Mod events, matchers, API, limits

Verified against the mods reference (`/docs/en/plugins/mods/reference`, `/events`, `/api`). Names can change between Claude Code releases: **the `.d.ts` Claude Code generates in `.claude-plugin/types/` wins over this file.** Public types also live in `github.com/anthropics/claude-code` under `mods/types/claude-code.d.ts`.

## Handler shape

```js
on(event, [matcher], async ($, e, next) => result)
```

- `$` = mods API, `e` = frozen event, `next(e)` = continue down the chain.
- `.catch(async ($, err) => ...)` handles a throw from that hook.
- Every mods API call is itself an event, so other mods can observe or rewrite it.
- Matcher: a value, an array of values, or a regex. `'*'` and `'classic.*'` are wildcards.

## Events

| Family | Events |
| --- | --- |
| Tools | `tool.call`, `tool.check`, `tool.describe` |
| Prompts | `prompt.submit`, `prompt.fill`, `prompt.suggest`, `prompt.edit`, `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`, `prompt.mention`, `skill.prompt`, `attribution.text` |
| Commands / config | `command.run`, `command.describe`, `config.set`, `config.describe` |
| Turns | `turn.start`, `turn.step`, `turn.complete` |
| Session | `session.start`, `session.end`, `session.compact`, `session.receive`, `session.send`, `session.append`, `session.attach`, `session.detach`, `session.measure` |
| Subagents | `agent.offer`, `agent.spawn` |
| UI | `ui.render`, `ui.resolve`, `ui.press`, `ui.input`, `ui.select`, `ui.focus`, `ui.scroll`, `ui.close`, `ui.message`, `ui.fault` |
| Other mods | `plugin.register`, `engine.create` |
| Telemetry | `telemetry.log`, `telemetry.mark` (need a `{ to: 'collector' }` filter) |
| Settings hooks | `classic.<Event>` (the existing settings-style hook events) |

A misspelled event name is a validate error, so copy names exactly.

## Patterns

**Block a tool call**
```js
on('tool.call', 'Bash', async ($, e, next) =>
  /curl .*\| *sh/.test(e.input?.command ?? '') ? { deny: 'No pipe-to-shell' } : next(e));
```

**Ask the user before a call proceeds**
```js
on('tool.call', 'Write', async ($, e, next) => {
  const ok = await $.ui.ask(`Write ${e.input?.file_path}?`, ['Allow', 'Deny']);
  return ok === 'Allow' ? next(e) : { deny: 'User declined' };
});
```
(Check the `$.ui.ask` return shape in the generated types before relying on the string.)

**Permission decision** (`tool.check`): return `{ decision: 'allow' | 'ask' | 'deny', reason }`. A built-in guard stops mods from lifting managed `deny` rules unless an admin sets `allowModsToOverrideDenyRules`.

**Register a slash command**: register in `session.start`, handle in `command.run` with a `{ command: name }` matcher, return `{ text }` or `{}`. Use `immediate: true` to run during a turn. A taken name makes `register` throw and skips the whole hook, so register commands last or wrap in try/catch.

**Register a tool for Claude**: `$.tool.register({ name, description, inputSchema, isDeferred? })` (`isDeferred` needs v2.1.293). Claude sees `mcp__<plugin>__<name>`. Handle it in `tool.call`, return `{ result }`.

**Persist data**: `$.store` is a key-value store shared by all sessions (4 MiB JSON total). Module variables reset on reload.

## `$` namespaces

`$.plugin`, `$.ui` (`open`, `close`, `invalidate`, `resolve`, `toast`, `status`, `log`, `ask`), `$.command` (`register`, `run`, `list`), `$.tool` (`register`, `call`), `$.agent`, `$.model` (`complete`, `fork`, `classify`), `$.prompt`, `$.turn`, `$.session`, `$.config`, `$.settings`, `$.env`, `$.fs`, `$.store`, `$.state` (reactive), `$.clock` (`now`, `sleep`, `after`, `every`), `$.http`, `$.process`, `$.mcp`, `$.audio`, `$.telemetry`.

- The module has **no Node.js APIs and no `setTimeout`**. Use `$.clock`.
- `$.state` and any new namespace need a `types/index.d.ts` named by `types` in `plugin.json`.

## Limits

| What | Limit |
| --- | --- |
| One hook run per event | 10 s (50 ms for `prompt.edit`) |
| `.catch` handler | 1 s |
| All `session.end` hooks together | shared 1.5 s budget |
| `$.process.run` | 30 s default, 10 min max |
| `$.model.complete` `maxTokens` | 1024 default, max 64,000 |
| `$.fs.read` / `$.fs.write` | 4 MiB per file |
| `$.store` | 4 MiB JSON total |
| `$.session.messages()` | newest 4,096 entries |
| `$.ui.invalidate('ui.render')` | throttled (10/s; 30/s for visible terminal pane) |
| `$.ui.toast` | shown for 4 s |
| Text drawn in one tree | first 100,000 characters |
| Command/tool/subagent/pane names | letters, digits, `_`, `-`, max 64 |
| One `claude plugin test` test | 5 s default (`timeoutMs` to change) |

## Ordering and admin

- Managed settings `prependPlugins` / `appendPlugins` add plugins ahead of / after user-installed ones.
- `sec-default@builtin` is a built-in guard loaded ahead of user mods on managed machines.
- Related settings: `CLAUDE_CODE_PLUGIN_DIRS` (load dirs like `--plugin-dir`), `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, `pluginConfigs` (userConfig values), `disableSideloadFlags` (managed; rejects `--plugin-dir`).
- Org controls: `allowManagedModsOnly`, `allowManagedHooksOnly`, `disableAllHooks`, and a `plugin.register` policy hook (see the live docs index at `https://code.claude.com/docs/llms.txt`).
