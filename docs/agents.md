# Mental CLI for agents

**Agents write Mental CLI on the user's behalf.** After `mental install`, the skill plus the always-on rule tell them when to journal, decide, and record residue. The human does not keep a second journal. **I type mental.** They may still type `mental` for the pulse.

The CLI is the contract. Humans type `mental`. Agents call `mental … --json`. They do not grep `.mental`, `~/.mental`, or YAML frontmatter.

This is not a hidden hook and not every chat turn. Hooks stay off until the user asks. Write at a task boundary, when a decision constrains the future, or the moment residue surfaces. Fail open if Mental CLI is missing.

If `mental` is on PATH for daily work, follow the Mental skill copied by install — not the plugin bootstrap (`skills/mental-setup`). If JSON includes `update`, or the user asks to upgrade, run `npm i -g @balacode/mental`, then `mental install`, then `mental doctor`. npm owns the executable; install recopies skill/rule, does not turn on optionals, and does not refresh the host plugin cache. Existing Windows installs from Mental 0.8.1 or older run `mental-repair.cmd` once after npm updates. If PowerShell blocks npm-generated `.ps1` launchers, use `npm.cmd` / `mental.cmd`; never change execution policy for the user. If the CLI is missing, continue the coding task (fail open) and mention the install block. Never execute a `.mjs` file directly. The plugin does not start MCP.

## Always

```bash
mental where --json
mental heartbeat --json
```

`heartbeat` is the cheap mid-chat reload: resume, last outcome, git, hops today, residue (Needs eyes / In the air / Later), unsettled + settled (lists capped at 7; counts via `attentionCount` / `openDecisionCount` / `needsEyesCount` / `laterCount` / `guardrailCount` / `hopsToday`). JSON also includes `id` and `mode`. Use `mental status --json` when you also need notes. Do not call `pulse` every turn. Flag grammar: `mental <cmd> --help` or `mental schema --json`. Unknown flags fail (`error.code` `unknown-flag`, `error.hint` lists legal flags). Journal requires `--resume` (same as park/handoff). Decide create requires `--body` (same `--title` without `--body` updates).

If JSON includes `data.track.enabled`, follow the Mental Track skill. `track start --via <host>` if `runningCount` is 0 (start twice is ensure-running). If tracking is off, do not enable it. After `mental install` or `mental doctor`, ask about optionals (`needsConsent: true`) with a one-liner each: hooks (session-start status), MCP (`mental serve` for clients that cannot shell the CLI), time tracking (per-project sit-down clock). Check whether MCP is needed. Never run `mental option … on` or `install --hooks|--mcp|--track` until the user says yes **this turn**.

### Park vs handoff vs heartbeat vs pulse

| When | Command |
| --- | --- |
| Cheap reload / other agents may have written | `mental heartbeat --json` |
| Interrupted mid-hop / switching context | `mental park --resume "…" --json` |
| Come back to this / note that for later | `mental attention --title "…" --kind thread --status later --json` |
| Planned task boundary (journal + heartbeat) | `mental handoff --title "…" --resume "…" --json` |
| Cross-project compact overview | `mental pulse --json` |

`park` encodes at an interruption (default title `"Parked"`; optional `--attention` + `--kind`). `handoff` is sugar for journal then heartbeat — both `--title` and `--resume` required. `pulse` returns compact rows from bindings (id, name, resume, counts) — no journal bodies, no merged dump. Heartbeat stays read-only for the pulse watermark; park / handoff / pulse write it after computing since-last-pulse counts.

```bash
mental park --resume "…" --via cursor --json
mental handoff --title "…" --resume "…" --via cursor --json
mental pulse --json
mental journal --title "…" --body "…" --resume "…" --against PLAN.md --via cursor --json
mental attention --title "…" --kind concern --status open --via cursor --json
mental attention --title "…" --kind thread --status later --via cursor --json
mental attention --title "…" --kind verify --status open --via cursor --json
mental decide --title "…" --body "…" --status open --via cursor --json
mental decide --title "…" --status decided --json
mental search overlay --json
mental list --type Decision --kind direction --json
mental show notes/some-fact.md --json
mental status --json
```

Mid-chat, not just start/finish:

- Before proposing a concrete approach, flag, crate, or env var: `mental search <that name> --json` as its own query (space-separated words are AND; `--any` is OR). Also `mental list --type Decision --json` (all statuses).
- Record attention the moment residue surfaces. "Come back to this" / "for later" is `--status later`, never `note`.
- Park when interrupted mid-hop; handoff only at a planned close
- Re-call `mental heartbeat --json` whenever other agents may have written — it derives git live. On this repo’s bench machine a CLI heartbeat is **51 ms** p50; in-process (MCP) it is **11 ms**. See [benchmarks](./benchmarks.md).
- Use `pulse` for multi-repo orchestration, not as a per-turn dump

## Skill + rule

`mental install` copies:

- The **skill** — procedure (when to journal, CLI contract, privacy). Model-invocable and user `/mental`.
- A **tiny always-on rule** — pointer, not the full lifecycle.

