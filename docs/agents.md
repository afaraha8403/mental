# Agents

**Agents write Mental on the user's behalf.** After `mental install`, the skill plus the always-on rule tell them when to journal, decide, and record residue. The human does not keep a second journal. They may still type `mental` for the pulse.

The CLI is the contract. Humans type `mental`. Agents call `mental … --json`. They do not grep `.mental`, `~/.mental`, or YAML frontmatter.

This is not a hidden hook and not every chat turn. Hooks stay off until the user asks. Write at a task boundary, when a decision constrains the future, or the moment residue surfaces. Fail open if Mental is missing.

If `mental` is missing, try `npx @balacode/mental …`. If that fails, continue the coding task (fail open) and mention `npm i -g @balacode/mental` then `mental install`.

## Always

```bash
mental where --json
mental heartbeat --json
```

`heartbeat` is the cheap mid-chat reload: resume, last outcome, git, hops today, residue, unsettled + settled (lists capped at 7; counts via `attentionCount` / `openDecisionCount` / `needsEyesCount` / `guardrailCount` / `hopsToday`). Use `mental status --json` when you also need notes. Do not call `pulse` every turn.

If JSON includes `data.track.enabled`, follow the Mental Track skill. If tracking is off, do not enable it. After `mental install` or `mental doctor`, ask about optionals (`needsConsent: true`) with a one-liner each: hooks (session-start status), MCP (`mental serve` for clients that cannot shell the CLI), time tracking (per-project timers). Check whether MCP is needed. Never run `mental option … on` or `install --hooks|--mcp|--track` until the user says yes **this turn**.

### Park vs handoff vs heartbeat vs pulse

| When | Command |
| --- | --- |
| Cheap reload / other agents may have written | `mental heartbeat --json` |
| Interrupted mid-hop / switching context | `mental park --resume "…" --json` |
| Planned task boundary (journal + heartbeat) | `mental handoff --title "…" --resume "…" --json` |
| Cross-project compact overview | `mental pulse --json` |

`park` encodes at an interruption (default title `"Parked"`; optional `--attention` + `--kind`). `handoff` is sugar for journal then heartbeat — both `--title` and `--resume` required. `pulse` returns compact rows from bindings (id, name, resume, counts) — no journal bodies, no merged dump. Heartbeat stays read-only for the pulse watermark; park / handoff / pulse write it after computing since-last-pulse counts.

```bash
mental park --resume "…" --via cursor --json
mental handoff --title "…" --resume "…" --via cursor --json
mental pulse --json
mental journal --title "…" --body "…" --resume "…" --against PLAN.md --via cursor --json
mental attention --title "…" --kind concern --status open --via cursor --json
mental attention --title "…" --kind verify --status open --via cursor --json
mental decide --title "…" --status open --via cursor --json
mental decide --title "…" --status decided --json
mental search "…" --json
mental list --type Decision --status open --json
mental show notes/some-fact.md --json
mental status --json
```

Mid-chat, not just start/finish:

- Search decisions before changing an approach
- Record attention the moment residue surfaces
- Park when interrupted mid-hop; handoff only at a planned close
- Re-call `mental heartbeat --json` whenever other agents may have written — it derives git live. On this repo’s bench machine a CLI heartbeat is **51 ms** p50; in-process (MCP) it is **11 ms**. See [benchmarks](./benchmarks.md).
- Use `pulse` for multi-repo orchestration, not as a per-turn dump

## Skill + rule

`mental install` copies:

- The **skill** — procedure (when to journal, CLI contract, privacy). Model-invocable and user `/mental`.
- A **tiny always-on rule** — pointer, not the full lifecycle.

Source: [skills/mental/SKILL.md](../skills/mental/SKILL.md) and [rules/mental.mdc](../rules/mental.mdc).

Mental is **not** a todo app. Do not store transcripts. Do not duplicate `PLAN.md`. Create a decision only when it constrains the future. Attention is residue, not a backlog.

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
- `skills/mental/` — discovered as an immediate child of `skills/`
- `mcp.json` — stdio `./bin/cli.mjs serve`

Compatible clients (Cursor, VS Code, GitHub Copilot, ChatGPT/Codex, Kiro) load the same directory. Rules and hooks stay client-specific and install via `mental install` / `mental hooks on`.

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

Never Stop auto-journal. The skill + rule remain the real contract — Cursor `additional_context` can drop.

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

If `update` is present, tell the user **once this session** and suggest `mental install`. Do not block work. Do not put it on the Mental receipt.

`mental doctor` may also warn that a Claude Code / Copilot plugin, or a copied skill, is behind this CLI. That is a second channel: native plugin caches are not refreshed by `mental install`. Suggest the host's plugin update command. Do not block work.

`where` data: `{ root, id, mode, reason, gitRoot }`. Write commands may include `imported` and `indexed` when a leftover `./.mental/` was ingested.
