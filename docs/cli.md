# CLI reference

After `mental install`, **agents write on your behalf** (journal, decisions, residue). You type `mental` when you want the pulse yourself. Agents always pass `--json`. Named commands are one-shot: print or write, then exit.

```bash
mental                 # heartbeat on a TTY; help + exit 2 otherwise
mental -h              # Daily commands
mental --help          # all commands, grouped
mental heartbeat --json
mental where --json
mental schema --json
```

Non-TTY (pipes, agents) with no args prints help and exits 2. `mental --json` with no command is a heartbeat.

## Global flags

| Flag | Meaning |
| --- | --- |
| `--json` | `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message", "hint?" } }`. Optional sibling `update` when npm is ahead |
| `--dir <path>` | Override resolve (same as `MENTAL_DIR`) |
| `-h` | Short Daily help |
| `--help` | Full grouped usage. After a command: that command’s help (examples first) |
| `-v`, `--version` | Print version |
| `--plain`, `--no-color` | No emoji / ANSI (also `NO_COLOR` any non-empty, `TERM=dumb`) |

`MENTAL_ASCII=1` strips emoji from TTY output. `--json` is always ASCII. `MENTAL_SKIP_UPDATE_CHECK=1` skips the npm newest-version check. When npm is ahead, every `--json` envelope includes a sibling `update` (`current`, `latest`, `hint`) from a 7-day cache — ordinary commands never `npm view` on every call. TTY prints the same hint. `doctor` / `install` still check live.

## Commands

| Command | What it does |
| --- | --- |
| `mental` | Heartbeat (TTY): resume, last outcome, git, hops today, residue, unsettled + settled; then exit |
| `mental heartbeat` | Same cheap reload; agents pass `--json`. Read-only — does not write the pulse watermark. Delta is counts only. `hopsToday` is parks since local midnight |
| `mental pulse` | Cross-project compact rows from `bindings.json` (id, name, resume, attentionCount, openDecisionCount). No journal bodies. Writes watermark for the active bundle |
| `mental where` | Active bundle: `root`, `id`, `mode`, `reason`, `gitRoot` (read-only; does not create identity) |
| `mental status` | Git + resume + residue + open/deferred decisions + notes; writes `status/current.md`; first write creates identity |
| `mental search <q>` | Query the derived index (`--type`, `--status`, `--tag`, `--kind`, `--any`); journal hops as `path#HH:MM`; JSON includes `tokens` + `op` |
| `mental list` | List concepts (`--type`, `--status`, `--tag`, `--kind`) |
| `mental show <path>` | One OKF file relative to the bundle root (includes `backlinks`) |
| `mental reindex` | Rebuild `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` |
| `mental park --resume` | Encode at an interruption (default title `"Parked"`). Optional `--attention` + `--kind` (and `--from`, `--against`, `--via`). Requires `--resume`. Then heartbeat; writes watermark |
| `mental handoff --title --resume` | Planned boundary: journal then heartbeat. Both flags required. JSON `{ path, heartbeat }`. Writes watermark. `--via` optional |
| `mental journal --title --body --resume [--against] [--via]` | Append today’s journal section. `--resume` is required (same as park/handoff) |
| `mental schema [command]` | Dump the command catalog as JSON (`mental schema heartbeat --json` for one command) |
| `mental completion bash\|zsh\|fish` | Print a completion script (do not auto-write shell rc files) |
| `mental attention --title --kind` | Create or update residue (`direction` \| `concern` \| `thread` \| `verify`; `--status resolved` closes it). `--via` optional |
| `mental decide --title --body` | Create or update a decision. Create requires `--body` (the why). Same `--title` without `--body` updates; `--status decided` closes by title; `--path` targets a file. `--via` optional |
| `mental note --title` | Scaffold a note |
| `mental local [--import \| --move]` | Project `./.mental` after ignore check |
| `mental remap [--to id]` | List or retarget this clone’s UUID |
| `mental split [--copy]` | New UUID for this clone (`mental new` is an alias) |
| `mental link --to <id>` | Point this clone at an existing UUID |
| `mental install` | User skill + rule; `~/.mental` skeleton; CLI on PATH; `--mcp` registers MCP; `--hooks` / `--track` only after the user says yes this turn. JSON includes `optionals[]` (`needsConsent: true`) |
| `mental uninstall` | Remove installed skill / rule / hooks / MCP / mental-track copies |
| `mental option` | List or set optional features (`track` per UUID; `mcp` / `hooks` user-global). `--all` sets track default on. `--this` before a UUID is usage |
| `mental track` | Optional wall/user timers (off until `option track on`). `start` / `stop` / `focus` / `discard` / `report` / `export`. Export `--out` must be outside the git worktree |
| `mental hooks on\|off` | Optional session hooks (default off; alias of `option hooks`) |
| `mental serve` | Optional MCP stdio (session verbs: heartbeat, journal, park, …). Identity/setup stay CLI |
| `mental doctor` | PATH, bindings, ignore, skills, npm update, host plugin / skill-copy lag, decision budget, stale residue, `optionals[]`, `time.sqlite` never git-tracked (exit 3). `--fix-ignore` adds `.mental/` to global excludes. `--days <n>` overrides the 14-day stale threshold (warn only; exit 0 if only warns). `MENTAL_SKIP_HOST_PLUGIN_CHECK=1` skips host CLIs. |

