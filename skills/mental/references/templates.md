# `.mental/` file templates

Minimal templates for project continuity. Substitute `<...>` placeholders.
`type` is required; `timestamp` is the last-updated time in ISO-8601. Use links
relative to the file containing them.

Agents must not fill these by hand-editing YAML. Run `mental journal`,
`mental decide`, `mental note`, and `mental status` (with `--json`).

## Bundle skeleton

```text
.mental/                      # project-local (only after `mental local`)
# or ~/.mental/projects/<uuid>/
├── index.md
├── status/current.md
├── decisions/
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
_Derived <date> from journal tail + git + open decisions + notes. Stale? Re-derive._

## Now
<current focus, one or two factual sentences>

## In flight
<branch, PR, and uncommitted work observed in git; write "None" when clean>

## Open decisions
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

## Context
<why this choice matters and what constraint forced it>

## Options
- <option A> — <tradeoff>
- <option B> — <tradeoff>

## Outcome
<For open: what input is needed. For deferred: what it awaits. For decided:
what was chosen, why, and when. For superseded: link the replacement.>
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
