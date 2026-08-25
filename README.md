# Mental

Local-first continuity layer for you and your coding agents.

Git records **what** changed. Mental records the small amount git cannot explain: where you left off, why a decision was made, and the next exact action. **OKF markdown is the source of truth.** SQLite is a derived cache. Agents call `mental … --json` — they do not grep YAML.

- **Repo:** https://github.com/afaraha8403/mental
- **Spec:** [PLAN.md](./PLAN.md)

Mental is **not** a Balakit plugin. Default data lives in `~/.mental` (UUID bindings). Project `./.mental` only after `mental local`.

Not on npm yet. Do not publish until the maintainer asks.

## Install (this machine)

From a clone of this repo:

```bash
cd /path/to/mental
node bin/cli.mjs install --json
```

That puts `mental` on PATH (typically `~/.local/bin/mental`), copies the skill + tiny always-on rule into `~/.claude`, `~/.cursor`, and `~/.agents`, and creates a `~/.mental` skeleton. It does **not** turn on hooks or MCP.

```bash
mental doctor          # PATH, bindings, ignore, skills
mental doctor --fix-ignore   # add .mental/ and .mental-id to your global git excludes
```

After `@mental/cli` is published: `npm i -g @mental/cli` then `mental install` (last install wins).

## How you use it (human)

On a TTY, in any git repo:

```bash
mental
```

Prints a one-shot **heartbeat** and exits — resume, last outcome, git, open decisions. Not a menu. UUID / root / index live on `where` and `doctor`.

Daily loop:

1. `mental` — where did I leave off?
2. Do the work.
3. At a real task boundary (not every chat turn):

```bash
mental journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next action — open loops: none"
```

Lookup:

```bash
mental status          # git + resume + open decisions + notes (writes status/current.md cache)
mental where           # root, uuid, mode — read-only, does not create identity
mental search overlay
mental list --type Decision
mental show notes/some-fact.md
```

Write a decision only when it constrains the future:

```bash
mental decide --title "Heartbeat only, no standing TUI" --status decided
mental note --title "Identity is a UUID in bindings.json"
```

Non-TTY (pipes, agents) always pass `--json`. No args + not a TTY prints help and exits 2.

## How agents use it

Always:

```bash
mental where --json
mental status --json
```

```bash
mental journal --title "…" --body "…" --resume "…" --json
mental decide --title "…" --status open --json
mental search "…" --json
```

Do not grep `.mental` or parse YAML. If `mental` is missing, continue the coding task (fail open) and mention install.

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
mental serve           # MCP stdio: where, status, search, show, journal
mental install --mcp   # print a mcpServers snippet; does not enable hooks
```

```bash
mental uninstall                 # remove skill/rule/hooks copies; ~/.mental stays
mental uninstall --delete-data --confirm DELETE   # wipe ~/.mental too
```

## Commands

| Command | What it does |
| --- | --- |
| `mental` | Heartbeat (TTY): resume, last outcome, git, open decisions; then exit. Non-TTY → help, exit 2 |
| `mental where` | Active bundle: `root`, `id`, `mode`, `reason`, `gitRoot` (read-only) |
| `mental status` | Git + Resume + open/deferred decisions + notes; writes `status/current.md`; first write creates identity |
| `mental search <q>` | Query the derived index (`--type`, `--status`, `--tag`) |
| `mental list` | List concepts |
| `mental show <path>` | One OKF file relative to the bundle root |
| `mental reindex` | Rebuild `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` |
| `mental journal --title --body --resume` | Append today’s journal section |
| `mental decide --title` | Scaffold a decision |
| `mental note --title` | Scaffold a note |
| `mental local [--import \| --move]` | Project `./.mental` after ignore check |
| `mental remap [--to id]` | List or retarget this clone’s UUID |
| `mental split [--copy]` | New UUID for this clone |
| `mental link --to <id>` | Point this clone at an existing UUID |
| `mental install` | User skill + rule; `~/.mental` skeleton; CLI on PATH |
| `mental uninstall` | Remove installed skill/rule/hooks |
| `mental hooks on\|off` | Optional session hooks |
| `mental serve` | Optional MCP stdio |
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
notes/slug.md
status/current.md          # disposable cache, not SoT
```

Index: `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` (rebuildable).
