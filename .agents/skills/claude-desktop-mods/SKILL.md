---
name: claude-desktop-mods
description: >-
  Build, test, and ship Claude Code / Claude Desktop "mods": plugins whose JS/TS
  module registers event handlers that run inside Claude Code (custom panes,
  slash commands, tools, permission guards, prompt rewriting, status UI). Use
  when the user wants to create or debug a mod, a hooks.json "modules" entry, a
  register(on) function, or claude plugin test. Not for MCPB extensions or
  plain plugins.
license: MIT
compatibility: Mods need Claude Code >= 2.1.287 (CLI), or the Claude Desktop Code tab (bundled Claude Code, mods from 2.1.286). Node.js is only needed for tests and tooling; the mod itself runs inside Claude Code.
metadata:
  author: Ali Farahat
  tags: claude-desktop,claude-code,mods,plugins,hooks
  verified-against: code.claude.com/docs/en/plugins/mods (Claude Code 2.1.29x)
when_to_use: |
  USE WHEN:
  - The user says "mod", "Claude Desktop mod", "Claude Code mod", "register(on)",
    "hooks.json modules", "claude plugin test", or wants to change Claude
    Code's UI/behavior with code (not config).
  - They want a custom pane, status bar, slash command, tool, permission
    guard, prompt rewriter, or cost/usage widget inside Claude Code.

  DO NOT USE WHEN:
  - They want a packaged local MCP server users install by double-click: use
    claude-desktop-extensions (.mcpb).
  - They want skills, commands, agents, plain shell hooks, or MCP config shipped
    as a plugin with no JS module: use claude-desktop-plugins.
  - They want to patch the Claude Desktop app binary/asar. Decline; mods are the
    supported extension point.
---

# Claude Desktop / Claude Code mods

A **mod** is a plugin whose JS/TS module registers handlers ("hooks") for events
inside Claude Code. It is not a new app and not an MCP server. Source of truth:
`https://code.claude.com/docs/en/plugins/mods/overview` (fetch it; the API moves
between releases).

## Fit check (do first)

1. `claude --version` must be **>= 2.1.287**. Older: tell the user to update; do not write a mod.
2. Mods run in the **CLI and the Desktop Code tab only**. Not the VS Code extension, not cloud sessions, not Cowork or chat. If the user needs those, use `claude-desktop-plugins`.
3. Hosts can refuse mods: `disableAllHooks`, `allowManagedHooksOnly`, `allowManagedModsOnly`, `--bare`, `--safe-mode`, untrusted directory. See [references/testing-and-troubleshooting.md](references/testing-and-troubleshooting.md).

## Safety (state it to the user)

A mod is **unsandboxed code with the user's permissions**: it sees every prompt, can read secrets, approve or deny tool calls, and spend quota. So:

- Never add network egress, secret reads, or auto-approval the user did not ask for. Say what each `$.http`, `$.fs`, `$.process`, `$.env` call does.
- Gating hooks (`tool.call`, `tool.check`, `prompt.submit`) get a `.catch` handler; fail safe, not open.
- Never put tokens in the repo. Use `userConfig` fields with `sensitive: true`.
- Tell users to run `claude plugin validate` on any mod before installing it.

## Anatomy

```
my-mod/
  .claude-plugin/plugin.json     # required; kebab-case name, no extra mod fields
  hooks/hooks.json               # required; {"modules": ["./register.js"]}
  hooks/register.js              # ES module: export function register(on, options)
  hooks/register.test.ts         # optional; run by `claude plugin test`
  types/index.d.ts               # optional; needed for $.state / custom namespaces
```

- `hooks.json` `modules` holds **exactly one** path, relative to `hooks.json`. That key is what makes the plugin a mod. The same file may also hold ordinary `hooks` (settings-style).
- Module extensions: `.js .mjs .cjs .jsx .ts .mts .cts .tsx`. **No build step.**
- `options` = the plugin's `userConfig` values with defaults filled in.
- Plugin-name rules apply (kebab-case; no `claude-`/`anthropic-`/`cc-plugin-` prefixes; not `claude-mods`). See `claude-desktop-plugins`.

Copy a working skeleton from [references/templates.md](references/templates.md).

## The hook model

```js
export function register(on, options) {
  on('tool.call', 'Bash', async ($, e, next) => {
    if (/rm -rf \//.test(e.input?.command ?? '')) return { deny: 'Blocked destructive rm' };
    return next(e);                       // observe / pass on
  }).catch(async ($, err) => { $.ui.log(String(err)); });
}
```

Every handler picks one of three moves:

