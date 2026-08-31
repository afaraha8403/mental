---
name: mental-track
description: >-
  Optional wall/billable time tracking for Mental CLI. Isolated add-on; default off.
  Use only when heartbeat JSON includes data.track.enabled. Never enable
  tracking, never invent hours, never copy internal titles into customer export.
license: MIT
compatibility: Requires Node.js >=18, git, and Mental CLI. Optional; not part of Agent Plugins skills/.
metadata:
  author: Ali Farahat
  version: "0.8.1"
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

Mental Track is a lightweight project-time record inside Mental CLI. This skill
is an **isolated add-on**, default **off**. If tracking is off, do nothing and
do not suggest enabling it.

Durations: **wall** (sum of in-session elapsed; nights between sessions are not
wall) and **billable** (equals wall on stop; optional `--billable` only if the
human typed a smaller amount). `--user` is an alias of `--billable`. Format
`h:mm`. Minutes are source of truth. An interval is one sit-down. A new chat
or host is **not** a new interval. Park, a new calendar day, or 12h since
start is. A human task is the sum of slices. Do not invent missing slices.

Keep the CLI cheap: one start command, one boundary command, compact heartbeat.
Generate short metadata from context already in the conversation; do not run a
separate research pass. Internal title: specific work in progress. Internal
body: one sentence of implementation detail. Customer title: 3–10 plain-English
words (80 characters max). Customer body: one sentence describing the useful
outcome (180 characters max).

## Gate

Follow this skill only when `mental heartbeat --json` has `data.track.enabled`.
If that sibling is missing, stop. Usage "Time tracking is off for this project"
is not permission to run `mental option track on`.

## Commands (always `--json`)

```text
mental track --json
mental track start --via cursor --json
mental track start --title-internal "…" --body-internal "…" --title-external "…" --body-external "…" --via cursor --json
mental track start --new --title-internal "…" --title-external "…" --json
mental track start --task <id> --title-internal "…" --json
mental track focus --id <id> --json
mental track stop --json
mental track stop --id <id> [--billable h:mm] --json
mental track stop --all --json
mental track discard --json
mental track report --since YYYY-MM-DD --until YYYY-MM-DD --json
mental track export --external --project <client> --out /path/outside/repo.csv --json
mental handoff --title "…" --body "…" --title-external "…" --body-external "…" --resume "…" --via cursor --json
```

`--from` / `--to` are remap/attention, not dates. Use `--since` / `--until`.
`--via` is a host token (`cursor`, `claude-code`, `copilot`, `codex`, `opencode`,
`mcp`, `cli`), never a session id.

## Capture

- When tracking is on, `track start --via <host>` after heartbeat if
  `runningCount` is 0 (or the runner is another day / past 12h). Not only when
  the user asked about hours. Generate and pass internal + customer title/body
  from the current task. Do not ask for wording by default. Calling start again
  the same sit-down is **ensure-running**
  (`ensured: true`): ping, maybe amend title, same `started`. Do not fear a
  second start. `--new` starts another clock when the user starts distinct
  simultaneous work or explicitly asks for another clock.
- New chat or host is not a new interval. Park, a new calendar day, or 12h
  since `started` is. `--task <id>` only when inserting a new interval and glance
  already shows that id. `--new` ignores `--task` (new task).
- `start` without `--task` on a **new** interval = new task. `--task` is
  ignored while ensuring.
- `stop` without `--id` hits the **focused** interval only. If none is focused, usage — do not pick a random runner.
- Heartbeat `--json` refreshes `last_seen` on the **focused** timer only when it
  can still continue (same day, under 12h). Glance/report/TTY heartbeat are not
  a ping and do not start a clock.
- Stop (including park, handoff, and journal) sets **billable = wall** at **now**.
  This is the automatic default, so do not ask about minutes on every hop.
  Use `--billable` only when the user supplied a smaller amount or the conversation
  clearly says some time is non-billable. `billable` must be `<= wall`.
  `--accept-stale` is TTY-only; `--json` cannot pass it.
- **Stale** (glance) = running and (`now - last_seen` > 2h or `now - started` > 12h).
  Explicit stop still uses now; `stale_stop` is a flag, not a prompt. Do not clip
  billable to last_seen on park/stop.
- When `start` cannot continue, it closes the leftover at **`last_seen`**, then
  starts a new interval. Extra running rows on the ensured task also close at
  `last_seen`. Other continuable clocks stay.
- Short wall (< 2 minutes) is a false start (0:00), not `last_seen ≈ started`.
- Chat-only "I'll start" with no CLI `start` stays a gap. Do not invent `--started` (`--started` is TTY-only).
- Park, handoff, and journal stop the focused interval. Other runners stay. If JSON has `timer_stop_failed`, the timer is still running — tell the user.
- Heartbeat `data.track.unclocked` is true when there was a hop today and no
  interval today. Mention the gap; do not fill it with guessed minutes.
- Report `unclockedCommitDays` lists git commit dates with no clocked interval.
  Days, not hours. Do not convert commits into `h:mm`.
- At a park, journal, or handoff, regenerate `--title-external` /
  `--body-external` from the work actually completed and pass them on that same
  command. The user may steer wording at any time. Never copy `title_internal`
  verbatim. No ticket slang, implementation trivia, "the agent", or "fixed
  stuff". `title_external === title_internal` still counts as internal.
- `project_name` defaults to the repository name. Use a client/project name
  already present in context; ask only when the customer label matters and
  cannot be inferred.
- If command JSON includes `review.kind: "customer-copy"`, generate the missing
  copy and run `track amend --id …`. `review.questions` already uses the
  common host-renderer shape: one question with `id`, `prompt`, short
  `{ id, label }` options, and `allow_multiple: false`. Pass that shape to the
  host's native structured-question tool when user input is needed; otherwise
  handle the recommended generate action automatically.

## Renderer-safe questions

Ask only when client identity, billable treatment, or safe customer wording
cannot be inferred. Use one single-select question at a time. Keep the draft in
the prompt, never in option labels:

```text
prompt: Customer copy: "<title>" — <body> Use it?
options:
- Use generated copy (Recommended)
- Edit generated copy
- Regenerate shorter copy
allow_multiple: false
```

Keep option labels under 40 characters. Put `(Recommended)` in the first label
instead of a custom metadata field. Do not require markdown, tables, rich text,
multi-select, or host-specific controls. If no structured-question tool exists,
print the same prompt and numbered options as plain text. The user's free-text
reply always overrides the draft.

## Export (never git)

- `--out` is required and **outside** the git worktree. Never write `timesheet.csv` in the repo. Never `git add` hours or the export file.
- `--external` **strips columns**: only date, customer title/body, project, started/stopped, wall, and billable. Export fails with structured `needs-customer-copy` review instead of writing a partial customer file. Internal export is not for customers.
- `--project <name>` filters an export to rows previously recorded with that
  `project_name`. Omit it for the current project's complete customer export.
- Hours live in the Mental store (`time.sqlite`). Never commit them. If `.mental/` is not ignored, tell the user to run `mental doctor`.

## Receipt

Only this skill emits a Time line. Use `title_internal`. Never `title_external`. Never the export filename. Glance and report are **Read**, not Time › exported. JSON `ensured: true` is *ensured*, not *started*.

| Kind | Action |
| --- | --- |
| Time | `started` / `ensured` / `stopped` / `exported` / `discarded` |
| Read | `glanced` / `reported` (plus heartbeat / pulse from the core skill) |

```text
🧠 **Mental**
- ⏱ **Time** › *started* › Auth callback
```
