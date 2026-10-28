---
name: claude-code-mods-guide
description: >-
  Worked-example guide to Claude Code mods from the explainx.ai walkthrough of
  the official guide: the observe/rewrite/answer model, Token Weather (a
  context-window band), Blast Radius (hold risky Bash), Replay Theater
  (/replay), hot-reload-safe state, validate/test/share, and limits. Use when
  the user wants a mod recipe or pattern, asks what a mod can do versus a
  settings hook, skill or MCP server, or wants to build a usage meter, command
  guard, or custom slash command mod.
license: MIT
compatibility: Mods need Claude Code >= 2.1.287 (on by default). Node.js is only needed for tests and tooling; the mod runs in Claude Code's own sandbox, not Node.
metadata:
  author: Ali Farahat
  tags: claude-code,mods,plugins,hooks,recipes
  verified-against: explainx.ai/blog/claude-code-mods-typescript-plugins-guide-2026 (Oct 2-3, 2026)
when_to_use: |
  USE WHEN:
  - The user wants a worked mod pattern: a usage or context meter, a guard on
    risky Bash, a custom slash command, a pane that replays edits.
  - They ask "mod vs hook vs skill vs MCP", "what can a mod do", "Token
    Weather", "Blast Radius", "Replay Theater", or "You Should Know".
  - A mod loses state on save (hot reload) or nothing draws.

  DO NOT USE WHEN:
  - You need the full event list, API namespaces, UI element tree, or test and
    troubleshooting detail: use claude-desktop-mods (the API reference).
  - They want plain plugin packaging or directory submission: use
    claude-desktop-plugins.
  - They want a .mcpb local MCP server: use claude-desktop-extensions.
---

# Claude Code mods: recipes and patterns

Companion to `claude-desktop-mods` (API reference). This skill holds the
*teaching* layer from the explainx.ai write-up of the official mods guide:
what a mod is for, three worked mods, and the habits that avoid common bugs.
The guide's own stance: "customize by prompting; share as plugins." Mods add a
second axis next to Agent Skills; they do not replace them.

**Source caveat.** The blog is a secondary source dated Oct 2-3, 2026, and its
snippets are partial. The API changes between releases. Claude Code writes
type declarations for your exact build into `.claude-plugin/types/`; those
generated types are the contract. Where the blog and `claude-desktop-mods`
differ (for example matcher form `{ tool: "Bash" }` versus `'Bash'`, or
`e.command` versus `e.input.command`), trust the generated `.d.ts`.

## Security and safety

A mod runs in-process in Claude Code with the same access Claude Code has,
written by its publisher, not Anthropic. It can refuse tools, rewrite Bash, and
read files through `$`. So:

- Say plainly what each `$.fs`, `$.process`, `$.http` call does; add no egress or auto-approval the user did not ask for.
- `claude plugin validate` checks the contract, not honesty. It is not a security review; tell users to read the repo before installing.
- A marketplace listing means discovery, not audit.
- A Bash text guard (Blast Radius) is a safety net, not a permission system: `$(...)`, aliases, and scripts that call `rm` bypass it. Use permission rules or modes for hard blocks.
- Run external commands with an argv array (`$.process.run([...])`), never a built shell string.

## Mod vs the alternatives

| Need | Use |
| --- | --- |
| Model should pull a packaged workflow | Skill |
| Model should call an external tool | MCP server |
| Run a shell command per event, JSON in and out, no live UI | Settings hook |
| Sit on the event chain, keep state, draw UI, register commands or tools | **Mod** |

Settings hooks are subprocesses with no state across reloads. Mods stay loaded
for the session, keep values in `$.state`, draw updating UI, and call back into
Claude Code. `/diff` and AGENTS.md support are first-party mods (source under
`mods/` in `anthropics/claude-code`), so yours has the same shape and the same
validate/test path.

## The model in one screen

A mod is a plugin whose `hooks/hooks.json` lists exactly one module under
`modules`; the module exports `register(on, options)`. A hook receives `$`
(host API: `ui`, `session`, `state`, `store`, `fs`, `process`, `clock`, `http`,
`tool`, `command`, `model`), `e` (event as plain data) and `next`.