| Move | How |
| --- | --- |
| **Observe** | `return next(e)` |
| **Rewrite** | `return next({ ...e, field: changed })` (events are frozen; pass a copy) |
| **Answer** | return a result without calling `next` (`{deny}`, `{result}`, `{text}`...) |

`next.signal` (AbortSignal), `next.budget`, `next.origin`, and `next.to(e, tier)` exist; confirm exact shapes in the generated types.

Rules that bite:

- Register events by **literal name** and write API calls in full (`$.ui.toast(...)`, not `const {ui}=$`). Static analysis in `validate` depends on it.
- Matchers: a value, an array, a regex; `'*'` and `'classic.*'` are wildcards. Registering the same event twice with no matcher is an error.
- **No Node.js APIs, no `setTimeout`.** Use `$.clock.sleep/after/every`. Web APIs (`URL`, `TextEncoder`, `crypto.subtle`) are available.
- A hook gets **10 s** (50 ms for `prompt.edit`); `.catch` gets 1 s. Never block the event loop in hot hooks.
- Module variables reset on reload. Persist with `$.store` (4 MiB JSON, shared across sessions); reactive UI state uses `$.state`.
- A throwing `register` or a taken command name skips the whole module. Register commands last or in try/catch.
- Names (command, tool, pane, subagent type): letters, digits, `_`, `-`, max 64.

Event families and API namespaces: [references/events-and-api.md](references/events-and-api.md). Rendering: [references/ui.md](references/ui.md).

## Workflow

1. **Clarify** the one behavior: which event fires, what should change, whether it needs UI, config, or persistence. Prefer the smallest event surface (a `tool.check` guard beats a `tool.call` wrapper).
2. **Scaffold** from the template (or let the built-in `/plugin-authoring` skill drive; it writes to `~/.claude/dev-mods/<session-id>/`).
3. **Run**: `claude --plugin-dir ./my-mod` (hot reloads on save). Check `/plugin` shows `1 mod active`.
4. **Validate**: `claude plugin validate ./my-mod`. Read the `hooks:`, `calls:`, `env reads:`, `state reads:` lines: they are what the mod will do. Fix any "gating hook without .catch" and misspelled events (`"tool.calls" is not an event`).
5. **Type-check** with the `.d.ts` Claude Code writes under `.claude-plugin/types/` (`claude-code/index.d.ts` is the fullest reference). Trust it over this skill if they differ.
6. **Test**: write `*.test.ts` with `claude-code/testing`; run `claude plugin test ./my-mod` (exit 1 on failure, so CI-safe).
7. **Ship**: it is a plugin. Add to a marketplace and install with `/plugin install name@marketplace`, then `/reload-plugins`. Distribution and directory rules: `claude-desktop-plugins`.

## Verification checklist

- [ ] `claude --version` >= 2.1.287; mod appears active in `/plugin`
- [ ] `hooks.json` has `"modules"` with exactly one existing path
- [ ] `claude plugin validate ./my-mod` passes with no event-name errors
- [ ] Every gating hook has `.catch` and a safe failure mode
- [ ] No secrets in repo; sensitive config uses `userConfig` + `sensitive: true`
- [ ] Every `$.http/$.fs/$.process/$.env` use is justified and disclosed in the README
- [ ] `claude plugin test` passes; each test file has at least one `test()`
- [ ] Works when mods are refused: nothing crashes the session, failures are silent skips

## Anti-patterns

- Declaring "done" without running validate and a real `--plugin-dir` session.
- Using `setTimeout`, `fs`, `child_process`, `process.env`: use `$.clock`, `$.fs`, `$.process`, `$.env`.
- Passing `false` to `focus`, `closeOnEscape`, `holdToasts`, `autoFocus`: only `true` or omission is allowed (`false` throws).
- Trying to restyle the permission prompt (not changeable) or lift a managed `deny` rule from `tool.check` (blocked by the built-in guard).
- Assuming a pane shows up: a self-opened pane needs a terminal >= 144 columns (110 after the user opened it once).
- Scaffolding a mod when a plain skill/hook/MCP server would do.
- Inventing events or API methods. If unsure, read the generated `.d.ts` or the live reference page.

## When to read more

| Need | Read |
| --- | --- |
| Skeleton to copy | [references/templates.md](references/templates.md) |
| Event list, matchers, API namespaces, limits | [references/events-and-api.md](references/events-and-api.md) |
| Panes, render sites, element tree | [references/ui.md](references/ui.md) |
| Tests, validation output, "my mod doesn't load" | [references/testing-and-troubleshooting.md](references/testing-and-troubleshooting.md) |
| Live docs index (admin policy, gallery, anything newer) | `https://code.claude.com/docs/llms.txt` |
