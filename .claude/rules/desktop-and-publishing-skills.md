# Copilot / Cursor / OpenCode build and publishing skills (repo-local)

Read the matching skill before writing code or running a release step:

| Task | Skill |
| --- | --- |
| Copilot desktop extension: `extension.mjs`, canvases, tools (no MCP needed) | `.claude/skills/copilot-desktop-extensions/SKILL.md` |
| Cursor UI (VS Code extension on Open VSX), plugin, rules, skills; canvas is not a mod (no MCP needed) | `.claude/skills/cursor-extensions-and-plugins/SKILL.md` |
| OpenCode plugin (v1 hooks, v2 server/TUI) | `.claude/skills/opencode-plugins/SKILL.md` |
| Release or publish Mental: npm, Claude, Cursor, Copilot, Codex, OpenCode | `.claude/skills/publishing-mental-to-stores/SKILL.md` |

**Mod scope.** We only care about desktop apps with a Claude Desktop-style mod mechanism (extends the app's own UI). Today: Claude Desktop mods (no MCP), Copilot desktop canvases (no MCP, `@experimental`), Codex Plugin Extensions (needs MCP). Cursor has no mod equivalent yet (Canvas is agent output; VS Code extensions are a separate editor route); revisit later. OpenCode plugins are server or terminal only, not a desktop mod.

Key facts: Copilot has no central store, only marketplace repos. OpenCode has no official publish page. Codex public submission needs a remote MCP server, which Mental lacks.

## Maintaining them

- `.agents/skills/` is canonical. `.claude/skills/` is a mirror. After editing, run `node scripts/sync-project-skills.mjs`; tests fail on drift.
- Repo-only. Never add `.agents` or `.claude` to `package.json` `files`, and never move them into `skills/`.
- Never tag, release, publish or submit without the user's explicit go-ahead. Release rules: `.claude/rules/release.md`.
- Re-verify against the primary docs cited in each skill before changing facts.
