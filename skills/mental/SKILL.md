---
name: mental
description: >-
  Local-first continuity CLI for coding agents (Cursor, Claude Code, Copilot,
  Codex, MCP). Maintains a project-continuity log via the Mental CLI.
  Reconstructs where work stands from git, the latest journal handoff, open
  decisions, and attention residue; records why consequential decisions were
  made; extracts residue from a meeting dump or plan-progress question; and
  leaves an exact resume point after substantive work. Use when starting or
  finishing non-trivial repository work, answering project-orientation
  questions, ingesting a transcript into residue (never storing the
  transcript), or recording a decision that git cannot explain.
license: MIT
compatibility: Requires Node.js >=18 and git. Bundled MCP launches ./bin/cli.mjs serve. Agent Plugins 1.0.0 + Agent Skills.
metadata:
  author: Ali Farahat
  version: "1.0.0"
  tags: continuity,coding-agents,mcp,agent-skills,cursor,claude-code,copilot,journal,decisions,handoff,local-first
user-invocable: true
disable-model-invocation: false
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
  - Mid-task: you are about to change an approach, residue surfaces, or other
    agents may have written since you oriented.

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
Do not grep `.mental`, `~/.mental`, or YAML frontmatter. Humans on a TTY can run `mental` with no args for a one-shot heartbeat (resume, last outcome, git, residue, open decisions). Agents use `mental heartbeat --json` for the same cheap reload — not `status` unless they need notes. Do not call `pulse` every turn or dump journals into context.

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
mental pulse --json
mental status --json
mental search "…" --json
mental list --type Decision --json
mental show <path> --json
mental park --resume "…" --via cursor --json
mental handoff --title "…" --resume "…" --via cursor --json
mental journal --title "…" --body "…" --resume "…" --against PLAN.md --via cursor --json
mental attention --title "…" --kind direction --status open --via cursor --json
mental attention --title "…" --kind verify --status open --via cursor --json
mental decide --title "…" --status open --via cursor --json
mental decide --title "…" --status decided --via cursor --json
mental note --title "…" --json
```

## Mental receipt (end of turn)

If you invoked `mental` this turn, end the **user-visible** reply with this block.
Last thing in the message. Not a code fence (so emojis and markdown render).
Skip the whole block if you did not run `mental`.

Use a **markdown bullet list** so Cursor stacks items. Do not wrap with
`────────`, markdown `---`, `<br>`, or `</br>`. Do not put two items on one
line. At most four items; if more, keep the writes and end with `+N more`.

Shape: `🧠 **Mental**` then `- emoji **Kind** › *action* › title`.
Read with no title omits the third slot: `- 🔍 **Read** › *heartbeat*`.

Actions (lowercase, italic):

| Kind | Action |
| --- | --- |
| Journal, Note | `recorded` |
| Attention | `recorded` / `resolved` |
| Decision | `opened` / `decided` |
| Read | `heartbeat` / `pulse` / `searched` / `showed` / `listed` |

Titles only — no `file://` or markdown links. Mental files live in `~/.mental`,
not this repo, so links would 404. The CLI tool card already has the path.

**Writes (copy this shape):**

```text
🧠 **Mental**
- 📓 **Journal** › *recorded* › Resolver landed
- 🚦 **Attention** › *recorded* › Tom said ship
- 🎯 **Decision** › *decided* › Keep the JSON envelope
```

**Read-only (heartbeat / pulse / search / show / list):**

```text
🧠 **Mental**
- 🔍 **Read** › *heartbeat*
```

**Read with a third slot:** `- 🔍 **Read** › *searched* › receipt type` or
`- 🔍 **Read** › *showed* › decisions/…md` or `- 🔍 **Read** › *listed* › Decision`.

Mix writes and a read in one block if both happened. Never invent Mental activity.

If `mental` is not on PATH, try `npx @balacode/mental …`. If that fails, continue
the user's coding task and mention `npm i -g @balacode/mental` then `mental install`.

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

Heartbeat shows hops today, Needs eyes (`verify`), In the air, Unsettled, and
Settled (newest decided titles, cap 7). Lists capped at 7; counts via
`attentionCount` / `openDecisionCount` / `needsEyesCount` / `guardrailCount` /
`hopsToday`. Extra open decisions: `mental list --type Decision --status open
--json`. Use `mental status --json` when you also need notes.
`status` refreshes `status/current.md` as a disposable cache — not SoT. Never
block work if Mental errors; mention it and continue.

**Continuity commands (when, not every turn):**