```js
on("tool.call", { tool: "Bash" }, async ($, e, next) => {
  return next(e);
});
```

Three moves: **observe** (await `next(e)`, inspect), **rewrite** (call `next`
with a changed event), **answer** (return, e.g. `{ deny: "..." }`, without
calling `next`). Rule of thumb: call `next(e)` when you have nothing to add;
skip it only when deliberately answering.

Events named in the guide: `tool.call`, `prompt.submit`, `turn.start`,
`turn.complete`, `session.start`, `command.run`, `ui.render`.

## Prompt-to-mod shortcut

Start `claude` and describe the readout (icon, percent, tokens over window,
12-turn sparkline, last-turn delta, updates each turn). Claude scaffolds the
mod and asks once whether to enable hot reload for the session; allow it.
Session-only folders get cleaned up later, so copy one out and install it as a
normal plugin to keep it.

## Three worked mods

Full walkthroughs, folder layouts, and the blog's code are in
[references/worked-examples.md](references/worked-examples.md).

| Mod | Events | Shows |
| --- | --- | --- |
| Token Weather (~80 lines) | `session.start`, `turn.complete`, `ui.render` | Reading `$.session.usage()`, `$.state`, drawing on `AbovePrompt` |
| Blast Radius | `tool.call` (Bash) | Holding a call, measuring impact, a decision pane, abort on `next.signal` |
| Replay Theater | `turn.start`, `turn.complete`, `session.start`, `command.run` | Observing Edit/Write, `$.command.register`, a pane with steps |

## Habits that prevent most bugs

1. Use the generated types in `.claude-plugin/types/` as the reference; `tsc -p` should work.
2. Read component props from `e.props` (`hasSurvey`, `bodyColumns`). Only `e.component`, `e.surface`, `e.requestId`, `e.viewport` sit at the top level.
3. Plan for hot reload: every save re-runs `register` and `session.start`. Module-level variables die; put durable data in `$.state` (declare the key on `PluginState` in `types/index.d.ts` or `validate` fails).
4. A `$.state.get` inside a render hook subscribes it; a later `$.state.set` redraws. No `$.ui.invalidate` needed.
5. Return `next(e)` from a render hook when there is nothing to draw. Use single-width symbols, not emoji, so columns align.
6. Filter subagent turns with `e.agentId`, or the band and replay mix contexts.
7. Nothing draws? Run `claude --debug` and look for a hook that returned an invalid tree.
8. Each hook gets 10 s of its own time; time spent inside `$` calls does not count. For long waits, loop on short sleeps inside `$` and stop when `next.signal` fires (Esc).

## Workflow

1. Check `claude --version` >= 2.1.287. If older, ask the user to update.
2. Pick the smallest recipe that fits (see table); copy its habits, not its full file.
3. Run `claude --plugin-dir ./my-mod` (folder is watched; saves reload without restart). If the mod does not appear, restart Claude Code.
4. `claude plugin validate ./my-mod`: read the reported events, `$` methods, and state keys read and written.
5. `claude plugin test` runs `*.test.ts` against the real runtime; test hooks run after the mod and can stub `$.session.usage()`.
6. Share: marketplace folder with `.claude-plugin/marketplace.json`, then install commands in [references/worked-examples.md](references/worked-examples.md). Directory rules: `claude-desktop-plugins`.

## Limits to state up front

- API drift: a mod that validates on one build may need changes after an upgrade.
- No Node, no DOM: charting libraries must be rewritten against `$` and `$.ui.resolve`; `import fs` is unavailable.
- One module per mod: split logic with functions inside that file.
- Hook budget 10 s; Blast Radius is bypassable; subagent turns need an `e.agentId` policy.

## Ideas the guide lists next

Cost or rate-limit meter via `$.ui.status`; a `prompt.submit` hook that
prepends team conventions; a pane of files Claude read; a `$.ui.toast` when a
long turn ends; a `tool.call` guard for production `kubectl` contexts or
`terraform apply`. Keep skills as model-invoked playbooks; put session chrome
and hard intercepts in mods.

## Context and caveats from the guide

Release facts, the You Should Know built-in, FAQ, and sources:
[references/blog-notes.md](references/blog-notes.md).
