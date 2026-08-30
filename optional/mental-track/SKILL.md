---
name: mental-track
description: >-
  Optional wall/user time tracking for Mental CLI. Isolated add-on; default off.
  Use only when heartbeat JSON includes data.track.enabled. Never enable
  tracking, never invent hours, never copy internal titles into customer export.
license: MIT
compatibility: Requires Node.js >=18, git, and Mental CLI. Optional; not part of Agent Plugins skills/.
metadata:
  author: Ali Farahat
  version: "0.7.1"
  tags: mental,time-tracking,continuity
user-invocable: true
disable-model-invocation: false
when_to_use: |
  USE WHEN:
  - `mental heartbeat --json` includes `data.track.enabled`.
  - You begin substantive work (start a timer), close a hop (park/handoff/journal
    stop it), or the user asked to glance, report, or export hours this turn.

  DO NOT USE WHEN:
  - Tracking is off. Do not run `mental option track on` unless the user named
    track/hours this turn.
  - You would guess a start clock or a duration.
---

# Mental Track — optional hours (CLI-first)

Mental CLI is continuity, not a timesheet. This skill is an **isolated add-on**.
Default **off**. If tracking is off, do nothing and do not suggest enabling it.

Durations: **wall** (sum of in-session elapsed; nights between sessions are not
wall) and **user** (equals wall on stop; optional `--user` only if the human
typed a smaller amount). Never say "billable". Format `h:mm`. Minutes are
source of truth. An interval is one sit-down (this chat / host / day). A human
task is the sum of slices. Do not invent missing slices.

## Gate

Follow this skill only when `mental heartbeat --json` has `data.track.enabled`.
If that sibling is missing, stop. Usage "Time tracking is off for this project"
is not permission to run `mental option track on`.

## Commands (always `--json`)

```text
mental track --json
mental track start --title-internal "…" --via cursor --json
mental track start --task <id> --title-internal "…" --json
mental track focus --id <id> --json
mental track stop --json
mental track stop --id <id> [--user h:mm] --json
mental track stop --all --json
mental track discard --json
mental track report --since YYYY-MM-DD --until YYYY-MM-DD --json
mental track export --external --project <client> --out /path/outside/repo.csv --json
```

`--from` / `--to` are remap/attention, not dates. Use `--since` / `--until`.
`--via` is a host token (`cursor`, `claude-code`, `copilot`, `codex`, `opencode`,
`mcp`, `cli`), never a session id.

## Capture

- When tracking is on, `track start` at the beginning of substantive work — not
  only when the user asked about hours. New chat, new host, or new day = new
  interval. `--task <id>` only when glance already shows that id; otherwise a
  new task is fine.
- `start` without `--task` = new task + interval. `--task` = new interval on that task.
- A new `start` **stops every running interval** (user = wall), then starts the
  new one. One live clock.
- `stop` without `--id` hits the **focused** interval only. If none is focused, usage — do not pick a random runner.
- Heartbeat refreshes `last_seen` on the **focused** timer only. Glance/report are not a ping.
- Stop (including park, handoff, and journal) sets **user = wall**. Never ask the
  human for `h:mm`. Never invent a duration. `--user` is optional override only
  when the human typed it this turn. `user` must be `<= wall`. `--accept-stale`
  is TTY-only; `--json` cannot pass it.
- **Stale** = running and (`now - last_seen` > 2h or `now - started` > 12h).
  Stop anyway; `stale_stop` is a flag, not a prompt. Do not clip user to last_seen.
- Short wall (< 2 minutes) is a false start (0:00), not `last_seen ≈ started`.
- Chat-only "I'll start" with no CLI `start` stays a gap. Do not invent `--started` (`--started` is TTY-only).
- Park, handoff, and journal stop the focused interval. If JSON has `timer_stop_failed`, the timer is still running — tell the user.
- Heartbeat `data.track.unclocked` is true when there was a hop today and no
  interval today. Mention the gap; do not fill it with guessed minutes.
- Report `unclockedCommitDays` lists git commit dates with no clocked interval.
  Days, not hours. Do not convert commits into `h:mm`.
- External copy on stop: `title_external` / `body_external` in customer English. Never copy `title_internal`. No ticket slang, no "the agent", no "fixed stuff". `title_external === title_internal` is still internal.

## Export (never git)

- `--out` is required and **outside** the git worktree. Never write `timesheet.csv` in the repo. Never `git add` hours or the export file.
- `--external` **strips columns**: only `title_external`, `body_external`, `project_name`, `started`/`stopped`, `wall`/`user`. Skip `needs_external` rows. Internal export is not for customers.
- A single customer CSV needs `--project <name>`. Ask for a real client name before the first `--external` export (`project_name` is not the git folder).
- Hours live in the Mental store (`time.sqlite`). Never commit them. If `.mental/` is not ignored, tell the user to run `mental doctor`.

## Receipt

Only this skill emits a Time line. Use `title_internal`. Never `title_external`. Never the export filename. Glance and report are **Read**, not Time › exported.

| Kind | Action |
| --- | --- |
| Time | `started` / `stopped` / `exported` / `discarded` |
| Read | `glanced` / `reported` (plus heartbeat / pulse from the core skill) |

```text
🧠 **Mental**
- ⏱ **Time** › *started* › Auth callback
```
