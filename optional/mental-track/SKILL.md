---
name: mental-track
description: >-
  Optional wall/user time tracking for Mental. Isolated add-on; default off.
  Use only when heartbeat JSON includes data.track.enabled. Never enable
  tracking, never invent hours, never copy internal titles into customer export.
license: MIT
compatibility: Requires Node.js >=18, git, and Mental CLI. Optional; not part of Agent Plugins skills/.
metadata:
  author: Ali Farahat
  version: "0.5.0"
  tags: mental,time-tracking,continuity
user-invocable: true
disable-model-invocation: false
when_to_use: |
  USE WHEN:
  - `mental heartbeat --json` includes `data.track.enabled`.
  - The user asked to start, stop, glance, report, or export hours this turn.

  DO NOT USE WHEN:
  - Tracking is off. Do not run `mental option track on` unless the user named
    track/hours this turn.
  - You would guess a start clock or a duration.
---

# Mental Track — optional hours (CLI-first)

Mental is continuity, not a timesheet. This skill is an **isolated add-on**.
Default **off**. If tracking is off, do nothing and do not suggest enabling it.

Durations: **wall** (sum of in-session elapsed; nights between sessions are not
wall) and **user** (human time inside that wall). Never say "billable". Format
`h:mm`. Minutes are source of truth.

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
mental track stop --all --user h:mm --json
mental track discard --json
mental track report --since YYYY-MM-DD --until YYYY-MM-DD --json
mental track export --external --project <client> --out /path/outside/repo.csv --json
```

`--from` / `--to` are remap/attention, not dates. Use `--since` / `--until`.

## Capture

- `start` without `--task` = new task + interval. `--task` = new interval on that task.
- Many runners allowed. `stop` without `--id` hits the **focused** interval only. If none is focused, usage — do not pick a random runner.
- Heartbeat refreshes `last_seen` on the **focused** timer only. Glance/report are not a ping.
- **Stale** = running and (`now - last_seen` > 2h or `now - started` > 12h). Ask: stop / keep / discard / `--user`. Never invent a stop clock.
- Stale suggested user (`last_seen - started`) is display-only. Apply with `--user h:mm`. `--accept-stale` is TTY-only; `--json` cannot pass it.
- `user` must be `<= wall`. Clean stop defaults `user = wall`.
- **Never started** (`last_seen` ≈ `started`): `mental track discard`. Do not stale-stop into 0:05 of user time.
- Chat-only "I'll start" with no CLI `start` stays a gap. Do not invent `--started` (`--started` is TTY-only).
- Park/handoff stop the focused interval. Other runners stay. If JSON has `timer_stop_failed`, the timer is still running — tell the user.
- `stop --all` from `--json` requires `--user` when any runner is stale or never-started.
- External copy on stop: `title_external` / `body_external` in customer English. Never copy `title_internal`. No ticket slang, no "the agent", no "fixed stuff". `title_external === title_internal` is still internal.

## Export (never git)

- `--out` is required and **outside** the git worktree. Never write `timesheet.csv` in the repo. Never `git add` hours or the export file.
- `--external` **strips columns**: only `title_external`, `body_external`, `project_name`, `started`/`stopped`, `wall`/`user`. Skip `needs_external` rows. Internal export is not for customers.
- A single customer CSV needs `--project <name>`. Ask for a real client name before the first `--external` export (`project_name` is not the git folder).
- Hours live in the Mental store (`time.sqlite`). Never commit them. If `.mental/` is not ignored, tell the user to run `mental doctor`.

## Receipt

Only this skill emits a Time line. Use `title_internal`. Never `title_external`. Never the export filename.

| Kind | Action |
| --- | --- |
| Time | `started` / `stopped` / `exported` / `discarded` |

```text
🧠 **Mental**
- ⏱ **Time** › *started* › Auth callback
```