- **`park --resume`** — mid-hop / switching context. Encodes at an interruption
  (default journal title `"Parked"`). Optional `--attention` + `--kind` (and
  `--from`, `--against`). Requires `--resume`. Not a planned close.
- **`handoff --title --resume`** — planned task boundary: journal then
  heartbeat. Both flags required. Sugar for journal + heartbeat.
- **`pulse`** — multi-repo orchestration: compact rows from bindings (id, name,
  resume, attentionCount, openDecisionCount). No journal bodies, no merged
  dump. Not a per-turn reload — that stays `heartbeat`.

### 2. Record selectively

Create a decision only when a choice changes the project's direction, constrains
future work, or is explicitly deferred:

- `open`: options require a user decision.
- `deferred`: intentionally parked; state what it awaits.
- `decided`: record what was chosen, why, and when.
- `superseded`: preserve the file and link the replacement.

```text
mental decide --title "…" --status open --json
mental decide --title "…" --status decided --json
```

Same `--title` updates the existing file (paths are identities). `--path` targets a specific file.

**Attention (residue), not journal, not note.** Use when something occupies
working memory after a hop but is not a choice-fork and not a durable fact:

- `kind: direction` — "Tom said X" (optional `--from Tom`)
- `kind: concern` — a worry that would cost a reload if forgotten
- `kind: thread` — an unfinished thread of attention
- `kind: verify` — agent produced this; human has not looked. Resolve when
  reviewed (accepted or rejected). Not a review queue. Cap still 7; verify
  sorts first on the heartbeat ("Needs eyes").
- `status: open` | `later` | `resolved` — **must resolve**; residue that cannot
  close is a graveyard. Cap ≤7 on the heartbeat. Merge duplicates.

On every write, pass `--via cursor` (or `claude-code`, `copilot`, `codex`,
`mcp`, `cli`). Short client token only. Never a session id, email, URL, path,
or machine name.

```text
mental attention --title "…" --kind direction --status open --from "Tom" --via cursor --json
mental attention --title "…" --kind verify --status open --via cursor --json
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

### Mid-chat re-entry (between orient and close)

Mental is not only a start/finish ritual. Step back in cheaply whenever:

- **Structured lookup** — open decisions, residue of a kind, a status:
  `mental list --type Decision --status open --json` (or `--kind direction`).
  Do not search and do not grep YAML for field filters.
- **Approach change** — before abandoning or switching an approach,
  `mental search "…" --json` then `mental show <path> --json` for the hit
  (backlinks are on `show`). Also `mental list --type Decision --json`.
  If the switch constrains the future, record it with `mental decide` at once.
- **Residue surfaces** — "Tom said X", a worry, "park this": record
  `mental attention` **now**, not at handoff. Chat memory fades; the OKF file
  does not.
- **Parallel agents** — other sessions share the same home slice. If time
  passed or another agent may have written, re-call `mental heartbeat --json`
  before acting on stale assumptions. It derives git live and costs little.
- **Switching / interruption** — context hop mid-task: `mental park --resume
  "…" --json` (optional `--attention` + `--kind`). Planned close is `handoff`,
  not park.
- **Cross-project** — orchestrating several repos: `mental pulse --json` once
  for compact rows. Do not dump journals. Stay on `heartbeat` inside one repo.
- **"Why is it like this?"** — `mental search "…" --json`, then `show` the
  path; a decision or note may already hold the answer. Follow `backlinks`
  instead of grepping.

Reads are always safe. Writes stay selective: mid-chat re-entry does not change
what deserves a decision, attention item, or note. Never auto-journal every
turn; hooks stay off by default.

### 3. Close at a deterministic task boundary

A task boundary occurs when any of these is true:

- A substantive implementation or investigation has been verified and is ready
  for final handoff.
- The user changes topic, pauses, or explicitly asks to stop.
- A consequential decision is made or deliberately deferred.

At the boundary, append **one** journal section (not one per chat turn). Prefer
the sugar when you only need title + resume:

```text
mental handoff --title "<outcome>" --resume "<one exact next action> — open loops: <none or list>" --json
```

Or journal then heartbeat (same idea; use `--against` when work pointed at a
plan):

```text
mental journal --title "<outcome>" --body "<what changed; evidence; only what git cannot explain>" --resume "<one exact next action> — open loops: <none or list>" --against PLAN.md --json
mental heartbeat --json
```

Interrupted mid-hop (topic change, pause, switch) without a planned close:
`mental park --resume "…" --json`. Skip trivial or read-only turns.

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
