# CLI reference

After `mental install`, **agents write on your behalf** (journal, decisions, residue). You type `mental` when you want the pulse yourself. Agents always pass `--json`. Named commands are one-shot: print or write, then exit.

```bash
mental                 # heartbeat on a TTY; help + exit 2 otherwise
mental heartbeat --json
mental where --json
```

Non-TTY (pipes, agents) with no args prints help and exits 2.

## Global flags

| Flag | Meaning |
| --- | --- |
| `--json` | `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message" } }` |
| `--dir <path>` | Override resolve (same as `MENTAL_DIR`) |
| `-h`, `--help` | Usage |
| `-v`, `--version` | Print version |

`MENTAL_ASCII=1` strips emoji from TTY output. `--json` is always ASCII. `MENTAL_SKIP_UPDATE_CHECK=1` skips the npm newest-version check (`doctor` / `install` only — heartbeat never checks).

## Commands

| Command | What it does |
| --- | --- |
| `mental` | Heartbeat (TTY): resume, last outcome, git, hops today, residue, unsettled + settled; then exit |
| `mental heartbeat` | Same cheap reload; agents pass `--json`. Read-only — does not write the pulse watermark. Delta is counts only. `hopsToday` is parks since local midnight |
| `mental pulse` | Cross-project compact rows from `bindings.json` (id, name, resume, attentionCount, openDecisionCount). No journal bodies. Writes watermark for the active bundle |
| `mental where` | Active bundle: `root`, `id`, `mode`, `reason`, `gitRoot` (read-only; does not create identity) |
| `mental status` | Git + resume + residue + open/deferred decisions + notes; writes `status/current.md`; first write creates identity |
| `mental search <q>` | Query the derived index (`--type`, `--status`, `--tag`, `--kind`); hits include `description` + `snippet` |
| `mental list` | List concepts (`--type`, `--status`, `--tag`, `--kind`) |
| `mental show <path>` | One OKF file relative to the bundle root (includes `backlinks`) |
| `mental reindex` | Rebuild `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite` |
| `mental park --resume` | Encode at an interruption (default title `"Parked"`). Optional `--attention` + `--kind` (and `--from`, `--against`, `--via`). Requires `--resume`. Then heartbeat; writes watermark |
| `mental handoff --title --resume` | Planned boundary: journal then heartbeat. Both flags required. JSON `{ path, heartbeat }`. Writes watermark. `--via` optional |
| `mental journal --title --body --resume [--against] [--via]` | Append today’s journal section |
| `mental attention --title --kind` | Create or update residue (`direction` \| `concern` \| `thread` \| `verify`; `--status resolved` closes it). `--via` optional |
| `mental decide --title` | Create or update a decision (`--status decided` closes by title; `--path` targets a file). `--via` optional |
| `mental note --title` | Scaffold a note |
| `mental local [--import \| --move]` | Project `./.mental` after ignore check |
| `mental remap [--to id]` | List or retarget this clone’s UUID |
| `mental split [--copy]` | New UUID for this clone (`mental new` is an alias) |
| `mental link --to <id>` | Point this clone at an existing UUID |
| `mental install` | User skill + rule; `~/.mental` skeleton; CLI on PATH; `--mcp` registers MCP |
| `mental uninstall` | Remove installed skill / rule / hooks / MCP entries |
| `mental hooks on\|off` | Optional session hooks (default off) |
| `mental serve` | Optional MCP stdio (full command surface) |
| `mental doctor` | PATH, bindings, ignore, skills, npm update, decision budget, stale residue. `--fix-ignore` adds `.mental/` to global excludes. `--days <n>` overrides the 14-day stale threshold (warn only; exit 0 if only warns) |

## Writes

Same `--title` updates the existing decision or attention file (paths are identities). `--path` targets a specific file.

```bash
mental journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next action — open loops: none" --against PLAN.md --via cursor
mental decide --title "Heartbeat only, no standing TUI" --status decided --via cursor
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

Typed filters (`--type`, `--status`, `--tag`, `--kind`) apply before the result cap. Search uses SQLite FTS5 with bm25 when Node’s `node:sqlite` includes FTS5; otherwise it uses SQLite LIKE (or a markdown scan if sqlite is missing). Title matches rank above buried body mentions either way.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | usage or resolve error |
| 2 | no TTY, no args — help printed |
| 3 | `doctor` found problems (still prints JSON) |

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
Pulse watermark: `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.pulse.json` (`{ at: iso }` — rebuildable, not SoT). Written after delta by `pulse` / `park` / `handoff`; **heartbeat never writes it**.

Heartbeat lists (attention and open decisions) are capped at 7; JSON includes `attentionCount` / `openDecisionCount`. Extra open decisions: `mental list --type Decision --status open`.

See [identity](./identity.md) for UUID / local / leftover import, and [agents](./agents.md) for the `--json` contract.
