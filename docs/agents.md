# Agents

The CLI is the contract. Humans type `mental`. Agents call `mental … --json`. They do not grep `.mental`, `~/.mental`, or YAML frontmatter.

If `mental` is missing, try `npx @balacode/mental …`. If that fails, continue the coding task (fail open) and mention `npm i -g @balacode/mental` then `mental install`.

## Always

```bash
mental where --json
mental heartbeat --json
```

`heartbeat` is the cheap reload: resume, last outcome, git, residue, unsettled decisions. Use `mental status --json` when you also need notes.

```bash
mental journal --title "…" --body "…" --resume "…" --against PLAN.md --json
mental attention --title "…" --kind concern --status open --json
mental decide --title "…" --status open --json
mental decide --title "…" --status decided --json
mental search "…" --json
mental list --type Decision --json
mental show notes/some-fact.md --json
mental status --json
```

Mid-chat, not just start/finish:

- Search decisions before changing an approach
- Record attention the moment residue surfaces
- Re-pulse `mental heartbeat --json` whenever other agents may have written — it derives git live. On this repo’s bench machine a CLI pulse is **51 ms** p50; in-process (MCP) it is **11 ms**. See [benchmarks](./benchmarks.md).

## Skill + rule

`mental install` copies:

- The **skill** — procedure (when to journal, CLI contract, privacy). Model-invocable and user `/mental`.
- A **tiny always-on rule** — pointer, not the full lifecycle.

Source: [skills/mental/SKILL.md](../skills/mental/SKILL.md) and [rules/mental.mdc](../rules/mental.mdc).

Mental is **not** a todo app. Do not store transcripts. Do not duplicate `PLAN.md`. Create a decision only when it constrains the future. Attention is residue, not a backlog.

## Mental receipt

Turns that invoked `mental` end with a separator line (`────────`), title `🧠 Mental  ` (two trailing spaces so chat markdown does not join lines), indented `Kind: Verb` items, then `────────`. Do not emit `</br>` — it prints as literal tags.

```text
────────
🧠 Mental  
  🚦 Attention: Recorded  “Tom said ship”
  📓 Journal: Recorded  “Resolver landed”
────────
```

Full table and read-only shape: the skill.

## Agent Plugins 1.0.0

The repo root **is** the plugin root ([spec](https://agent-plugins.org/specification)):

- `plugin.json` — closed manifest
- `skills/mental/` — discovered as an immediate child of `skills/`
- `mcp.json` — stdio `./bin/cli.mjs serve`

Compatible clients (Cursor, VS Code, GitHub Copilot, ChatGPT/Codex, Kiro) load the same directory. Rules and hooks stay client-specific and install via `mental install` / `mental hooks on`.

## Optional MCP

Default **off**. Skill + rule are enough for agents that can shell.

```bash
mental serve            # stdio: heartbeat, where, status, search, list, show, journal, attention, decide, note
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

`where` data: `{ root, id, mode, reason, gitRoot }`. Write commands may include `imported` and `indexed` when a leftover `./.mental/` was ingested.