## Writes

Same `--title` updates the existing decision or attention file (paths are identities). `--path` targets a specific file.

```bash
mental journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next action — open loops: none" --against PLAN.md --via cursor
mental decide --title "Heartbeat only, no standing TUI" --body "Default TTY mental prints a one-shot heartbeat and exits." --status decided --via cursor
mental attention --title "Tom said ship the pointer not the dump" --kind direction --from Tom --via cursor
mental attention --title "Resolver tests not reviewed" --kind verify --via cursor
mental attention --title "Tom said ship the pointer not the dump" --status resolved
mental note --title "Identity is a UUID in bindings.json"
```

Journal contract (one section per task, not per chat turn):

```text
## HH:MM — <outcome>
<what changed, evidence, decisions git cannot explain>

Against: <optional repo-relative plan>
Resume: <one exact next action> — open loops: <none or list>
```

## Lookup

```bash
mental status
mental heartbeat --json
mental where
mental search overlay
mental list --type Decision --kind direction
mental show notes/some-fact.md
```

Typed filters (`--type`, `--status`, `--tag`, `--kind`) apply before the result cap. Search uses SQLite FTS5 with bm25 when Node’s `node:sqlite` includes FTS5; otherwise it uses SQLite LIKE (or a markdown scan if sqlite is missing). Title matches rank above buried body mentions; Decision/Note rank above Journal. Space-separated words are AND prefixes (`overlay leftover` must match both) unless `--any` (OR). Quotes are shell glue, not a phrase operator. JSON includes `tokens` and `op`. Journal hops index as `journal/YYYY-MM-DD.md#HH:MM`. Search one concept per query; before proposing an approach, search that name. MCP `q` may be a string array (union).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | resolve / not-found / unknown command |
| 2 | usage (missing flags, unknown flags) or non-TTY no args without `--json` |
| 3 | `doctor` found error-level problems (`ok: false` in JSON; warn-only stays `ok: true`) |

## Layout

OKF files under `~/.mental/projects/<uuid>/` (or `./.mental` after `mental local`):

```text
journal/YYYY-MM-DD.md
decisions/YYYY-MM-DD-slug.md
attention/YYYY-MM-DD-slug.md
notes/slug.md
status/current.md          # disposable cache, not SoT
time.sqlite                # optional hours (off until `mental option track on`; never git)
```

Index: `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` (rebuildable). Hours are **not** in the index — they live in bundle `time.sqlite`.

Optional timers: `mental option track on` then `mental track start --title-internal "…"`. Export `--out` must be outside the git worktree. TTY heartbeat and pulse never show hours.
Pulse watermark: `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.pulse.json` (`{ at: iso }` — rebuildable, not SoT). Written after delta by `pulse` / `park` / `handoff`; **heartbeat never writes it**.

Heartbeat lists (attention and open decisions) are capped at 7; JSON includes `attentionCount` / `openDecisionCount`. Extra open decisions: `mental list --type Decision --status open`.

See [identity](./identity.md) for UUID / local / leftover import, and [agents](./agents.md) for the `--json` contract.
