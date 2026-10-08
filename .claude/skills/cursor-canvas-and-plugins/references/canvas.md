# Cursor canvas as skills

Source: `https://cursor.com/docs/agent/tools/canvas`. No developer authoring API is documented there.

## What is documented

- Canvases are interactive artifacts shown beside the chat; the built-in `/canvas` skill produces them.
- They can be saved, reopened, rerun and published as a read-only team link.
- Workflows can be packaged as skills.

## Skill recipe for a reusable canvas

A `SKILL.md` that makes the agent produce the same canvas every time should state:

1. **Trigger**: a description that says when to use it ("dashboard of open PRs", "weekly cost report").
2. **Layout**: sections, charts or tables, ordering, empty states.
3. **Data**: exactly which commands, APIs or queries supply the data, and which fields are read.
4. **Formatting**: units, number formats, colors, accessibility notes.
5. **Safety**: what must never appear (tokens, private URLs) because publishing shares the artifact.

Keep it under 500 lines and move long query catalogs into a `references/` file.

## Unverified (do not state as fact)

A community repository claims canvases are `.canvas.tsx` files importing from `cursor/canvas`. It is not in Cursor's docs. If the user wants that path, tell them it is unofficial and test it in a throwaway project first.
