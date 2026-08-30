# `.mental/` file templates

Minimal templates for project continuity. Substitute `<...>` placeholders.
`type` is required; `timestamp` is the last-updated time in ISO-8601. Use links
relative to the file containing them.

Agents must not fill these by hand-editing YAML. Run `mental journal`,
`mental attention`, `mental decide`, `mental note`, and `mental status` (with `--json`).

## Bundle skeleton

```text
.mental/                      # project-local (only after `mental local`)
# or ~/.mental/projects/<uuid>/
├── index.md
├── status/current.md
├── decisions/
├── attention/
├── journal/
└── notes/
```

Create `index.md` and `status/current.md` from the templates below; leave the
other directories empty until meaningful concepts exist. Existing optional
directories from earlier versions remain valid user data; never delete them
automatically.

## `index.md` (bundle entry point)

```markdown
---
type: Status
title: <Project> — .mental index
description: Entry point and navigation for this repo's .mental bundle.
tags: [index]
timestamp: <ISO-8601>
status: active
---

# <Project> — mental index

Private continuity log for <repo>. Start at
[current status](status/current.md).

- [Status](status/current.md) — disposable snapshot derived from live evidence
- [Journal](journal/) — concise outcomes and exact handoffs
- [Decisions](decisions/) — consequential choices and rationale
- [Attention](attention/) — residue still in the air after a hop
- [Notes](notes/) — durable facts that prevent repeat investigation
```

## `status/current.md`

```markdown
---
type: Status
title: Current status
description: Derived "you are here" snapshot — regenerate, don't hand-edit.
tags: [status]
timestamp: <ISO-8601>
status: active
---

# Status — <project>
_Derived <date> from journal tail + git + residue + decisions + notes. Stale? Re-derive._

## Now
<current focus, one or two factual sentences>

## In flight
<branch, PR, and uncommitted work observed in git; write "None" when clean>

Against <PLAN.md>

## In the air
- [<title>](../attention/<file>.md) — direction
- None

## Later
- [<title>](../attention/<file>.md) — thread
- None

## Unsettled
- [<title>](../decisions/<file>.md) — open
- [<title>](../decisions/<file>.md) — deferred: <what it awaits>

## Notes
- [<title>](../notes/<slug>.md) — <one-line fact>
- None

## ▶ Resume point
<one exact next action copied from the latest journal Resume line>
```

## `journal/<YYYY-MM-DD>.md`

```markdown
---
type: Journal
title: Journal — <YYYY-MM-DD>
description: Work log for <YYYY-MM-DD>.
tags: [journal]
timestamp: <ISO-8601>
status: active
---

# <YYYY-MM-DD>

## HH:MM — <outcome>
<what changed, evidence of completion, consequential decisions, and only context
git cannot explain>

Against: <optional repo-relative plan path, e.g. PLAN.md>

Resume: <one exact next action> — open loops: <none or concise list>
```

Append one section per coherent substantive task. The last line of every section
must be its `Resume:` line.

## `decisions/<YYYY-MM-DD>-<slug>.md`

```markdown
---
type: Decision
title: <Decision title>
description: <one-line summary>
tags: [<topic>]
timestamp: <ISO-8601>
status: open        # open → deferred → decided → superseded
resource: <optional link to PR/code/discussion>
---

# <Decision title>

The CLI writes this heading plus `--body`. It does not fill the scaffold below.
Empty placeholder files are a bug. Create requires `--body`.

## Context
<why this choice matters and what constraint forced it>

## Options
- <option A> — <tradeoff>
- <option B> — <tradeoff>

## Outcome
<For open: what input is needed. For deferred: what it awaits. For decided:
what was chosen, why, and when. For superseded: link the replacement.>
```

## `attention/<YYYY-MM-DD>-<slug>.md`

Residue still occupying working memory after a hop. Not a decision (no options).
Not a note (not a durable fact). Not a todo. Body is 2–8 lines of why forgetting
it would cost a reload. No checklist.

```markdown
---
type: Attention
title: <short residue>
description: <one-line summary>
tags: []
timestamp: <ISO-8601>
status: open        # open | later | resolved
kind: direction     # direction | concern | thread | verify
from: <optional person>
against: <optional repo-relative path, e.g. PLAN.md>
via: <optional short client token, e.g. cursor>
---

# <short residue>

<Why this would cost a reload if forgotten. No checklist.>
```

## `notes/<slug>.md`

```markdown
---
type: Note
title: <Fact title>
description: <one-line summary>
tags: [<topic>]
timestamp: <ISO-8601>
status: active
resource: <optional link to the code this describes>
---

# <Fact title>

<The durable, non-obvious, repository-specific fact and the evidence supporting
it. Link related concepts with paths relative to this file.>
```
