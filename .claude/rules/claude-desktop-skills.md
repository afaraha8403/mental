# Claude Desktop build skills (repo-local)

When the task is to create or debug something for Claude Desktop, read the matching skill before writing code:

| Build a... | Skill |
| --- | --- |
| Mod (JS module in Claude Code: hooks, panes, UI) | `.claude/skills/claude-desktop-mods/SKILL.md` |
| Plugin (skills, commands, agents, hooks, MCP/LSP; requirements, publishing) | `.claude/skills/claude-desktop-plugins/SKILL.md` |
| Extension (`.mcpb` local MCP server bundle) | `.claude/skills/claude-desktop-extensions/SKILL.md` |

A mod is a plugin plus a module; start with the plugins skill when unsure.

## Maintaining them

- `.agents/skills/` is canonical; `.claude/skills/` is its mirror. After editing, run `node scripts/sync-project-skills.mjs`; `npm test` fails on drift.
- Repo-only: never add `.agents` or `.claude` to `package.json` `files`, and never move them into `skills/` (that autoloads with the Mental plugin).
- Re-verify facts against `https://code.claude.com/docs/llms.txt` before changing them.
