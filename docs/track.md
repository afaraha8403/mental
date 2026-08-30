# Optional time tracking

Mental Track is an optional, default-off project-time record. It records **wall** (elapsed while the interval is running), **billable** (what you would invoice), private work detail, and customer-ready descriptions. Billable defaults to wall.

The agent automates the record from context it already has. Start and task-boundary commands carry short internal and customer-ready title/body fields; no extra model call or CLI process is needed. Heartbeat JSON stays compact (ids, stale state, gap state—no titles or hours).

Enable it only if you asked: `mental option track on`. Agents must not turn it on from a usage error or from install/doctor alone.

Hours live in bundle `time.sqlite` (never git, never the search index). TTY `mental` / heartbeat and `pulse` never print hours.

## Enable

```bash
mental option track on
mental track start --title-internal "Auth retry handling" --body-internal "Tracing retry state and error propagation." --title-external "Login reliability improvements" --body-external "Improved login retry behavior and error consistency." --project-name Acme
# work — Cursor, Claude Code, OpenCode, or the TTY; start again is safe
mental handoff --title "Auth retry fixed" --body "Retry preserves the original error." --title-external "Improved login reliability" --body-external "Corrected retry handling so failed login attempts return consistent results." --project-name Acme --resume "Exact next action — open loops: none"
mental track report --since 2026-08-01 --until 2026-08-31
mental track export --external --project Acme --out /tmp/invoice.csv
```

`option track on` is per project UUID. `--all` sets the default for new bindings. The track skill is copied from `optional/mental-track/` when tracking is enabled — not from plugin `skills/`.

Park, handoff, and journal stop the **focused** timer. Other running clocks stay. You do not have to type `track stop` at a hop boundary.

## What it can do

- Clock **this sit-down** as one interval. A new chat or a different host (Cursor, Claude Code, OpenCode, …) does **not** start a second clock. Default `track start` is **ensure-running**: same day and under 12 hours → ping `last_seen` (and amend `--title-internal` if given). Safe to call twice. `--title-internal` is optional (default `Session`).
- **Run several clocks at once.** `track start --new` inserts another interval and focuses it. Ensure-running keeps one continuable runner (the focused one). Extra running rows on **that same task** are closed at `last_seen`. Leftovers that cannot continue (new day / 12h cap) also close at `last_seen`. Other continuable clocks stay.
- Record **wall** and **billable**. Stop (park, handoff, journal, `track stop`) sets **billable = wall** without asking. Optional `--billable` (`--user` is a compatibility alias) records a smaller amount when you specify one (`billable` must be `<= wall`).
- Store private title/body plus a **customer-ready title/body**. The agent generates both from the task, then refreshes the customer copy from the actual outcome when it parks, journals, or hands off. You can steer or replace any wording.
- Label each entry with `project_name`. It defaults to the repository name; the agent uses a client/project name already present in context and asks only when the customer label matters but cannot be inferred.
- Treat a hop shorter than **2 minutes** as a false start (`0:00`). That test is start → now, not “did heartbeat ping `last_seen`?”
- Flag an overnight leftover with `stale_stop` on **explicit** stop and still keep **full wall**. It does not clip billable to `last_seen`.
- When `start` cannot continue (new calendar day, or 12h since `started`), close the leftover at **`last_seen`** (last proof of life), then start a new interval. Nights are not wall.
- Show a **gap**, not invented minutes: heartbeat JSON `track.unclocked` (a hop today with no interval today); report `unclockedCommitDays` (git commit **dates** with no clocked slice).
- Export a dated customer CSV **outside** the git worktree (`--external --project <client> --out /path/outside/repo.csv`). Each row says when the work happened, what was done, wall time, and billable time.
- Share one `time.sqlite` across Cursor, Claude Code, Copilot, Codex, OpenCode, MCP, and the TTY (`--via` is a short host token, never a session id). `--via` on a later start does not split the clock.

## What it cannot do

- **Reconstruct hours from git.** `unclockedCommitDays` lists dates. It does not turn commits into `h:mm`.
- **Guess a start clock or a duration.** Chat-only “I’ll start” with no `track start` stays a gap. `--started` is TTY-only; agents must not invent it.
- **Invent a smaller billable duration.** Billable defaults to wall. The agent changes it only from evidence in the conversation or your instruction.
- **Backfill old rows.** Historical `needs_user` intervals are not silently rewritten.
- **Span months as one timer.** Park, a new calendar day, or 12h since start = new interval. Missed starts stay gaps.
- **Start from hooks.** `mental hooks on` loads `mental status --json` on session start. It does not start or stop a timer. TTY heartbeat does not start a clock. Heartbeat `--json` pings `last_seen` only when the focused runner can still continue (same day, under 12h).
- **Print hours on the pulse.** TTY heartbeat and `pulse` stay a continuity view. Glance and report are `mental track` / `mental track report`.
- **Live in git.** Never `git add` `time.sqlite` or a timesheet export. `mental doctor` exits 3 if hours are git-tracked. `--out` inside the worktree is usage.
- **Replace Mental CLI.** Continuity (resume, decisions, residue) is the product. Track is an isolated add-on. If tracking is off, agents do nothing and do not suggest enabling it.

