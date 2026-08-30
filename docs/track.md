# Optional time tracking

Mental Track is an optional, default-off clock for one sit-down at a time. It records **wall** (elapsed while the interval is running) and sets **user = wall** when the hop stops. It is not a timesheet, not billable hours, and not a reconstruction of the past from git.

Enable it only if you asked: `mental option track on`. Agents must not turn it on from a usage error or from install/doctor alone.

Hours live in bundle `time.sqlite` (never git, never the search index). TTY `mental` / heartbeat and `pulse` never print hours.

## Enable

```bash
mental option track on
mental track start --title-internal "Auth callback"
# work
mental park --resume "Exact next action — open loops: none"
mental track report --since 2026-08-01 --until 2026-08-31
```

`option track on` is per project UUID. `--all` sets the default for new bindings. The track skill is copied from `optional/mental-track/` when tracking is enabled — not from plugin `skills/`.

Park, handoff, and journal stop the focused timer. You do not have to type `track stop` at a hop boundary.

## What it can do

- Clock **this chat / this host / this day** as one interval (a slice). A human “task” is the **sum of slices**, not one timer left running for weeks.
- Keep **one live clock**. A new `track start` stops every running interval first (`user = wall`), then starts the new one.
- Set **user = wall** on every stop (park, handoff, journal, `track stop`). Agents never ask you for `h:mm`. Optional `--user` is only if **you** typed a smaller amount (`user` must be `<= wall`).
- Treat a hop shorter than **2 minutes** as a false start (`0:00`). That test is start → now, not “did heartbeat ping `last_seen`?”
- Flag an overnight leftover with `stale_stop` and still keep **full wall**. It does not clip user to `last_seen`.
- Show a **gap**, not invented minutes: heartbeat JSON `track.unclocked` (a hop today with no interval today); report `unclockedCommitDays` (git commit **dates** with no clocked slice).
- Export a customer CSV **outside** the git worktree (`--external --project <client> --out /path/outside/repo.csv`). Internal titles stay off that file.
- Share one `time.sqlite` across Cursor, Claude Code, Copilot, Codex, OpenCode, MCP, and the TTY (`--via` is a short host token, never a session id).

## What it cannot do

- **Reconstruct hours from git.** `unclockedCommitDays` lists dates. It does not turn commits into `h:mm`.
- **Guess a start clock or a duration.** Chat-only “I’ll start” with no `track start` stays a gap. `--started` is TTY-only; agents must not invent it.
- **Backfill old rows.** Historical `needs_user` intervals are not silently rewritten.
- **Run several clocks at once.** The previous interval is closed when a new one starts.
- **Span months as one timer.** New chat, new host, or new day = new interval. Missed starts stay gaps.
- **Start from hooks.** `mental hooks on` loads `mental status --json` on session start. It does not start or stop a timer. There is no session-end hook that clocks hours.
- **Print hours on the pulse.** TTY heartbeat and `pulse` stay a continuity view. Glance and report are `mental track` / `mental track report`.
- **Call it billable.** Wall and user are elapsed and recorded time. Never “billable.”
- **Live in git.** Never `git add` `time.sqlite` or a timesheet export. `mental doctor` exits 3 if hours are git-tracked. `--out` inside the worktree is usage.
- **Copy internal titles to a customer.** `--external` skips `needs_external` rows. `title_external === title_internal` still counts as internal.
- **Replace Mental CLI.** Continuity (resume, decisions, residue) is the product. Track is an isolated add-on. If tracking is off, agents do nothing and do not suggest enabling it.

Minutes are the source of truth; `h:mm` is display. Elapsed time floors to whole minutes, so a hop under 60 seconds stores `0:00`.

## How a slice works

| Moment | What happens |
| --- | --- |
| Hop begins (tracking on) | `mental track start --title-internal "…"` |
| Heartbeat | Refreshes `last_seen` on the **focused** timer only. Glance and report are not a ping. |
| Hop ends | Park, handoff, or journal stops the focused interval. `user = wall`. |
| New start while one is running | Previous interval stops (`user = wall`), then the new one starts. |
| Overnight leftover | Stop anyway. `stale_stop` is a flag. User is still wall, not last_seen. |
| `timer_stop_failed` on JSON | The timer is still running. Tell the user. |

`--task <id>` continues slices on an existing task only when glance already shows that id.

## Glance, report, export

```bash
mental track --json                          # glance (not a focus ping)
mental track report --since YYYY-MM-DD --until YYYY-MM-DD --json
mental track export --external --project Acme --out /tmp/invoice.csv --json
```

`--from` / `--to` are remap/attention, not dates. Use `--since` / `--until`.

Heartbeat `data.track` (when enabled) is compact: ids, stale flags, `unclocked`. No titles, no hours on that sibling.

## Workspace caveat

Hours attach to the bundle `mental where` resolves from the **git worktree**. A multi-root editor whose cwd is not that repo can glance empty even when another folder in the workspace is clocked. Run track commands from the project root (or pass `--dir`).

## For agents

When `mental heartbeat --json` includes `data.track.enabled`, follow the Mental Track skill. Start at the beginning of substantive work. Never invent minutes. Never ask the human for `h:mm`. Glance and report are **Read** (`glanced` / `reported`), not Time › exported.

Source: [optional/mental-track/SKILL.md](../optional/mental-track/SKILL.md).
