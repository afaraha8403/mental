---
name: mental
description: >-
  Maintains a project-continuity log via the Mental CLI. Reconstructs where
  work stands from git, the latest journal handoff, open decisions, and
  attention residue; records why consequential decisions were made; extracts
  residue from a meeting dump or plan-progress question; and leaves an exact
  resume point after substantive work. Use when starting or finishing
  non-trivial repository work, answering project-orientation questions,
  ingesting a transcript into residue (never storing the transcript), or
  recording a decision that git cannot explain.
user-invocable: true
disable-model-invocation: false
version: "1.0.0"
author: "Ali Farahat"
tags: ["continuity", "journal", "decisions", "orientation", "handoff"]
when_to_use: |
  USE WHEN:
  - You begin substantive work in a repository.
  - The user asks any orientation question: "where are we with this project?",
    "where did I leave off?", "what's remaining?", "what did I decide about X?",
    "what did I get done last week?", "what was that plan / where did I get?".
  - The user pastes a meeting transcript or asks "what do I have to get done
    from this?"
  - The user states a concern, "Tom said X", or "park this for later".
  - A substantive task reaches a verified handoff point.
  - A consequential decision is made, deferred, or awaiting user input.

  DO NOT USE WHEN:
  - The turn is trivial or read-only and does not ask for project orientation.
  - The information is already obvious from code, git, or canonical docs.
  - The information is cross-repository, personal, or secret.
---

# Mental — project continuity (CLI-first)

> **Leading words:** derive, do not maintain; task boundary; exact handoff;
> decisions explain git; CLI is the write path; optional, never required.

Mental exists to make a later human or agent session continue without
reconstructing intent from chat history. Git records what changed. Mental
records the small amount git cannot explain: current focus, consequential
decisions and their rationale, durable repository-specific knowledge, attention
residue still in the air after a hop, and the next exact action.

Write for the user returning in two weeks. Be concise, factual, and explicit
about observed versus inferred information.

**OKF markdown is the source of truth.** Agents must call the CLI with `--json`.
Do not grep `.mental`, `~/.mental`, or YAML frontmatter. Humans on a TTY can run `mental` with no args for a one-shot heartbeat (resume, last outcome, git, residue, open decisions). Agents use `mental heartbeat --json` for the same cheap pulse — not `status` unless they need notes.

## Non-goals

- Not a task manager, GTD app, chat transcript store, analytics store, or
  replacement for repository documentation. Never clone a meeting into 40
  todos. Never duplicate a plan file into Mental.
- Not a place to duplicate code, README content, git history, or issue trackers.
- Not a secret store. Never write credentials, tokens, private keys, or sensitive
  user data.
- Not a dependency. Work must continue when Mental is absent, stale, or
  unavailable (fail open).

## Commands (always `--json`)

```text
mental where --json
mental heartbeat --json
mental status --json
mental search "…" --json
mental journal --title "…" --body "…" --resume "…" --against PLAN.md --json
mental attention --title "…" --kind direction --status open --json
mental decide --title "…" --status open --json
mental note --title "…" --json
```

If `mental` is not on PATH, try `npx @mental/cli …`. If that fails, continue
the user's coding task and mention `npm i -g @mental/cli` then `mental install`.

`where` reports `{ root, id, mode, reason, gitRoot }` and may include `imported`
and `indexed` when a leftover project `./.mental/` was ingested into the home
UUID slice. Modes: `env` (MENTAL_DIR), `local` (`./.mental/` after `mental local`),
`home` (`~/.mental/projects/<uuid>/`), `personal` (`~/.mental` when cwd is not a
git repo). Never overlay personal + project trees.

Leftover `./.mental` without the `.mental-local` marker is **normalized** into
`~/.mental/projects/<uuid>/` on first **write** (`install` / `status` / `journal`,
not `where`) (canonical paths + frontmatter) and indexed in sqlite. The leftover
folder stays on disk; writes go to the home slice. Identity is a UUID in
`~/.mental/bindings.json`, not a path and not git origin.

