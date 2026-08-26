<p align="center">
  <img src="assets/logo.svg" alt="Mental" width="128" height="128">
</p>

# Mental

[![npm](https://img.shields.io/npm/v/@balacode/mental.svg)](https://www.npmjs.com/package/@balacode/mental)

Local-first continuity layer for you and your coding agents.

Git records **what** changed. Mental records the small amount git cannot explain: where you left off, why a decision was made, what is still in the air after a hop, and the next exact action. **OKF markdown is the source of truth.** SQLite is a derived cache. Agents call `mental … --json` — they do not grep YAML.

- **npm:** [@balacode/mental](https://www.npmjs.com/package/@balacode/mental) — install this; the CLI binary is `mental`
- **Repo:** https://github.com/afaraha8403/mental
- **Spec:** [PLAN.md](./PLAN.md)
- **Plugin standard:** [Agent Plugins 1.0.0](https://agent-plugins.org/specification)

Mental is **not** a Balakit plugin. Default data lives in `~/.mental` (UUID bindings). Project `./.mental` only after `mental local`. The unscoped npm package [`mental`](https://www.npmjs.com/package/mental) is a different project.

## Install

### Paste this into your agent

Copy the block into Cursor, Claude Code, Copilot, Codex, or any other coding agent:

```text
Install Mental from https://github.com/afaraha8403/mental.

Mental is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skill at skills/mental/, MCP at mcp.json.

Use this client's native plugin install if you have one, then put the CLI on PATH and finish setup:

  npm i -g @balacode/mental
  mental install
  mental doctor

Do not enable hooks unless I ask. Optional MCP is `mental install --mcp`. After doctor, tell me what it reports.
```

### Client one-liners

**Cursor** — paste in Agent chat:

```text
/add-plugin https://github.com/afaraha8403/mental
```

**Claude Code:**

```text
/plugin marketplace add afaraha8403/mental
/plugin install mental@mental
```

**VS Code** — Command Palette → **Chat: Install Plugin From Source**, then:

```text
https://github.com/afaraha8403/mental
```

**GitHub Copilot CLI:**

```bash
copilot plugin marketplace add afaraha8403/mental
copilot plugin install mental@mental
```

Plugin install loads the skill and MCP. Still run `mental install` so the CLI, skill, and tiny always-on rule land on this machine.

### CLI

```bash
npm i -g @balacode/mental
mental install
```

Last install wins. That puts `mental` on PATH (typically `~/.local/bin/mental`), copies the skill + tiny always-on rule into `~/.claude`, `~/.cursor`, `~/.agents`, and `~/.config/opencode`, and creates a `~/.mental` skeleton. It also **removes leftover Balakit Mental skill/rule copies** (the old `npx balakit doctor` pointer) so they cannot fight the new rule. It does **not** turn on hooks or MCP, and it does not delete journals.

From a clone, without npm:

```bash
cd /path/to/mental
node bin/cli.mjs install --json
```

```bash
mental doctor          # PATH, bindings, ignore, skills
mental doctor --fix-ignore   # add .mental/ and .mental-id to your global git excludes
```

## Agent Plugins 1.0.0

Mental is packaged as a portable [Agent Plugins](https://agent-plugins.org/) 1.0.0 plugin — the vendor-neutral format maintained by Amazon, Cursor, Microsoft, OpenAI, and Vercel. Compatible clients (Cursor, VS Code, GitHub Copilot, ChatGPT/Codex, Kiro) load the same directory: no per-client rewrite of the skill or MCP server.

The spec's interoperability floor is small and closed:

| Piece | Where | Role |
| --- | --- | --- |
| `plugin.json` | repo root | Manifest (`$schema` + `name`). The portable schema has no icon field. |
| `skills/mental/` | Agent Skills | Procedure: when to journal, CLI contract, privacy. |
| `mcp.json` | repo root | stdio MCP → `./bin/cli.mjs serve` (`cwd` `${PLUGIN_ROOT}`) |

Cursor extras live in `.cursor-plugin/plugin.json` (logo). Claude Code extras live in `.claude-plugin/plugin.json` (`displayName: Mental`) and `.claude-plugin/marketplace.json`. Rules and hooks are **not** portable v1 components — they still come from `mental install` / `mental hooks on`.

Plugin install loads the skill and MCP. The CLI remains the contract: humans type `mental`; agents call `mental … --json`.

## How you use it (human)

On a TTY, in any git repo:

```bash
mental
```

Prints a one-shot **heartbeat** and exits — resume, last outcome, git, residue in the air, unsettled decisions. Not a menu. UUID / root / index live on `where` and `doctor`.

Daily loop:

1. `mental` — where did I leave off?
2. Do the work.
3. At a real task boundary (not every chat turn):

```bash
mental journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next action — open loops: none" --against PLAN.md
```

Lookup:

```bash
mental status          # git + resume + residue + open decisions + notes (writes status/current.md cache)
mental heartbeat --json  # same pulse as `mental` on a TTY; agents use this
mental where           # root, uuid, mode — read-only, does not create identity
mental search overlay
mental list --type Decision --kind direction
mental show notes/some-fact.md
```

Write a decision only when it constrains the future. Write attention for residue that is not a choice (Tom said X, a concern, later):

```bash
mental decide --title "Heartbeat only, no standing TUI" --status decided
mental attention --title "Tom said ship the pointer not the dump" --kind direction --from Tom
mental attention --title "Tom said ship the pointer not the dump" --status resolved
mental note --title "Identity is a UUID in bindings.json"
```

Same `--title` updates the existing decision (paths are identities). `--path` targets a specific file.

Mental is **not** a todo app. Do not store transcripts. Do not duplicate PLAN.md.

Non-TTY (pipes, agents) always pass `--json`. No args + not a TTY prints help and exits 2.

## How agents use it

Always:

```bash
mental where --json
mental heartbeat --json
```

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

Mid-chat, not just start/finish: search decisions before changing an approach, record attention the moment residue surfaces, and re-pulse `mental heartbeat --json` whenever other agents may have written — it is cheap and derives git live.

Do not grep `.mental` or parse YAML. If `mental` is missing, try `npx @balacode/mental …`. If that fails, continue the coding task (fail open) and mention `npm i -g @balacode/mental` then `mental install`.

Turns that invoked `mental` end with `</br>`, title `🧠 Mental  ` (two trailing spaces so chat markdown does not join lines), indented `Kind: Verb` items, then `</br>` (see the skill).

## Identity (UUID, not the folder)

Identity lives in `~/.mental/bindings.json`. Origin is a hint (SSH ≡ HTTPS). Two clones of the same origin share one brain until you split.

| Situation | Command |
| --- | --- |
| This clone should use an existing UUID | `mental remap --to <uuid>` (or `mental link --to <uuid>`) |
| This clone should diverge | `mental split` (`--copy` keeps OKF files) |
| List bindings | `mental remap` |
| Opt in to `./.mental` in this repo | `mental doctor --fix-ignore` then `mental local` |
| Copy home slice into `./.mental` | `mental local --import` |
| Same, and mark store=local | `mental local --move` |

`where` does **not** create a UUID. First write (`status`, `journal`, `install`, …) does. Leftover Balakit `./.mental` (no `.mental-local` marker) is ingested into `~/.mental/projects/<uuid>/` on that write; the leftover folder is not deleted.

## Optional: hooks and MCP

Default **off**. Skill + rule are the contract.

```bash
mental hooks on        # Cursor sessionStart + Claude SessionStart/PreCompact → mental status --json
mental hooks off
mental serve           # MCP stdio: heartbeat, where, status, search, list, show, journal, attention, decide, note
mental install --mcp   # register `mental serve` in ~/.cursor/mcp.json + ~/.claude.json; does not enable hooks
```

MCP is how tool-only agents (parallel sessions, orchestrators) re-pulse and record mid-chat. `mental uninstall` removes the MCP entries too.

```bash
mental uninstall                 # remove skill/rule/hooks copies; ~/.mental stays
mental uninstall --delete-data --confirm DELETE   # wipe ~/.mental too
```

## Commands

| Command | What it does |
| --- | --- |
| `mental` | Heartbeat (TTY): resume, last outcome, git, residue, unsettled decisions; then exit. Non-TTY → help, exit 2 |
| `mental heartbeat` | Same pulse; agents pass `--json` |
| `mental where` | Active bundle: `root`, `id`, `mode`, `reason`, `gitRoot` (read-only) |
| `mental status` | Git + Resume + residue + open/deferred decisions + notes; writes `status/current.md`; first write creates identity |
| `mental search <q>` | Query the derived index (`--type`, `--status`, `--tag`, `--kind`); hits include `description` + `snippet` |
| `mental list` | List concepts (`--type`, `--status`, `--tag`, `--kind`) |
| `mental show <path>` | One OKF file relative to the bundle root (includes `backlinks`) |
| `mental reindex` | Rebuild `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` |
| `mental journal --title --body --resume [--against]` | Append today’s journal section |
| `mental attention --title --kind` | Create or update residue (`--status resolved` closes it) |
| `mental decide --title` | Create or update a decision (`--status decided` closes by title; `--path` targets a file) |
| `mental note --title` | Scaffold a note |
| `mental local [--import \| --move]` | Project `./.mental` after ignore check |
| `mental remap [--to id]` | List or retarget this clone’s UUID |
| `mental split [--copy]` | New UUID for this clone |
| `mental link --to <id>` | Point this clone at an existing UUID |
| `mental install` | User skill + rule; `~/.mental` skeleton; CLI on PATH; `--mcp` registers MCP config |
| `mental uninstall` | Remove installed skill/rule/hooks/MCP entries |
| `mental hooks on\|off` | Optional session hooks |
| `mental serve` | Optional MCP stdio (full command surface) |
| `mental doctor` | PATH, bindings, ignore, skills. `--fix-ignore` adds `.mental/` to global excludes |

Global flags: `--json`, `--dir <path>` (same as `MENTAL_DIR`).

## Privacy

- Default store: `~/.mental/` (never commit).
- Project `.mental/` is opt-in and must be gitignored (`mental doctor --fix-ignore`). Agents must not edit `.gitignore`.
- Never store secrets, tokens, or private keys in Mental files.
- Uninstall does not delete OKF unless you type `DELETE`.

## Tests

```bash
npm test
```

## Layout

OKF files under `~/.mental/projects/<uuid>/` (or `./.mental` after `mental local`):

```text
journal/YYYY-MM-DD.md
decisions/YYYY-MM-DD-slug.md
attention/YYYY-MM-DD-slug.md
notes/slug.md
status/current.md          # disposable cache, not SoT
```

Index: `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` (rebuildable).

Agent Plugin (this repo):

```text
plugin.json                # Agent Plugins 1.0.0 manifest
mcp.json                   # stdio MCP → ./bin/cli.mjs serve
assets/logo.svg            # Cursor logo (portable spec has no icon field)
.cursor-plugin/plugin.json
.claude-plugin/plugin.json # displayName: Mental
skills/mental/SKILL.md
rules/mental.mdc           # Cursor always-on pointer (install copies it)
hooks/session-start.sh     # optional; mental hooks on
```
