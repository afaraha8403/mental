# ChatGPT / Codex desktop build skills (repo-local)

When the task is to create or debug something for the ChatGPT desktop app (formerly Codex), read the matching skill before writing code:

| Build a... | Skill |
| --- | --- |
| UI ("mod"-like): sidebar/thread/file/settings apps, MCP Apps, mentions, forms | `.claude/skills/codex-desktop-extensions/SKILL.md` |
| Plugin (manifest, marketplace, hooks, workspace publish, submission) | `.claude/skills/codex-desktop-plugins/SKILL.md` |
| Skill (SKILL.md, `agents/openai.yaml`, activation tests) | `.claude/skills/codex-desktop-skills/SKILL.md` |

There is no JS-injection mod system; the official UI path is Plugin Extensions (MCP Apps). Explodex injection is unofficial and macOS-only.

## Maintaining them

- `.agents/skills/` is canonical; `.claude/skills/` is its mirror. After editing, run `node scripts/sync-project-skills.mjs`; tests fail on drift.
- Repo-only: never add `.agents` or `.claude` to `package.json` `files`, and never move them into `skills/`.
- Re-verify facts against `https://developers.openai.com/llms.txt` and `https://github.com/openai/mcp-extensions` before changing them.