Minutes are the source of truth; `h:mm` is display. Elapsed time floors to whole minutes, so a hop under 60 seconds stores `0:00`. JSON still includes `user` as a compatibility alias of `billable`; existing databases migrate their prior user-time values into billable.

## Automation and questions

Normal flow asks nothing. The agent generates concise private and customer-ready copy from work already in context, then writes it with the existing start or boundary command. If client identity, billable treatment, or safe customer wording is genuinely ambiguous, the agent asks one focused question.

Questions use the common renderer-safe shape: one `questions[]` item with an `id`, plain-text `prompt`, short `{ id, label }` options, and `allow_multiple: false`. The first label contains `(Recommended)`; no renderer must interpret custom metadata, markdown, tables, or rich controls.

```json
{
  "kind": "customer-copy",
  "interval_ids": ["…"],
  "questions": [{
    "id": "customer-copy-action",
    "prompt": "How should these time entries be prepared for the customer export?",
    "options": [
      { "id": "generate", "label": "Generate and save copy (Recommended)" },
      { "id": "review", "label": "Show generated copy before saving" },
      { "id": "custom", "label": "Enter custom wording" }
    ],
    "allow_multiple": false
  }]
}
```

When showing a generated draft, the agent puts the bounded copy in one plain-text prompt—`Customer copy: "<title>" — <body> Use it?`—and keeps choices short: use generated copy, edit, or regenerate shorter copy. If a host has no structured-question tool, the agent prints the same prompt and numbered choices.

Customer export fails with `needs-customer-copy` instead of writing a partial file. The agent normally handles the recommended generate action automatically; it renders a question only for genuine ambiguity or when you ask to review the draft.

## How a slice works

| Moment | What happens |
| --- | --- |
| Hop begins (tracking on) | `mental track start` (title optional). If a sit-down is already running, this is a ping (`ensured: true`). |
| Another clock | `mental track start --new` starts and focuses a distinct clock. |
| Heartbeat `--json` | Refreshes `last_seen` on the **focused** timer only when it can still continue. Glance, report, and TTY heartbeat are not a ping and do not start a clock. |
| Hop ends | Park, handoff, or journal stops the focused interval. `billable = wall` (stop clock = now). Other runners stay. |
| New start, same day, under 12h | Same interval. Title may change. `--via` stays whoever opened it. Other clocks stay. |
| New start, new day or 12h cap | Previous interval stops at `last_seen`, then a new one starts. |
| Overnight leftover, explicit stop | Stop anyway at **now**. `stale_stop` is a flag. Billable is still full wall, not last_seen. |
| Customer copy | The agent generates `--title-external` and `--body-external` on start, then refreshes them on park, journal, or handoff. |
| `timer_stop_failed` on JSON | The timer is still running. Tell the user. |

`--task <id>` continues slices on an existing task only when glance already shows that id, and only when inserting a **new** interval (not while ensuring). `--new` always opens a new task.

## Glance, report, export

```bash
mental track --json                          # glance (not a focus ping)
mental track report --since YYYY-MM-DD --until YYYY-MM-DD --json
mental track export --external --project Acme --out /tmp/invoice.csv --json
```

`--from` / `--to` are remap/attention, not dates. Use `--since` / `--until`.

Heartbeat `data.track` (when enabled) is compact: ids, stale flags, `unclocked`. No titles, bodies, or hours on that sibling.

## Workspace caveat

Hours attach to the bundle `mental where` resolves from the **git worktree**. A multi-root editor whose cwd is not that repo can glance empty even when another folder in the workspace is clocked. Run track commands from the project root (or pass `--dir`).

## For agents

When `mental heartbeat --json` includes `data.track.enabled`, follow the Mental Track skill. If `runningCount` is 0 (or the runner is stale / another day), start with short AI-generated internal and customer-ready title/body. Start twice is safe. At park/handoff/journal, refresh the customer copy on that same command. Billable defaults to wall; never invent a smaller duration. Ask only on genuine ambiguity and prefer the host's structured question UI. Glance and report are **Read** (`glanced` / `reported`), not Time › exported. JSON `ensured: true` → Time › *ensured*; a new row is Time › *started*.

Source: [optional/mental-track/SKILL.md](../optional/mental-track/SKILL.md).