Templates (humans / rare manual repair only): [references/templates.md](references/templates.md).

## Lifecycle

### 1. Orient

Before substantive work:

```text
mental where --json
mental heartbeat --json
```

`heartbeat` is the cheap reload (resume, last outcome, git, residue, unsettled
decisions). Use `mental status --json` when you also need notes. `status`
refreshes `status/current.md` as a disposable cache — not SoT. Never block
work if Mental errors; mention it and continue.

### 2. Record selectively

Create a decision only when a choice changes the project's direction, constrains
future work, or is explicitly deferred:

- `open`: options require a user decision.
- `deferred`: intentionally parked; state what it awaits.
- `decided`: record what was chosen, why, and when.
- `superseded`: preserve the file and link the replacement.

```text
mental decide --title "…" --status open --json
```

**Attention (residue), not journal, not note.** Use when something occupies
working memory after a hop but is not a choice-fork and not a durable fact:

- `kind: direction` — "Tom said X" (optional `--from Tom`)
- `kind: concern` — a worry that would cost a reload if forgotten
- `kind: thread` — an unfinished thread of attention
- `status: open` | `later` | `resolved` — **must resolve**; residue that cannot
  close is a graveyard. Cap ≤7 on the heartbeat. Merge duplicates.

```text
mental attention --title "…" --kind direction --status open --from "Tom" --json
mental attention --title "…" --status resolved --json
```

Create a note only for a durable, non-obvious, repository-specific fact likely
to save future investigation. If deleting the note would not cost future time,
do not write it. Never use `note` for meeting leftovers.

```text
mental note --title "…" --json
```

**Transcript / meeting dump:** extract residue (and 0–2 real decisions). Never
store the transcript in OKF. Never clone 40 todos. If more than 7 items would
cost a reload, keep the 7 costliest-to-forget; the rest stay in the source.

**Plan-progress questions** ("what was that plan / where did I get / what's
left?"): `mental heartbeat --json` (or `status --json`) + read `against` + the
plan file in the repo. Answer from pointer + last handoff + open attention.
Do not copy the plan into Mental.

### 3. Close at a deterministic task boundary

A task boundary occurs when any of these is true:

- A substantive implementation or investigation has been verified and is ready
  for final handoff.
- The user changes topic, pauses, or explicitly asks to stop.
- A consequential decision is made or deliberately deferred.

At the boundary, append **one** journal section (not one per chat turn). If
work was against a plan file, pass `--against`:

```text
mental journal --title "<outcome>" --body "<what changed; evidence; only what git cannot explain>" --resume "<one exact next action> — open loops: <none or list>" --against PLAN.md --json
mental heartbeat --json
```

Skip trivial or read-only turns.

## Orientation responses

When asked where work stands, run `mental heartbeat --json` (add `status --json`
if notes matter) and answer from that evidence:

- Current branch and worktree state
- Latest completed outcome
- Plan pointer (`against`) when set — then read that file; do not invent a backlog
- Residue still in the air (open / later attention)
- Open or deferred decisions
- Active notes (only from `status`)
- Exact resume action

Separate observed facts from inference. Do not recite the entire journal.

## Privacy and safety

- Default store is `~/.mental` (private). Project `./.mental/` exists only after
  the user runs `mental local`.
- Never stage, commit, publish, attach, or quote Mental contents in PRs, issues,
  release notes, code comments, or external messages.
- Never store secrets.
- Never edit `.gitignore`, `.git/info/exclude`, or global git configuration.
  Tell the user to run `mental doctor` (or `mental doctor --fix-ignore`).
- If creating `./.mental/` and `git check-ignore` fails, refuse and point at
  `mental doctor --fix-ignore`.
- Never delete existing concepts without explicit user approval.
- Uninstall must not delete OKF; that requires a typed confirmation the CLI owns.
