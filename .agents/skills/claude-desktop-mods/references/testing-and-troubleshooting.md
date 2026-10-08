# Testing, validation, troubleshooting (mods)

## Dev loop

```
claude --plugin-dir ./my-mod      # loads for this session, hot-reloads on save
claude plugin validate ./my-mod   # manifest + static analysis of the module
claude plugin test ./my-mod       # runs *.test.ts / *.test.tsx (exit 1 on failure)
```

Multiple dirs: repeat `--plugin-dir`, or set `CLAUDE_CODE_PLUGIN_DIRS` (absolute paths, `:` separated, `;` on Windows). `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` for watch behavior in other contexts. After manual edits to non-hot-reloaded parts run `/reload-plugins`.

## What `validate` tells you

Besides manifest errors, it statically analyses the module and prints lines such as `hooks:`, `calls:`, `env reads:`, `state reads:`, and a note for gating hooks without `.catch`. Read them as the mod's declared behavior and permissions. It errors on misspelled events (`"tool.calls" is not an event`).

Static analysis only understands code written plainly: literal event names, full `$.ns.method(...)` calls, no aliased `$`. If a call does not show under `calls:`, rewrite it plainly.

Types: Claude Code writes `.d.ts` files into `.claude-plugin/types/` (`claude-code/index.d.ts` is the fullest reference) and adds a `tsconfig.json`. Run `tsc --noEmit` with it for type checking.

## Writing tests

- Files named `*.test.ts` (or `.tsx`). Each file needs at least one `test()`.
- `import { expect, test } from 'claude-code/testing'`. A test receives `($, on)`.
- **Stubs**: register every stub before the first `$` call. A mods-API stub returns `{ value }`. An event stub returns the event's result shape. `turn.step` stubs are async generators.
- `session.start` does not fire automatically; fire it with `$.session.start(...)`.
- Mocks: `mock.clock`, `mock.store`, `mock.env`.
- Default per-test timeout is 5 s (`timeoutMs` to change).
- Run `claude plugin test` from a non-mod directory to find out whether this install can load mods at all.
- Put `claude plugin validate --strict ./my-mod && claude plugin test ./my-mod` in CI.

## "My mod does not load"

Failing hooks or modules are skipped **silently**. Look for the dim transcript line, or run `claude --debug`.

| Message / symptom | Cause and fix |
| --- | --- |
| Mods ignored entirely | Claude Code < 2.1.287 (Desktop: < 2.1.286); update |
| `mods that run in the hooks worker are off` | Mods disabled for this run (see refusal list) |
| Refusal: `disableAllHooks`, `allowManagedHooksOnly`, `allowManagedModsOnly`, `--bare`, `--safe-mode` | A setting or flag blocks mods. Remove it or ask the admin |
| Directory not trusted | Trust the folder; mods do not load from untrusted dirs |
| `hook skipped` | The module threw, a name was taken, or an event was misused. Check `--debug` |
| `it crashed the hooks worker` | Uncaught exception or runaway loop; add try/catch and `.catch` |
| `options do not fit plugin.json userConfig` | `register(on, options)` got values failing the schema; fix defaults/types |
| Duplicate plugin names | Two plugins share `name`; rename one |
| Command not found | Name already taken so `register` threw; register last or in try/catch |
| Pane does not appear | Terminal narrower than 144 columns (110 after the user opens it) |
| Edit has no effect | Not running with `--plugin-dir`, or `version` unchanged for an installed copy; `/reload-plugins` or bump `version` |

## Surfaces

Mods run in the CLI and the Desktop Code tab. Not in the VS Code extension or cloud sessions. `claude -p` only with `--plugin-dir`. If it must work elsewhere, a plain plugin component (skill, hook, MCP) is the portable alternative.