Source: [skill/mental/SKILL.md](../skill/mental/SKILL.md) and [rules/mental.mdc](../rules/mental.mdc).

Mental CLI is **not** a todo app. Do not store transcripts. Do not duplicate `PLAN.md`. Create a decision only when it constrains the future — including a rejected approach titled with the words a later agent will search. Attention is residue, not a backlog.

## Mental receipt

Turns that invoked `mental` end with `🧠 **Mental**` then a markdown bullet list: `- emoji **Kind** › *action* › title` (lowercase italic action). Read with no title omits the third slot (`- 🔍 **Read** › *heartbeat*`). Do not wrap with `────────`. Do not emit `</br>`.

```text
🧠 **Mental**
- 📓 **Journal** › *recorded* › Resolver landed
- 🚦 **Attention** › *recorded* › Tom said ship
```

Full table and read-only shape: the skill.

## Agent Plugins 1.0.0

The repo root **is** the plugin root ([spec](https://agent-plugins.org/specification)):

- `plugin.json` — closed manifest
- `skills/mental-setup/` — bootstrap: install the CLI (immediate child of `skills/`)
- `skill/mental/` — full procedure, copied by `mental install` (not plugin-discovered)

Compatible clients (Cursor, VS Code, GitHub Copilot, ChatGPT/Codex, OpenCode, Kiro) load the same directory. Native plugin does **not** start MCP. Rules and hooks stay client-specific and install via `mental install` / `mental hooks on`. Optional MCP is `mental serve` / `mental install --mcp` only.

When **releasing this repo**, git tag `vX.Y.Z`, `package.json`, and `npm view @balacode/mental version` must be the same string. Follow [`.cursor/rules/release.mdc`](../.cursor/rules/release.mdc). [README](../README.md#releasing-this-repo) restates that; the agent install paste does not.

## Optional MCP

Default **off**. Skill + rule are enough for agents that can shell.

```bash
mental serve            # stdio: heartbeat, pulse, where, status, search, list, show, park, handoff, journal, attention, decide, note
mental install --mcp    # register in ~/.cursor/mcp.json + ~/.claude.json
```

MCP is how tool-only agents (parallel sessions, orchestrators) re-pulse and record mid-chat. Tools wrap the same handlers as the CLI. Search/list accept `type` / `status` / `tag` / `kind`. Tool JSON is compact. `mental uninstall` removes only Mental’s MCP entry.

## Optional hooks

```bash
mental hooks on         # Cursor sessionStart + Claude SessionStart/PreCompact → mental status --json
mental hooks off
```

Never Stop auto-journal. The skill + rule remain the real contract — Cursor `additional_context` can drop. Hooks do **not** start or stop a timer.

## Optional time tracking

Default **off**. If heartbeat JSON includes `data.track.enabled`, follow the Mental Track skill. Start with short AI-generated internal and customer-ready title/body when `runningCount` is 0; start twice is ensure-running. At park/handoff/journal, regenerate customer copy from the completed work on that same command. Billable defaults to wall. Ask only when client identity, billable treatment, or safe wording is genuinely ambiguous. Renderer-safe question = one plain-text draft prompt, 2–3 short `{ id, label }` options, `(Recommended)` in the first label, and `allow_multiple: false`; use the host's structured question tool or numbered text fallback. Never invent a start clock or smaller billable duration.

```text
mental track start --title-internal "Auth retry" --body-internal "Tracing retry state." --title-external "Login reliability" --body-external "Improving login retry behavior." --via cursor --json
mental handoff --title "Auth retry fixed" --body "Original error is preserved." --title-external "Improved login reliability" --body-external "Corrected retry handling for consistent login results." --resume "Commit when asked — open loops: none" --via cursor --json
```

What it **cannot** do: reconstruct hours from git, fill a missed `start` from chat, invent a smaller billable duration, or print hours on TTY heartbeat / pulse. Missing customer copy returns structured `review` JSON; generate and amend it before export. Usage "Time tracking is off" is not permission to run `mental option track on`.

Human contract: [What time tracking can and cannot do](./track.md). Agent procedure: [optional/mental-track/SKILL.md](../optional/mental-track/SKILL.md).

## JSON envelope

Stable:

```json
{ "ok": true, "data": { } }
```

```json
{ "ok": false, "error": { "code": "usage", "message": "…" } }
```

When this CLI is behind npm, a sibling is added (omitted when current or skipped):

```json
{ "ok": true, "data": { }, "update": { "current": "0.4.0", "latest": "0.5.0", "hint": "CLI 0.4.0; npm 0.5.0. Run `mental install` or `npm i -g --force @balacode/mental`." } }
```

If `update` is present, tell the user **once this session** and suggest `npm i -g @balacode/mental` then `mental install` then `mental doctor`. Do not block work. Do not put it on the Mental receipt.

`mental doctor` may also warn that a Claude Code / Copilot plugin, or a copied skill, is behind this CLI. That is a second channel: native plugin caches are not refreshed by `mental install`. Suggest the host's plugin update command. Do not block work.

`where` data: `{ root, id, mode, reason, gitRoot }`. Write commands may include `imported` and `indexed` when a leftover `./.mental/` was ingested.
